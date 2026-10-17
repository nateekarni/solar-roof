import {documentPdfFilename} from '../documents/document-number.js';
import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { MailerService } from '../mailer/mailer.service.js';
const mailer = new MailerService();
import {localFinancialBinding} from './local-financial-policy.js';
export interface FrozenRecipient { id:string; email:string; name?:string; }
export function originalArtifactHash(job:{pdf_bytes:Buffer;sha256:string;content_hash:string;artifact_sha256?:string}):string {
 const hash=createHash('sha256').update(job.pdf_bytes).digest('hex');
 if(job.pdf_bytes.subarray(0,5).toString()!=='%PDF-' || hash!==job.sha256 || hash!==job.content_hash || (job.artifact_sha256!==undefined && hash!==job.artifact_sha256))throw new ConflictException('เอกสารต้นฉบับตรวจสอบความถูกต้องไม่ผ่าน / Original artifact integrity check failed');
 return hash;
}
export function frozenRecipients(job:any):FrozenRecipient[] {
 const recipients=job.document_type==='contract'?job.snapshot?.deliveryRecipients:job.snapshot?.recipients;
 if(!Array.isArray(recipients)||!recipients.length||recipients.some(r=>!r?.id||!r?.email)||new Set(recipients.map(r=>r.id)).size!==recipients.length)throw new ConflictException('ไม่มีผู้รับเอกสารที่ยืนยันไว้ กรุณาติดต่อผู้ดูแลเพื่อออกสัญญาที่เลือกบัญชีผู้รับ / No frozen verified recipient. Ask an administrator to configure site recipient accounts.');
 return recipients;
}
const deliveryAuditId=(jobId:string,phase:string)=>createHash('sha256').update(`financial-delivery:${jobId}:${phase}`).digest('hex').slice(0,32).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5');
async function deliveryTransaction(client:PoolClient,work:()=>Promise<void>){
 await client.query('BEGIN');try{await work();await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}
}
async function deliveryIntent(client:PoolClient,job:any,actorId?:string){
 await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`financial-delivery-audit:${job.id}`]);
 // audit_events is a hypertable keyed by (id, occurred_at); serialize per delivery before append.
 await client.query(`INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,after_json,reason,correlation_id) SELECT $1,$2,'finance.send_started','document_delivery',$3,$4,$5,$6 WHERE NOT EXISTS(SELECT 1 FROM audit_events WHERE id=$1)`,[deliveryAuditId(job.id,'started'),actorId??null,job.id,JSON.stringify({documentId:job.document_id,artifactHash:job.sha256,recipientIds:frozenRecipients(job).map(r=>r.id)}),job.state==='sent'?'Delivery audit reconciliation':'Financial document delivery',`financial-delivery:${job.id}`]);
}
async function completeDelivery(client:PoolClient,job:any,actorId?:string){
 await deliveryTransaction(client,async()=>{
  await deliveryIntent(client,job,actorId);
  // Replays retain the actor recorded before SMTP, even when another actor completes recovery.
  await client.query(`INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,after_json,reason,correlation_id) SELECT $1,a.actor_id,'finance.send','document_delivery',$2,$3,'Financial document delivered',$4 FROM audit_events a WHERE a.id=$5 AND NOT EXISTS(SELECT 1 FROM audit_events WHERE id=$1)`,[deliveryAuditId(job.id,'completed'),job.id,JSON.stringify({documentId:job.document_id,artifactHash:job.sha256,recipientIds:frozenRecipients(job).map(r=>r.id)}),`financial-delivery:${job.id}`,deliveryAuditId(job.id,'started')]);
  if(job.state!=='sent')await client.query("UPDATE financial_delivery_outbox SET state='sent',completed_at=now(),last_error=NULL WHERE id=$1",[job.id]);
 });
}
/** Same immutable attachment, retry budget and uncertain-SMTP handling for every document type. */
export async function deliverSavedArtifacts(client:PoolClient,jobs:any[],actorId?:string):Promise<void> {
 for(const job of jobs){
  if(job.state==='sent'){await completeDelivery(client,job,actorId);continue;}
  const confirmed=frozenRecipients(job).every(recipient=>job.delivered_user_ids?.includes(recipient.id));
  if(job.state==='sending'&&confirmed){originalArtifactHash(job);await completeDelivery(client,job,actorId);continue;}
  if(['sending','uncertain'].includes(job.state))throw new ConflictException('SMTP outcome uncertain; reconcile capture before retry');
  if(job.attempts>=5)throw new ConflictException('Local capture retry budget exhausted; staff reconciliation required');
  const test=job.snapshot?.policy?.scope==='TEST'||job.snapshot?.syntheticTest===true;
  if(test&&!localFinancialBinding())throw new ConflictException('Local mail capture binding required');
  originalArtifactHash(job);
  const recipients=frozenRecipients(job);
  // Check the whole frozen set before sending the first message.
  for(const recipient of recipients){
   const contract=job.document_type==='contract';
   const eligible=(await client.query(contract?`SELECT u.id FROM users u JOIN site_account_assignments sa ON sa.user_id=u.id AND sa.revoked_at IS NULL JOIN sites s ON s.id=sa.site_id JOIN customers sc ON sc.id=s.customer_id JOIN contracts c ON c.site_id=s.id WHERE c.id=$1 AND s.id=$4 AND u.id=$2 AND u.role='customer_user' AND u.status='active' AND sc.status='active' AND u.email=$3 AND u.email_verified_at IS NOT NULL AND u.verified_email=u.email`:`SELECT u.id FROM users u JOIN site_account_assignments sa ON sa.user_id=u.id AND sa.revoked_at IS NULL JOIN sites s ON s.id=sa.site_id JOIN customers sc ON sc.id=s.customer_id JOIN site_billing_settings cfg ON cfg.site_id=s.id WHERE s.id=$4 AND u.id=$2 AND u.id=ANY(cfg.recipient_user_ids) AND u.role='customer_user' AND u.status='active' AND sc.status='active' AND u.email=$3 AND u.email_verified_at IS NOT NULL AND u.verified_email=u.email AND $1::text IS NOT NULL`,[contract?job.contract_id:job.site_id,recipient.id,recipient.email,job.site_id])).rows[0];
   if(!eligible){await client.query("UPDATE financial_delivery_outbox SET state='failed',last_error='Selected recipient is no longer verified or scoped' WHERE id=$1",[job.id]);throw new ConflictException('ผู้รับไม่ได้ยืนยันอีเมลหรืออยู่นอกองค์กร กรุณาติดต่อผู้ดูแล / Selected recipient is no longer verified or scoped');}
  }
  await deliveryTransaction(client,async()=>{await deliveryIntent(client,job,actorId);await client.query("UPDATE financial_delivery_outbox SET state='sending',attempts=attempts+1 WHERE id=$1",[job.id]);});
  for(const recipient of recipients){
   if(job.delivered_user_ids?.includes(recipient.id))continue;
   const messageId=`<financial-${job.id}-${recipient.id}@solar-platform.invalid>`;
   await client.query('UPDATE financial_delivery_outbox SET message_id=$2 WHERE id=$1',[job.id,messageId]);

   try{
    const result=await mailer.sendMail({from:process.env.SMTP_FROM??'local-financial@solar-platform.invalid',to:recipient.email,messageId,subject:`${test?'TEST ':''}${job.document_number}`,text:test?'Synthetic local document workflow test. Saved original attached.':'Your issued document is attached.',attachments:[{filename:documentPdfFilename(job.document_number),content:job.pdf_bytes,contentType:'application/pdf'}]});
    if(!result.accepted?.map((email:string)=>email.toLowerCase()).includes(recipient.email.toLowerCase()))throw Object.assign(new Error('SMTP recipient rejected'),{code:'ERECIPIENT'});
   }catch(error){
    const e=error as Error&{code?:string;responseCode?:number};const safe=['ECONNREFUSED','ERECIPIENT','EAUTH','EDNS'].includes(e.code??'')||Boolean(e.responseCode&&e.responseCode>=400);
    await client.query('UPDATE financial_delivery_outbox SET state=$2,last_error=$3 WHERE id=$1',[job.id,safe?'failed':'uncertain',e.message]);throw error;
   }
   // Failure after SMTP acceptance leaves sending, stopping unsafe retries.
   await client.query('UPDATE financial_delivery_outbox SET delivered_user_ids=array_append(delivered_user_ids,$2::uuid) WHERE id=$1',[job.id,recipient.id]);
  }
  await completeDelivery(client,job,actorId);
 }
}
