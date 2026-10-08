import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { PoolClient } from 'pg';
import nodemailer from 'nodemailer';
import { DatabaseService } from '../../database/database.service.js';
import { FinancialReadinessService } from './financial-readiness.service.js';
import { calculateTestTotals, actualEnergyDifference, requireTestSettlement, TEST_FINANCIAL_POLICY, TEST_FINANCIAL_POLICY_HASH, localFinancialBinding } from './local-financial-policy.js';
import { renderLocalTestPdf } from '../documents/local-test-pdf.js';
const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(value).toISOString().slice(0,10)===value;
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
   const contracts=(await client.query(`SELECT * FROM contracts WHERE site_id=$1 AND status='active' AND start_date<=$3::date AND (end_date IS NULL OR end_date>=$2::date) ORDER BY start_date`,[siteId,start,end])).rows;
   if(contracts.length!==1)throw new ConflictException('Exactly one unambiguous active contract required for this period');
   const contract=contracts[0];if(new Date(contract.start_date)>new Date(start)||(contract.end_date&&new Date(contract.end_date)<new Date(end)))throw new ConflictException('Contract must cover complete requested period');
   const rates=(await client.query(`SELECT *,to_char(greatest(effective_from,$2::date),'YYYY-MM-DD') AS starts,to_char(least(coalesce(effective_to+1,'infinity'::date),$3::date+1),'YYYY-MM-DD') AS ends FROM rate_versions WHERE contract_id=$1 AND effective_from<=$3::date AND (effective_to IS NULL OR effective_to>=$2::date) ORDER BY effective_from`,[contract.id,start,end])).rows;
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
     const totals=calculateTestTotals(actualEnergyDifference(readings[0].value,readings[1].value),rate.rate);
     energy+=BigInt(totals.consumedKwh.replace('.',''));subtotal+=BigInt(totals.subtotal.replace('.',''));
     if(rate.starts===start)opening+=Number(readings[0].value);if(rate.ends===finalBoundary)closing+=Number(readings[1].value);
     snapshots.push({meterId:meter.id,contractId:contract.id,from:rate.starts,to:rate.ends,opening:readings[0],closing:readings[1],...totals});
    }cursor=rate.ends;
   }
   if(cursor!==finalBoundary)throw new ConflictException('No effective rate covers whole period');
   const tax=(subtotal*7n+50n)/100n;const id=randomUUID();
   const result=await client.query(`INSERT INTO billing_cycles(id,site_id,contract_id,period_start,period_end,cutoff_time,status,quality,opening_energy,closing_energy,consumed_kwh,rate,amount,subtotal,simulated_tax,meter_snapshot,policy_hash) VALUES($1,$2,$3,$4,$5,($5::date+1)::timestamp AT TIME ZONE $6,'pending_review','complete',$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,[id,siteId,contract.id,start,end,site.timezone,opening,closing,Number(energy)/1000, rates.length===1?rates[0].rate:Number(subtotal)/100/(Number(energy)/1000||1),Number(subtotal+tax)/100,Number(subtotal)/100,Number(tax)/100,JSON.stringify(snapshots),TEST_FINANCIAL_POLICY_HASH]);
   return {cycles:result.rows};
  });
 }
 private async issue(client:PoolClient,cycle:any,type:'invoice'|'receipt') {
  const existing=(await client.query('SELECT * FROM documents WHERE billing_cycle_id=$1 AND document_type=$2',[cycle.id,type])).rows;
  if(existing.length){if(existing.length!==1||!existing[0].snapshot?.policy||!['issued','finalized'].includes(existing[0].status))throw new ConflictException('Legacy document requires explicit reconciliation');return existing[0];}
  if(cycle.quality!=='complete'||!cycle.meter_snapshot||cycle.policy_hash!==TEST_FINANCIAL_POLICY_HASH)throw new ConflictException('Verified actual TEST calculation required');
  const customer=(await client.query(`SELECT c.*,s.name AS site_name,sc.name AS school_name FROM contracts c JOIN sites s ON s.id=c.site_id JOIN schools sc ON sc.id=s.school_id WHERE c.id=$1 AND c.site_id=$2`,[cycle.contract_id,cycle.site_id])).rows[0];
  const company=(await client.query('SELECT * FROM company_profile WHERE is_configured=true ORDER BY updated_at DESC LIMIT 1')).rows[0];
  if(!company?.company_name||!company.tax_id||!company.address||!customer?.company_name||!customer.tax_id||!customer.tax_address)throw new ConflictException('Complete issuer and customer tax identity required');
  if(!Number.isInteger(customer.payment_term_days))throw new ConflictException('Explicit paymentTermDays required');
  const banks=(await client.query('SELECT * FROM company_bank_accounts WHERE is_configured=true ORDER BY is_default DESC,created_at')).rows;
  const payments=type==='receipt'?(await client.query("SELECT * FROM payments WHERE billing_cycle_id=$1 AND status='paid' ORDER BY submitted_at,id",[cycle.id])).rows:[];
  if(type==='receipt')requireTestSettlement(payments.map(p=>p.amount),cycle.amount);
  const day=(await client.query("SELECT to_char(now() AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') AS day")).rows[0].day;
  const prefix=`${type==='receipt'?'RCT':'INV'}${day.replaceAll('-','').slice(0,6)}`;
  const seq=(await client.query(`INSERT INTO document_number_series(prefix,last_value) VALUES($1,1) ON CONFLICT(prefix) DO UPDATE SET last_value=document_number_series.last_value+1 RETURNING last_value`,[prefix])).rows[0].last_value;
  const number=prefix+String(seq).padStart(4,'0');
  const logo=await readFile(fileURLToPath(new URL('../../../../web/public/brand/solar-roof-document.png',import.meta.url)));
  const cycleDates=(await client.query(`SELECT to_char(period_start,'YYYY-MM-DD') AS starts,to_char(period_end,'YYYY-MM-DD') AS ends FROM billing_cycles WHERE id=$1`,[cycle.id])).rows[0];
  cycle={...cycle,period_start:cycleDates.starts,period_end:cycleDates.ends};
  const snapshot={policy:TEST_FINANCIAL_POLICY,policyHash:TEST_FINANCIAL_POLICY_HASH,cycle,customer,company,banks,payments,logo:`data:image/png;base64,${logo.toString('base64')}`,language:'th-en',issueDate:day,dueDate:new Date(Date.parse(day)+customer.payment_term_days*86400000).toISOString().slice(0,10)};
  const document={id:randomUUID(),document_number:number,document_type:type,snapshot,amount:cycle.amount};
  const bytes=await renderLocalTestPdf(document);const sha256=createHash('sha256').update(bytes).digest('hex');
  const doc=(await client.query(`INSERT INTO documents(id,site_id,billing_cycle_id,document_type,document_number,status,issue_date,amount,snapshot,content_hash,file_key) VALUES($1,$2,$3,$4,$5,'issued',$6,$7,$8,$9,$10) RETURNING *`,[document.id,cycle.site_id,cycle.id,type,number,day,cycle.amount,JSON.stringify(snapshot),sha256,`local-artifact:${document.id}`])).rows[0];
  await client.query('INSERT INTO document_artifacts(document_id,pdf_bytes,sha256) VALUES($1,$2,$3)',[doc.id,bytes,sha256]);
  await client.query('INSERT INTO financial_delivery_outbox(id,document_id,artifact_sha256) VALUES($1,$2,$3)',[randomUUID(),doc.id,sha256]);return doc;
 }
 async issueInvoice(id:string){await this.readiness.assertEnabled('issue');return this.db.transaction(async client=>{const cycle=(await client.query('SELECT * FROM billing_cycles WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!cycle)throw new NotFoundException('Billing cycle not found');const document=await this.issue(client,cycle,'invoice');await client.query("UPDATE billing_cycles SET status=CASE WHEN status IN('paid','pending_verification') THEN status ELSE 'approved' END WHERE id=$1",[id]);return {created:true,document:{...document,documentNumber:document.document_number}};});}
 async submitPayment(id:string,body:{amount?:number;paidAt?:string;slipUrl?:string;evidenceKey?:string;note?:string},actorId:string|undefined){
  if(!actorId)throw new BadRequestException('Actor required');
  if(typeof body.amount!=='number'||!Number.isFinite(body.amount)||body.amount<=0||!/^\d+(\.\d{1,2})?$/.test(String(body.amount)))throw new BadRequestException('Positive whole-satang transfer amount required');
  if(!body.slipUrl&&!body.evidenceKey)throw new BadRequestException('Transfer evidence required');
  const paidAt=body.paidAt?new Date(body.paidAt):new Date();if(!Number.isFinite(paidAt.getTime()))throw new BadRequestException('Valid transfer date required');
  return this.db.transaction(async client=>{
   const cycle=(await client.query('SELECT * FROM billing_cycles WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!cycle)throw new NotFoundException('Billing cycle not found');
   if(!['approved','pending_verification'].includes(cycle.status)||cycle.policy_hash!==TEST_FINANCIAL_POLICY_HASH)throw new ConflictException('Issued unpaid TEST invoice required');
   const invoice=(await client.query("SELECT id FROM documents WHERE billing_cycle_id=$1 AND document_type='invoice' AND status='issued'",[id])).rows[0];if(!invoice)throw new ConflictException('Issued invoice required');
   const duplicate=await client.query(`SELECT 1 FROM payments WHERE billing_cycle_id=$1 AND status IN('pending_verification','paid') AND (evidence_key=$2 OR slip_url=$3)`,[id,body.evidenceKey??null,body.slipUrl??null]);if(duplicate.rowCount)throw new ConflictException('Transfer evidence already submitted');
   const paymentId=randomUUID();await client.query(`INSERT INTO payments(id,billing_cycle_id,amount,status,paid_at,slip_url,evidence_key,note,submitted_by) VALUES($1,$2,$3,'pending_verification',$4,$5,$6,$7,$8)`,[paymentId,id,body.amount,paidAt,body.slipUrl??null,body.evidenceKey??null,body.note??null,actorId]);
   await client.query("UPDATE billing_cycles SET status='pending_verification' WHERE id=$1",[id]);return {success:true,paymentId,status:'pending_verification'};
  });
 }
 async verifyPayment(id:string,status:string,reason:string|undefined,actorId:string|undefined){
  await this.readiness.assertEnabled('approve_payment');if(!actorId)throw new BadRequestException('Actor required');if(!['approved','rejected'].includes(status))throw new BadRequestException('Invalid verification status');
  return this.db.transaction(async client=>{
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
   const outboxes=(await lock.query(`SELECT o.*,d.document_number,d.snapshot,a.pdf_bytes,a.sha256 FROM financial_delivery_outbox o JOIN documents d ON d.id=o.document_id JOIN document_artifacts a ON a.document_id=d.id WHERE d.billing_cycle_id=$1 AND d.status='issued' ORDER BY d.created_at`,[id])).rows;
   for(const job of outboxes){if(job.state==='sent')continue;if(['sending','uncertain'].includes(job.state))throw new ConflictException('SMTP outcome uncertain; reconcile capture before retry');
    const recipient=job.snapshot.customer.billing_email;if(!recipient)throw new ConflictException('Contract email required');
    const messageId=`<financial-${job.id}@solar-platform.invalid>`;
    await lock.query("UPDATE financial_delivery_outbox SET state='sending',attempts=attempts+1,message_id=$2 WHERE id=$1",[job.id,messageId]);
    const transport=nodemailer.createTransport({host:'127.0.0.1',port:11049,secure:false,connectionTimeout:5000,socketTimeout:10000});
    try{const result=await transport.sendMail({from:process.env.SMTP_FROM??'local-financial@solar-platform.invalid',to:recipient,messageId,subject:`TEST ${job.document_number}`,text:'Synthetic local financial workflow test. Document attached.',attachments:[{filename:`${job.document_number}.pdf`,content:job.pdf_bytes,contentType:'application/pdf'}]});if(!result.accepted?.length)throw new Error('SMTP recipient rejected');}
    catch(error){const e=error as Error&{code?:string;responseCode?:number};const safe=e.code==='ECONNREFUSED'||Boolean(e.responseCode&&e.responseCode>=400);await lock.query('UPDATE financial_delivery_outbox SET state=$2,last_error=$3 WHERE id=$1',[job.id,safe?'failed':'uncertain',e.message]);throw error;}finally{transport.close();}
    await lock.query("UPDATE financial_delivery_outbox SET state='sent',completed_at=now(),last_error=NULL WHERE id=$1",[job.id]);
   }return {success:true};
  }finally{await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[`financial-mail:${id}`]);lock.release();}
 }
 async monthly(now=new Date()) {
  await this.readiness.assertEnabled('calculate');const local=new Date(now.getTime()+7*3600000);if(local.getUTCDate()===1&&local.getUTCHours()<1)return [];
  const start=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth()-1,1)).toISOString().slice(0,10),end=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),0)).toISOString().slice(0,10);
  await this.db.query(`INSERT INTO financial_month_jobs(id,site_id,period_start,period_end) SELECT gen_random_uuid(),s.id,$1,$2 FROM sites s WHERE EXISTS(SELECT 1 FROM contracts c WHERE c.site_id=s.id AND c.status='active' AND c.start_date<=$2::date AND (c.end_date IS NULL OR c.end_date>=$1::date)) ON CONFLICT(site_id,period_start) DO NOTHING`,[start,end]);
  const jobs=(await this.db.query("SELECT *,to_char(period_start,'YYYY-MM-DD') AS starts,to_char(period_end,'YYYY-MM-DD') AS ends FROM financial_month_jobs WHERE state IN('pending','blocked') AND next_attempt_at<=now() ORDER BY period_start,site_id")).rows;
  for(const job of jobs){try{let cycles=(await this.db.query('SELECT * FROM billing_cycles WHERE site_id=$1 AND period_start=$2 AND period_end=$3',[job.site_id,job.period_start,job.period_end])).rows;
    if(!cycles.length)cycles=(await this.calculate(job.site_id,job.starts,job.ends)).cycles;
    for(const cycle of cycles){await this.issueInvoice(cycle.id);await this.send(cycle.id);}await this.db.query("UPDATE financial_month_jobs SET state='done',completed_at=now(),last_error=NULL,last_attempt_at=now() WHERE id=$1",[job.id]);
   }catch(error){await this.db.query("UPDATE financial_month_jobs SET state='blocked',attempts=attempts+1,last_error=$2,last_attempt_at=now(),next_attempt_at=now()+interval '1 hour' WHERE id=$1",[job.id,(error as Error).message]);
    await this.db.query(`WITH notice AS (INSERT INTO financial_staff_notices(id,job_id,site_id,kind,detail) VALUES($1,$2,$3,'monthly_billing_blocked',$4) ON CONFLICT(job_id,kind) DO NOTHING RETURNING id) INSERT INTO notification_deliveries(id,user_id,title,channel,recipient,status) SELECT gen_random_uuid(),u.id,'TEST monthly billing blocked: '||s.name||' · '||($4::jsonb->>'error'),'system',u.email,'delivered' FROM notice CROSS JOIN users u JOIN sites s ON s.id=$3 WHERE u.status='active' AND u.role IN('owner','admin','accountant','operator') AND (u.school_id IS NULL OR u.school_id=s.school_id)`,[randomUUID(),job.id,job.site_id,JSON.stringify({error:(error as Error).message,periodStart:job.period_start,periodEnd:job.period_end})]);}
  }return (await this.db.query('SELECT * FROM financial_month_jobs ORDER BY period_start,site_id')).rows;
 }
}




