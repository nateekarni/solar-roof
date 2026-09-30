import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import nodemailer from 'nodemailer';
import { DatabaseService } from '../../database/database.service.js';
import { ensureDocumentArtifact } from '../documents/document-artifact.js';
import { retryAt, settingValue } from './automation-policy.js';

export async function queueDocumentDelivery(client:PoolClient,documentId:string) {
 await client.query(`INSERT INTO financial_delivery_outbox(id,document_id) VALUES($1,$2) ON CONFLICT(document_id,purpose) DO NOTHING`,[randomUUID(),documentId]);
}
export async function staffNotice(client:PoolClient,key:string,siteId:string|null,kind:string,detail:unknown) {
 await client.query(`INSERT INTO financial_staff_notices(id,dedupe_key,site_id,kind,detail) VALUES($1,$2,$3,$4,$5) ON CONFLICT(dedupe_key) DO NOTHING`,[randomUUID(),key,siteId,kind,JSON.stringify(detail)]);
}
export interface FinancialMail { to:string;subject:string;messageId:string;bytes:Buffer;filename:string; }
export type FinancialSender=(mail:FinancialMail)=>Promise<void>;
export const smtpFinancialSender:FinancialSender=async mail=>{
 if(!process.env.SMTP_HOST || !process.env.SMTP_FROM)throw Object.assign(new Error('SMTP_HOST and SMTP_FROM are required'),{code:'ECONFIG'});
 const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT??587),secure:process.env.SMTP_SECURE==='true',connectionTimeout:15000,socketTimeout:30000,auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}:undefined});
 try {
  const result=await transport.sendMail({from:process.env.SMTP_FROM,to:mail.to,subject:mail.subject,messageId:mail.messageId,text:'Your issued financial document is attached. Sign in to view your school records.',attachments:[{filename:mail.filename,content:mail.bytes,contentType:'application/pdf'}]});
  if(!result.accepted?.map((email:string)=>email.toLowerCase()).includes(mail.to.toLowerCase()))throw new Error('Recipient was not accepted by SMTP');
 } finally {transport.close();}
};

/** Dedicated session advisory lock survives short transactions while SMTP is outside transactions.
 * SMTP cannot promise exactly-once delivery: a crash after dispatch is surfaced as uncertain,
 * never blindly replayed. A successful SMTP accept is not a claim of inbox delivery.
 */
