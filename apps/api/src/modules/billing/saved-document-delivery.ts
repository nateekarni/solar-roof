import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import nodemailer from 'nodemailer';
import type { PoolClient } from 'pg';
export interface FrozenRecipient { id:string; email:string; name?:string; }
export function originalArtifactHash(job:{pdf_bytes:Buffer;sha256:string;content_hash:string;artifact_sha256?:string}):string {
 const hash=createHash('sha256').update(job.pdf_bytes).digest('hex');
 if(job.pdf_bytes.subarray(0,5).toString()!=='%PDF-' || hash!==job.sha256 || hash!==job.content_hash || (job.artifact_sha256!==undefined && hash!==job.artifact_sha256))throw new ConflictException('เอกสารต้นฉบับตรวจสอบความถูกต้องไม่ผ่าน / Original artifact integrity check failed');
 return hash;
}
export function frozenRecipients(job:any):FrozenRecipient[] {
 const recipients=job.document_type==='contract'?job.snapshot?.deliveryRecipients:job.snapshot?.recipients;
 if(!Array.isArray(recipients)||!recipients.length||recipients.some(r=>!r?.id||!r?.email)||new Set(recipients.map(r=>r.id)).size!==recipients.length)throw new ConflictException('ไม่มีผู้รับเอกสารที่ยืนยันไว้ กรุณาติดต่อผู้ดูแลเพื่อออกสัญญาที่เลือกบัญชีผู้รับ / No frozen verified recipient. Ask an administrator to issue a contract with selected recipient accounts.');
 return recipients;
}
/** Same immutable attachment, retry budget and uncertain-SMTP handling for every document type. */
export async function deliverSavedArtifacts(client:PoolClient,jobs:any[]):Promise<void> {
 for(const job of jobs){
  if(job.state==='sent')continue;
  if(['sending','uncertain'].includes(job.state))throw new ConflictException('SMTP outcome uncertain; reconcile capture before retry');
  if(job.attempts>=5)throw new ConflictException('Local capture retry budget exhausted; staff reconciliation required');
  originalArtifactHash(job);
  const recipients=frozenRecipients(job);
  // Check the whole frozen set before sending the first message.
  for(const recipient of recipients){
   const contract=job.document_type==='contract';
   const eligible=(await client.query(`SELECT u.id FROM users u JOIN sites s ON s.school_id=u.school_id JOIN schools sc ON sc.id=s.school_id JOIN contracts c ON c.site_id=s.id WHERE c.id=$1 AND s.id=$4 AND u.id=$2 ${contract?'':'AND u.id=ANY(c.recipient_user_ids)'} AND u.role='school_user' AND u.status='active' AND sc.status='active' AND u.email=$3 AND u.email_verified_at IS NOT NULL AND u.verified_email=u.email`,[contract?job.contract_id:job.snapshot.customer.id,recipient.id,recipient.email,job.site_id])).rows[0];
   if(!eligible){await client.query("UPDATE financial_delivery_outbox SET state='failed',last_error='Selected recipient is no longer verified or scoped' WHERE id=$1",[job.id]);throw new ConflictException('ผู้รับไม่ได้ยืนยันอีเมลหรืออยู่นอกองค์กร กรุณาติดต่อผู้ดูแล / Selected recipient is no longer verified or scoped');}
  }
  await client.query("UPDATE financial_delivery_outbox SET state='sending',attempts=attempts+1 WHERE id=$1",[job.id]);
  for(const recipient of recipients){
   if(job.delivered_user_ids?.includes(recipient.id))continue;
   const messageId=`<financial-${job.id}-${recipient.id}@solar-platform.invalid>`;
   await client.query('UPDATE financial_delivery_outbox SET message_id=$2 WHERE id=$1',[job.id,messageId]);
   const transport=nodemailer.createTransport({host:'127.0.0.1',port:11049,secure:false,connectionTimeout:5000,socketTimeout:10000});
   try{
    const result=await transport.sendMail({from:process.env.SMTP_FROM??'local-financial@solar-platform.invalid',to:recipient.email,messageId,subject:`TEST ${job.document_number}`,text:'Synthetic local document workflow test. Saved original attached.',attachments:[{filename:`${job.document_number}.pdf`,content:job.pdf_bytes,contentType:'application/pdf'}]});
    if(!result.accepted?.map((email:string)=>email.toLowerCase()).includes(recipient.email.toLowerCase()))throw Object.assign(new Error('SMTP recipient rejected'),{code:'ERECIPIENT'});
   }catch(error){
    const e=error as Error&{code?:string;responseCode?:number};const safe=['ECONNREFUSED','ERECIPIENT','EAUTH','EDNS'].includes(e.code??'')||Boolean(e.responseCode&&e.responseCode>=400);
    await client.query('UPDATE financial_delivery_outbox SET state=$2,last_error=$3 WHERE id=$1',[job.id,safe?'failed':'uncertain',e.message]);throw error;
   }finally{transport.close();}
   // Failure after SMTP acceptance leaves sending, stopping unsafe retries.
   await client.query('UPDATE financial_delivery_outbox SET delivered_user_ids=array_append(delivered_user_ids,$2::uuid) WHERE id=$1',[job.id,recipient.id]);
  }
  await client.query("UPDATE financial_delivery_outbox SET state='sent',completed_at=now(),last_error=NULL WHERE id=$1",[job.id]);
 }
}
