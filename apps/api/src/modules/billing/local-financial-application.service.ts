import { BadRequestException, ForbiddenException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { PoolClient } from 'pg';
import { deliverSavedArtifacts, frozenRecipients, originalArtifactHash } from './saved-document-delivery.js';
import { schoolScope, type ScopePrincipal } from '../../common/auth/route-policy.js';
import { DatabaseService } from '../../database/database.service.js';
import { FinancialReadinessService } from './financial-readiness.service.js';
import { calculateTestTotals, requireTestTransferAmount, validFinancialDate, decimal, sqlCalendarPeriod, actualEnergyDifference, requireTestSettlement, TEST_FINANCIAL_POLICY, TEST_FINANCIAL_POLICY_HASH, localFinancialBinding } from './local-financial-policy.js';
import type { PaymentSubmission } from '@solar/api-contracts';
import { reviewedPaymentMetadata } from './payment-metadata.js';
import { allocateDocumentNumber } from '../documents/document-number.js';
import { FINANCIAL_TEMPLATE_VERSION, renderLocalTestPdf } from '../documents/local-test-pdf.js';
const validDate=validFinancialDate;
export function reviewedActualEnergyDifference(opening:unknown,closing:unknown):string {
 try{return actualEnergyDifference(opening,closing);}catch(error){throw new ConflictException((error as Error).message);}
}
@Injectable()
export class LocalFinancialApplicationService {
 constructor(@Inject(DatabaseService) private readonly db:DatabaseService,@Inject(FinancialReadinessService) private readonly readiness:FinancialReadinessService){}
 async calculate(siteId:string,start:string,end:string) {
  await this.readiness.assertEnabled('calculate');
  if(!validDate(start)||!validDate(end)||start>end)throw new BadRequestException('Valid ordered period dates required');
  return this.db.transaction(async client=>{
   const site=(await client.query('SELECT * FROM sites WHERE id=$1 FOR UPDATE',[siteId])).rows[0];if(!site)throw new NotFoundException('Site not found');
   const prior=(await client.query(`SELECT *,to_char(period_start,'YYYY-MM-DD') AS starts,to_char(period_end,'YYYY-MM-DD') AS ends FROM billing_cycles WHERE site_id=$1 AND period_start<=$3::date AND period_end>=$2::date`,[siteId,start,end])).rows;
   if(prior.length) {if(prior.length===1&&prior[0].policy_hash===TEST_FINANCIAL_POLICY_HASH&&prior[0].starts===start&&prior[0].ends===end)return {cycles:prior};throw new ConflictException('Billing period overlaps an existing cycle');}
   const contracts=(await client.query(`SELECT *, (start_date<=$2::date AND (end_date IS NULL OR end_date>=$3::date)) AS covers_period FROM contracts WHERE site_id=$1 AND status='active' AND start_date<=$3::date AND (end_date IS NULL OR end_date>=$2::date) ORDER BY start_date`,[siteId,start,end])).rows;
   if(contracts.length!==1)throw new ConflictException('Exactly one unambiguous active contract required for this period');
   const contract=contracts[0];if(!contract.covers_period)throw new ConflictException('Contract must cover complete requested period');
   const rates=(await client.query(`WITH effective AS (SELECT *,lead(effective_from) OVER(ORDER BY effective_from,id) AS next_from FROM rate_versions WHERE contract_id=$1) SELECT *,to_char(greatest(effective_from,$2::date),'YYYY-MM-DD') AS starts,to_char(least(coalesce(effective_to+1,next_from,'infinity'::date),$3::date+1),'YYYY-MM-DD') AS ends FROM effective WHERE effective_from<=$3::date AND coalesce(effective_to+1,next_from,'infinity'::date)>$2::date ORDER BY effective_from`,[contract.id,start,end])).rows;
   const meters=(await client.query('SELECT * FROM billing_meters WHERE site_id=$1 AND active=true ORDER BY id',[siteId])).rows;
   if(!meters.length||!rates.length)throw new ConflictException('Billing meters and effective rate required');
   const finalBoundary=new Date(Date.parse(end)+86400000).toISOString().slice(0,10);let cursor=start;const snapshots:any[]=[];
   let energy=0n,subtotal=0n;let opening=0,closing=0;
   for(const rate of rates){
    if(rate.starts!==cursor||rate.ends<=rate.starts||rate.currency!=='THB'||rate.rate_type!=='fixed_kwh')throw new ConflictException('Effective rates overlap or do not cover the period');
    for(const meter of meters){const readings:any[]=[];
     for(const boundary of [rate.starts,rate.ends]){
      const reading=(await client.query(`SELECT tr.id,tr.normalized_value AS value,tr.source_time,tr.mapping_version_id,($3::date::timestamp AT TIME ZONE $4) AS target_time FROM telemetry_raw tr JOIN register_mapping_versions m ON m.id=tr.mapping_version_id WHERE tr.site_id=$5 AND tr.device_id=$1 AND tr.semantic_field=$2 AND m.semantic_field=$2 AND tr.quality='complete' AND lower(tr.unit)='kwh' AND abs(extract(epoch FROM(tr.source_time-($3::date::timestamp AT TIME ZONE $4))))<=300 ORDER BY abs(extract(epoch FROM(tr.source_time-($3::date::timestamp AT TIME ZONE $4)))),tr.source_time DESC,tr.id LIMIT 1`,[meter.device_id,meter.semantic_field,boundary,site.timezone,siteId])).rows[0];
      if(!reading)throw new ConflictException(`Missing actual cumulative reading for meter ${meter.id} at ${boundary}`);readings.push(reading);
     }
     const totals=calculateTestTotals(reviewedActualEnergyDifference(readings[0].value,readings[1].value),rate.rate);
     energy+=BigInt(totals.consumedKwh.replace('.',''));subtotal+=BigInt(totals.subtotal.replace('.',''));
     if(rate.starts===start)opening+=Number(readings[0].value);if(rate.ends===finalBoundary)closing+=Number(readings[1].value);
     snapshots.push({meterId:meter.id,contractId:contract.id,from:rate.starts,to:rate.ends,opening:readings[0],closing:readings[1],...totals});
    }cursor=rate.ends;
   }
   if(cursor!==finalBoundary)throw new ConflictException('No effective rate covers whole period');
   const tax=(subtotal*7n+50n)/100n;const id=randomUUID();
   const result=await client.query(`INSERT INTO billing_cycles(id,site_id,contract_id,period_start,period_end,cutoff_time,status,quality,opening_energy,closing_energy,consumed_kwh,rate,amount,subtotal,simulated_tax,meter_snapshot,policy_hash) VALUES($1,$2,$3,$4,$5,($5::date+1)::timestamp AT TIME ZONE $6,'pending_review','complete',$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,[id,siteId,contract.id,start,end,site.timezone,opening,closing,decimal(energy,3), rates.length===1?snapshots[0].rate:decimal(energy?(subtotal*100000n+energy/2n)/energy:0n,4),decimal(subtotal+tax,2),decimal(subtotal,2),decimal(tax,2),JSON.stringify(snapshots),TEST_FINANCIAL_POLICY_HASH]);
   return {cycles:result.rows};
  });
 }
 private async issue(client:PoolClient,cycle:any,type:'invoice'|'receipt') {
  const existing=(await client.query('SELECT * FROM documents WHERE billing_cycle_id=$1 AND document_type=$2',[cycle.id,type])).rows;
  if(existing.length){if(existing.length!==1||!existing[0].snapshot?.policy||!['issued','finalized'].includes(existing[0].status))throw new ConflictException('Legacy document requires explicit reconciliation');return existing[0];}
  if(cycle.quality!=='complete'||!cycle.meter_snapshot||cycle.policy_hash!==TEST_FINANCIAL_POLICY_HASH)throw new ConflictException('Verified actual TEST calculation required');
  const customer=(await client.query(`SELECT c.*,(SELECT d.document_number FROM documents d WHERE d.contract_id=c.id AND d.document_type='contract') AS contract_number,to_char(c.start_date,'YYYY-MM-DD') AS start_date,to_char(c.end_date,'YYYY-MM-DD') AS end_date,s.name AS site_name,s.external_site_id,sc.name AS school_name FROM contracts c JOIN sites s ON s.id=c.site_id JOIN schools sc ON sc.id=s.school_id WHERE c.id=$1 AND c.site_id=$2`,[cycle.contract_id,cycle.site_id])).rows[0];
  const company=(await client.query('SELECT * FROM company_profile WHERE is_configured=true ORDER BY updated_at DESC LIMIT 1')).rows[0];
  if(!company?.company_name||!company.tax_id||!company.address||!customer?.company_name||!customer.tax_id||!customer.tax_address)throw new ConflictException('Complete issuer and customer tax identity required');
  if(!customer.contract_number)throw new ConflictException('Issued contract original required before financial issuance');
  if(!Number.isInteger(customer.payment_term_days))throw new ConflictException('Explicit paymentTermDays required');
  const banks=(await client.query('SELECT * FROM company_bank_accounts WHERE is_configured=true ORDER BY is_default DESC,created_at')).rows;
  if(!banks.some(bank=>bank.bank_name?.trim()&&bank.account_name?.trim()&&bank.account_number?.trim()))throw new ConflictException('Usable configured payment account required');
  const recipients=(await client.query(`SELECT u.id,u.email,u.display_name AS name FROM users u JOIN sites s ON s.school_id=u.school_id JOIN schools sc ON sc.id=s.school_id WHERE s.id=$1 AND u.id=ANY($2::uuid[]) AND u.role='school_user' AND u.status='active' AND sc.status='active' AND u.email_verified_at IS NOT NULL AND u.verified_email=u.email ORDER BY u.id`,[cycle.site_id,customer.recipient_user_ids])).rows;
  if(!recipients.length||recipients.length!==customer.recipient_user_ids.length)throw new ConflictException('Selected verified organization recipients required');
  const payments=type==='receipt'?(await client.query("SELECT * FROM payments WHERE billing_cycle_id=$1 AND status='paid' ORDER BY submitted_at,id",[cycle.id])).rows:[];
  if(type==='receipt')requireTestSettlement(payments.map(p=>p.amount),cycle.amount);
  const {number,issueDate:day}=await allocateDocumentNumber(client,type);
  const invoiceNumber=type==='receipt'?(await client.query("SELECT document_number FROM documents WHERE billing_cycle_id=$1 AND document_type='invoice'",[cycle.id])).rows[0]?.document_number:undefined;
  if(type==='receipt'&&!invoiceNumber)throw new ConflictException('Issued invoice reference required');
  const logo=await readFile(fileURLToPath(new URL('../../../../web/public/brand/solar-roof-document-stacked.png',import.meta.url)));
  const cycleDates=(await client.query(`SELECT to_char(period_start,'YYYY-MM-DD') AS starts,to_char(period_end,'YYYY-MM-DD') AS ends FROM billing_cycles WHERE id=$1`,[cycle.id])).rows[0];
  cycle={...cycle,period_start:cycleDates.starts,period_end:cycleDates.ends};
  const snapshot={...(invoiceNumber?{invoiceNumber}:{}),templateVersion:FINANCIAL_TEMPLATE_VERSION,policy:TEST_FINANCIAL_POLICY,policyHash:TEST_FINANCIAL_POLICY_HASH,cycle,customer,company,banks,payments,recipients,logo:`data:image/png;base64,${logo.toString('base64')}`,language:'th-en',issueDate:day,dueDate:new Date(Date.parse(day)+customer.payment_term_days*86400000).toISOString().slice(0,10)};
  const document={id:randomUUID(),document_number:number,document_type:type,snapshot,amount:cycle.amount};
  const bytes=await renderLocalTestPdf(document);const sha256=createHash('sha256').update(bytes).digest('hex');
  const doc=(await client.query(`INSERT INTO documents(id,site_id,billing_cycle_id,document_type,document_number,status,issue_date,amount,snapshot,content_hash,file_key,template_version) VALUES($1,$2,$3,$4,$5,'issued',$6,$7,$8,$9,$10,$11) RETURNING *`,[document.id,cycle.site_id,cycle.id,type,number,day,cycle.amount,JSON.stringify(snapshot),sha256,`local-artifact:${document.id}`,FINANCIAL_TEMPLATE_VERSION])).rows[0];
  await client.query('INSERT INTO document_artifacts(document_id,pdf_bytes,sha256) VALUES($1,$2,$3)',[doc.id,bytes,sha256]);
  await client.query('INSERT INTO financial_delivery_outbox(id,document_id,artifact_sha256) VALUES($1,$2,$3)',[randomUUID(),doc.id,sha256]);return doc;
 }
 async issueInvoice(id:string){await this.readiness.assertEnabled('issue');return this.db.transaction(async client=>{const cycle=(await client.query('SELECT * FROM billing_cycles WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!cycle)throw new NotFoundException('Billing cycle not found');const document=await this.issue(client,cycle,'invoice');await client.query("UPDATE billing_cycles SET status=CASE WHEN status IN('paid','pending_verification') THEN status ELSE 'approved' END WHERE id=$1",[id]);return {created:true,document:{...document,documentNumber:document.document_number}};});}
 async submitPayment(id:string,body:PaymentSubmission,actorId:string|undefined){
  if(!actorId)throw new BadRequestException('Actor required');
  const metadata=reviewedPaymentMetadata(body);
  let amount:string;try{amount=requireTestTransferAmount(body.amount);}catch(error){throw new BadRequestException((error as Error).message);}
  if(!body.slipUrl&&!body.evidenceKey)throw new BadRequestException('Transfer evidence required');
  const paidAt=body.paidAt?new Date(body.paidAt):new Date();if(!Number.isFinite(paidAt.getTime()))throw new BadRequestException('Valid transfer date required');
  return this.db.transaction(async client=>{
   const cycle=(await client.query('SELECT * FROM billing_cycles WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!cycle)throw new NotFoundException('Billing cycle not found');
   if(!['approved','pending_verification'].includes(cycle.status)||cycle.policy_hash!==TEST_FINANCIAL_POLICY_HASH)throw new ConflictException('Issued unpaid TEST invoice required');
   const invoice=(await client.query("SELECT id FROM documents WHERE billing_cycle_id=$1 AND document_type='invoice' AND status='issued'",[id])).rows[0];if(!invoice)throw new ConflictException('Issued invoice required');
   const duplicate=await client.query(`SELECT 1 FROM payments WHERE submitted_by IS NOT NULL AND status IN('pending_verification','paid') AND (evidence_key=$1 OR slip_url=$2)`,[body.evidenceKey??null,body.slipUrl??null]);if(duplicate.rowCount)throw new ConflictException('Transfer evidence already submitted');
   const paymentId=randomUUID();await client.query(`INSERT INTO payments(id,billing_cycle_id,amount,status,paid_at,slip_url,evidence_key,note,submitted_by,payer_name,payment_method,origin_bank,origin_account) VALUES($1,$2,$3,'pending_verification',$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[paymentId,id,amount,paidAt,body.slipUrl??null,body.evidenceKey??null,body.note??null,actorId,metadata.payerName??null,metadata.paymentMethod??null,metadata.originBank??null,metadata.originAccount??null]);
   await client.query("UPDATE billing_cycles SET status='pending_verification' WHERE id=$1",[id]);return {success:true,paymentId,status:'pending_verification'};
  }).catch(error=>{if(error?.code==='23505'&&['payments_new_active_evidence','payments_new_active_slip'].includes(error.constraint))throw new ConflictException('Transfer evidence already submitted');throw error;});
 }
 async verifyPayment(id:string,status:string,reason:string|undefined,actorId:string|undefined){
  await this.readiness.assertEnabled('approve_payment');if(!actorId)throw new BadRequestException('Actor required');if(!['approved','rejected'].includes(status))throw new BadRequestException('Invalid verification status');
  return this.db.transaction(async client=>{
   const actor=(await client.query('SELECT role,status FROM users WHERE id=$1',[actorId])).rows[0];if(!actor||actor.status!=='active'||!['owner','accountant'].includes(actor.role))throw new ForbiddenException('Owner or Accountant payment approval required');
   const cycle=(await client.query('SELECT * FROM billing_cycles WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!cycle)throw new NotFoundException('Billing cycle not found');
   if(cycle.status==='paid'){const receipt=(await client.query("SELECT * FROM documents WHERE billing_cycle_id=$1 AND document_type='receipt'",[id])).rows[0];if(status==='approved'&&receipt)return {success:true,billingCycleStatus:'paid',receipt};throw new ConflictException('Paid cycle cannot be rejected');}
   const payments=(await client.query("SELECT * FROM payments WHERE billing_cycle_id=$1 AND status='pending_verification' ORDER BY submitted_at,id FOR UPDATE",[id])).rows;if(!payments.length)throw new ConflictException('No pending transfers');
   if(status==='rejected'&&!reason?.trim())throw new BadRequestException('Rejection reason required');
   if(status==='approved')try{requireTestSettlement(payments.map(p=>p.amount),cycle.amount);}catch(error){throw new ConflictException((error as Error).message);}
   await client.query(`UPDATE payments SET status=$2,verified_at=now(),verified_by=$3,rejection_reason=$4 WHERE billing_cycle_id=$1 AND status='pending_verification'`,[id,status==='approved'?'paid':'rejected',actorId,reason??null]);
   const receipt=status==='approved'?await this.issue(client,cycle,'receipt'):null;
   await client.query('UPDATE billing_cycles SET status=$2 WHERE id=$1',[id,status==='approved'?'paid':'approved']);
   await client.query(`INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,before_json,after_json,reason,correlation_id) VALUES($1,$2,$3,'billing_cycle',$4,$5,$6,$7,$8)`,[randomUUID(),actorId,`payment.verify_${status}`,id,JSON.stringify({status:cycle.status,transferIds:payments.map(p=>p.id)}),JSON.stringify({status:status==='approved'?'paid':'approved',receiptId:receipt?.id}),reason??'Full settlement approved',randomUUID()]);
   return {success:true,billingCycleStatus:status==='approved'?'paid':'approved',receipt};
  });
 }
 async send(id:string){await this.readiness.assertEnabled('send');if(!localFinancialBinding())throw new ConflictException('Local mail capture binding required');
  const lock=await this.db.pool.connect();try{
   if(!(await lock.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',[`financial-mail:${id}`])).rows[0].locked)return {pending:true};
   const outboxes=(await lock.query(`SELECT o.*,d.document_number,d.document_type,d.site_id,d.contract_id,d.snapshot,d.content_hash,a.pdf_bytes,a.sha256 FROM financial_delivery_outbox o JOIN documents d ON d.id=o.document_id JOIN document_artifacts a ON a.document_id=d.id WHERE d.billing_cycle_id=$1 AND d.status='issued' ORDER BY d.created_at`,[id])).rows;
   await deliverSavedArtifacts(lock,outboxes);return {success:true};
  }finally{await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[`financial-mail:${id}`]);lock.release();}
 }
 async sendContract(id:string,actor:ScopePrincipal){
  if(!['owner','admin'].includes(actor.role??''))throw new ForbiddenException('Contract author required');
  await this.readiness.assertEnabled('send');if(!localFinancialBinding())throw new ConflictException('Local mail capture binding required');
  const lock=await this.db.pool.connect();const key=`contract-mail:${id}`;
  try{
   const scope=schoolScope(actor);const params:unknown[]=[id];if(scope!==null)params.push(scope);
   const contract=(await lock.query(`SELECT c.id,c.site_id FROM contracts c JOIN sites s ON s.id=c.site_id WHERE c.id=$1 ${scope===null?'':'AND s.school_id=ANY($2::uuid[])'}`,params)).rows[0];
   if(!contract)throw new NotFoundException('ไม่พบสัญญา / Contract not found');
   if(!(await lock.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',[key])).rows[0].locked)return {pending:true};
   const original=(await lock.query(`SELECT d.id AS document_id,d.document_type,d.contract_id,d.site_id,d.document_number,d.snapshot,d.content_hash,a.pdf_bytes,a.sha256 FROM documents d JOIN document_artifacts a ON a.document_id=d.id WHERE d.contract_id=$1 AND d.document_type='contract' AND d.status='issued'`,[id])).rows[0];
   if(!original)throw new ConflictException('กรุณาเปิดเอกสารต้นฉบับสัญญาก่อนส่ง / Open the saved contract original before sending');
   originalArtifactHash(original);frozenRecipients(original);
   await lock.query('INSERT INTO financial_delivery_outbox(id,document_id,artifact_sha256) VALUES($1,$2,$3) ON CONFLICT(document_id) DO NOTHING',[randomUUID(),original.document_id,original.sha256]);
   const jobs=(await lock.query(`SELECT o.*,d.document_number,d.document_type,d.site_id,d.contract_id,d.snapshot,d.content_hash,a.pdf_bytes,a.sha256 FROM financial_delivery_outbox o JOIN documents d ON d.id=o.document_id JOIN document_artifacts a ON a.document_id=d.id WHERE d.id=$1 AND d.status='issued'`,[original.document_id])).rows;
   await deliverSavedArtifacts(lock,jobs);return {success:true,documentId:original.document_id,contentHash:original.sha256};
  }finally{await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[key]);lock.release();}
 }
 async monthly(now=new Date()) {
  await this.readiness.assertEnabled('calculate');const local=new Date(now.getTime()+7*3600000);if(local.getUTCDate()===1&&local.getUTCHours()<1)return [];
  const start=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth()-1,1)).toISOString().slice(0,10),end=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),0)).toISOString().slice(0,10);
  await this.db.query(`INSERT INTO financial_month_jobs(id,site_id,period_start,period_end) SELECT gen_random_uuid(),s.id,$1,$2 FROM sites s WHERE EXISTS(SELECT 1 FROM contracts c WHERE c.site_id=s.id AND c.status='active' AND c.start_date<=$2::date AND (c.end_date IS NULL OR c.end_date>=$1::date)) ON CONFLICT(site_id,period_start) DO NOTHING`,[start,end]);
  const jobs=(await this.db.query("SELECT *,to_char(period_start,'YYYY-MM-DD') AS starts,to_char(period_end,'YYYY-MM-DD') AS ends FROM financial_month_jobs WHERE state IN('pending','blocked') AND next_attempt_at<=now() ORDER BY period_start,site_id")).rows;
  for(const job of jobs){try{let cycles=(await this.db.query('SELECT * FROM billing_cycles WHERE site_id=$1 AND period_start=$2 AND period_end=$3',[job.site_id,job.period_start,job.period_end])).rows;
    if(!cycles.length)cycles=(await this.calculate(job.site_id,sqlCalendarPeriod(job).start,sqlCalendarPeriod(job).end)).cycles;
    for(const cycle of cycles){await this.issueInvoice(cycle.id);await this.send(cycle.id);}await this.db.query("UPDATE financial_month_jobs SET state='done',completed_at=now(),last_error=NULL,last_attempt_at=now() WHERE id=$1",[job.id]);
   }catch(error){await this.db.query("UPDATE financial_month_jobs SET state='blocked',attempts=attempts+1,last_error=$2,last_attempt_at=now(),next_attempt_at=now()+interval '1 hour' WHERE id=$1",[job.id,(error as Error).message]);
    await this.db.query(`WITH notice AS (INSERT INTO financial_staff_notices(id,job_id,site_id,kind,detail) VALUES($1,$2,$3,'monthly_billing_blocked',$4) ON CONFLICT(job_id,kind) DO NOTHING RETURNING id) INSERT INTO notification_deliveries(id,user_id,title,channel,recipient,status) SELECT gen_random_uuid(),u.id,'TEST monthly billing blocked: '||s.name||' · '||($4::jsonb->>'error'),'system',u.email,'delivered' FROM notice CROSS JOIN users u JOIN sites s ON s.id=$3 WHERE u.status='active' AND u.role IN('owner','admin','accountant','operator') AND (u.school_id IS NULL OR u.school_id=s.school_id)`,[randomUUID(),job.id,job.site_id,JSON.stringify({error:(error as Error).message,periodStart:job.period_start,periodEnd:job.period_end})]);}
  }return (await this.db.query('SELECT * FROM financial_month_jobs ORDER BY period_start,site_id')).rows;
 }
}