export async function dispatchFinancialDelivery(db:DatabaseService,id:string,send:FinancialSender=smtpFinancialSender) {
 const client=await db.pool.connect();
 try {
  if(!(await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',[`delivery:${id}`])).rows[0].locked)return;
  const job=(await client.query(`SELECT o.*,d.site_id,d.status AS document_status,d.document_number,d.document_type,b.status AS cycle_status,b.id AS cycle_id,b.contract_id FROM financial_delivery_outbox o JOIN documents d ON d.id=o.document_id JOIN billing_cycles b ON b.id=d.billing_cycle_id WHERE o.id=$1`,[id])).rows[0];
  if(!job || !['pending','retry','paused'].includes(job.state) || new Date(job.next_attempt_at)>new Date())return;
  if(job.document_status==='cancelled') {await client.query("UPDATE financial_delivery_outbox SET state='cancelled' WHERE id=$1",[id]);return;}
  if(job.purpose!=='issue') {
   const pending=(await client.query("SELECT 1 FROM payments WHERE billing_cycle_id=$1 AND status IN('pending','pending_review','pending_verification')",[job.cycle_id])).rowCount;
   const enabled=settingValue((await client.query("SELECT value FROM system_settings WHERE key='financialRemindersEnabled'")).rows[0]?.value)===true;
   if(!enabled || ['paid','cancelled','void'].includes(job.cycle_status)) {await client.query("UPDATE financial_delivery_outbox SET state='cancelled' WHERE id=$1",[id]);return;}
   if(pending) {await client.query("UPDATE financial_delivery_outbox SET state='paused',next_attempt_at=now()+interval '1 hour' WHERE id=$1",[id]);return;}
  }
  const uncertain=(await client.query("SELECT id FROM financial_delivery_attempts WHERE outbox_id=$1 AND state IN('sending','uncertain')",[id])).rows;
  if(uncertain.length) {
   await client.query("UPDATE financial_delivery_attempts SET state='uncertain',finished_at=now() WHERE outbox_id=$1 AND state='sending'",[id]);
   await client.query("UPDATE financial_delivery_outbox SET state='uncertain',last_error='SMTP outcome unknown; reconcile provider logs before explicit retry' WHERE id=$1",[id]);
   await staffNotice(client,`delivery-uncertain:${id}`,job.site_id,'delivery_uncertain',{outboxId:id});return;
  }
  const attempt=Number(job.attempts)+1;
  if(attempt>5){
   await client.query("UPDATE financial_delivery_outbox SET state='failed',last_error='Retry budget exhausted after recovery' WHERE id=$1",[id]);
   await staffNotice(client,`delivery-failed:${id}`,job.site_id,'delivery_failed',{documentId:job.document_id,error:'Retry budget exhausted after recovery'});return;
  }
  await client.query('UPDATE financial_delivery_outbox SET attempts=$2 WHERE id=$1',[id,attempt]);
  try {
   await client.query('BEGIN');
   const artifact=await ensureDocumentArtifact(client,job.document_id);
   await client.query('COMMIT');
   // Re-evaluate live contract selection, verified address and active membership before every send.
   const selected=(await client.query(`SELECT u.id,u.email,u.status,u.role,u.school_id,u.email_verified_at,u.verified_email,si.school_id AS contract_school,s.status AS school_status FROM contracts c JOIN sites si ON si.id=c.site_id JOIN schools s ON s.id=si.school_id JOIN users u ON u.id=ANY(c.recipient_user_ids) WHERE c.id=$1`,[job.contract_id])).rows;
   let eligible=0;
   for(const recipient of selected) {
    const live=(await client.query(`SELECT u.email FROM users u JOIN contracts c ON u.id=ANY(c.recipient_user_ids) JOIN sites si ON si.id=c.site_id JOIN schools s ON s.id=si.school_id WHERE c.id=$1 AND u.id=$2 AND u.role='school_user' AND u.status='active' AND u.school_id=si.school_id AND s.status='active' AND u.email_verified_at IS NOT NULL AND u.verified_email=u.email`,[job.contract_id,recipient.id])).rows[0];
    if(!live) {
     await client.query("INSERT INTO financial_delivery_attempts(id,outbox_id,attempt,user_id,email,state,error,finished_at) VALUES($1,$2,$3,$4,$5,'skipped','Account is no longer eligible',now())",[randomUUID(),id,attempt,recipient.id,recipient.email]);continue;
    }
    eligible++;
    if((await client.query("SELECT 1 FROM financial_delivery_attempts WHERE outbox_id=$1 AND user_id=$2 AND email=$3 AND state='sent'",[id,recipient.id,live.email])).rowCount)continue;
    const attemptId=randomUUID(),messageId=`<financial-${id}-${attemptId}@solar-platform.invalid>`;
    await client.query("INSERT INTO financial_delivery_attempts(id,outbox_id,attempt,user_id,email,state,message_id,artifact_sha256) VALUES($1,$2,$3,$4,$5,'sending',$6,$7)",[attemptId,id,attempt,recipient.id,live.email,messageId,artifact.sha256]);
    try {
     await send({to:live.email,subject:`${job.document_type} ${job.document_number}`,messageId,bytes:artifact.bytes,filename:`${String(job.document_number).replace(/[^a-zA-Z0-9_-]/g,'_')}.pdf`});

    } catch(error) {
     // A network timeout/drop can follow remote acceptance. Only an explicit SMTP
     // negative reply or connection establishment failure is known safe to retry.
     const failure=error as Error & {code?:string;responseCode?:number};
     const knownRejected=Boolean(failure.responseCode && failure.responseCode>=400) || ['ECONFIG','EAUTH','EDNS','ECONNREFUSED'].includes(failure.code??'');
     if(!knownRejected){
      await client.query("UPDATE financial_delivery_attempts SET state='uncertain',error=$2,finished_at=now() WHERE id=$1",[attemptId,failure.message]);
      await client.query("UPDATE financial_delivery_outbox SET state='uncertain',last_error=$2 WHERE id=$1",[id,failure.message]);
      await staffNotice(client,`delivery-uncertain:${id}`,job.site_id,'delivery_uncertain',{outboxId:id,error:failure.message});return;
     }
     await client.query("UPDATE financial_delivery_attempts SET state='failed',error=$2,finished_at=now() WHERE id=$1",[attemptId,failure.message]);throw error;
    }
    // Persist acknowledgement outside the send catch. A DB failure leaves 'sending'
    // so the next run surfaces uncertain rather than duplicating accepted mail.
    await client.query("UPDATE financial_delivery_attempts SET state='sent',finished_at=now() WHERE id=$1",[attemptId]);
   }
   if(!eligible) {
    await staffNotice(client,`delivery-no-recipients:${id}`,job.site_id,'no_eligible_recipients',{documentId:job.document_id});
    throw new Error('No currently verified active recipients remain');
   }
   await client.query("UPDATE financial_delivery_outbox SET state='sent',completed_at=now(),last_error=NULL WHERE id=$1",[id]);
  } catch(error) {
   await client.query('ROLLBACK');
   const unresolved=(await client.query("SELECT 1 FROM financial_delivery_attempts WHERE outbox_id=$1 AND state IN('sending','uncertain')",[id])).rowCount;
   if(unresolved){
    await client.query("UPDATE financial_delivery_outbox SET state='uncertain',last_error=$2 WHERE id=$1",[id,(error as Error).message]);
    await staffNotice(client,`delivery-uncertain:${id}`,job.site_id,'delivery_uncertain',{outboxId:id,error:(error as Error).message});return;
   }
   const next=retryAt(attempt,new Date());
   await client.query("UPDATE financial_delivery_outbox SET state=$2,next_attempt_at=coalesce($3,now()),last_error=$4 WHERE id=$1",[id,next?'retry':'failed',next,(error as Error).message]);
   if(!next)await staffNotice(client,`delivery-failed:${id}`,job.site_id,'delivery_failed',{documentId:job.document_id,error:(error as Error).message});
  }
 } finally {
  try{await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[`delivery:${id}`]);}finally{client.release();}
 }
}







