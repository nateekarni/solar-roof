import {configuredTotals,manualTotals,scaledDecimal,type ManualLine} from './site-billing-policy.js';
import { billableBoundary, verifyBillingSegment } from './billing-source-readings.js';
import { BadRequestException, ForbiddenException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { PoolClient } from 'pg';
import { deliverSavedArtifacts, frozenRecipients, originalArtifactHash } from './saved-document-delivery.js';
import { customerScope, type ScopePrincipal } from '../../common/auth/route-policy.js';
import {hasPermission,siteScope} from '../../common/auth/authorization.js';
import { DatabaseService } from '../../database/database.service.js';
import { FinancialReadinessService } from './financial-readiness.service.js';
import { calculateTestTotals, requireTestTransferAmount, validFinancialDate, decimal, sqlCalendarPeriod, actualEnergyDifference, requireTestSettlement, TEST_FINANCIAL_POLICY, TEST_FINANCIAL_POLICY_HASH, localFinancialBinding } from './local-financial-policy.js';
import { BRAND_PRIMARY } from '@solar/domain';
import type { PaymentSubmission } from '@solar/api-contracts';
import { reviewedPaymentMetadata } from './payment-metadata.js';
import { allocateDocumentNumber } from '../documents/document-number.js';
import { FINANCIAL_TEMPLATE_VERSION, renderLocalTestPdf } from '../documents/local-test-pdf.js';
import {frozenFinancialLogo} from './frozen-financial-logo.js';
import {frozenFinancialTax} from './frozen-financial-tax.js';
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
   const prior=(await client.query(`SELECT *,to_char(period_start,'YYYY-MM-DD') AS starts,to_char(period_end,'YYYY-MM-DD') AS ends FROM billing_cycles WHERE billing_kind='energy' AND site_id=$1 AND period_start<=$3::date AND period_end>=$2::date`,[siteId,start,end])).rows;
   if(prior.length) {if(prior.length===1&&prior[0].policy_hash===TEST_FINANCIAL_POLICY_HASH&&prior[0].starts===start&&prior[0].ends===end)return {cycles:prior};throw new ConflictException('Billing period overlaps an existing cycle');}
   const config=(await client.query("SELECT *,to_char(service_start_date,'YYYY-MM-DD') AS starts FROM site_billing_settings WHERE site_id=$1",[siteId])).rows[0];
   if(!config)throw new ConflictException('Site billing configuration required');if(!config.tax_confirmed||config.tax_rate===null)throw new ConflictException('Confirmed site tax configuration required');if(start<config.starts)throw new ConflictException('Period begins before service start');
   const rates=(await client.query(`WITH effective AS (SELECT *,lead(effective_from) OVER(ORDER BY effective_from,id) AS next_from FROM rate_versions WHERE site_id=$1 AND retired_at IS NULL) SELECT *,to_char(greatest(effective_from,$2::date),'YYYY-MM-DD') AS starts,to_char(least(coalesce(effective_to+1,next_from,'infinity'::date),$3::date+1),'YYYY-MM-DD') AS ends FROM effective WHERE effective_from<=$3::date AND coalesce(effective_to+1,next_from,'infinity'::date)>$2::date ORDER BY effective_from`,[siteId,start,end])).rows;
   const meters=(await client.query('SELECT * FROM billing_meters WHERE site_id=$1 AND active=true ORDER BY id',[siteId])).rows;
   if(!meters.length||!rates.length)throw new ConflictException('Billing meters and effective rate required');
   const finalBoundary=new Date(Date.parse(end)+86400000).toISOString().slice(0,10);let cursor=start;const snapshots:any[]=[];
   let energy=0n,subtotal=0n;let opening=0,closing=0;
   for(const rate of rates){
    if(rate.starts!==cursor||rate.ends<=rate.starts||rate.currency!=='THB'||rate.rate_type!=='fixed_kwh')throw new ConflictException('Effective rates overlap or do not cover the period');
    for(const meter of meters){const readings:any[]=[];
     for(const boundary of [rate.starts,rate.ends]){
      const reading=await billableBoundary(client,meter,boundary,site.timezone,siteId);
      if(!reading)throw new ConflictException(`Missing actual cumulative reading for meter ${meter.id} at ${boundary}`);readings.push(reading);
     }
     await verifyBillingSegment(client,meter,siteId,readings[0],readings[1]);
     const totals=calculateTestTotals(reviewedActualEnergyDifference(readings[0].value,readings[1].value),rate.rate);
     energy+=BigInt(totals.consumedKwh.replace('.',''));subtotal+=BigInt(totals.subtotal.replace('.',''));
     if(rate.starts===start)opening+=Number(readings[0].value);if(rate.ends===finalBoundary)closing+=Number(readings[1].value);
     snapshots.push({meterId:meter.id,billingSettingsVersion:config.version,from:rate.starts,to:rate.ends,opening:readings[0],closing:readings[1],...totals});
    }cursor=rate.ends;
   }
   if(cursor!==finalBoundary)throw new ConflictException('No effective rate covers whole period');
   const totals=configuredTotals(decimal(subtotal,2),config.tax_rate,config.prices_include_tax);const tax=scaledDecimal(totals.tax,2);const id=randomUUID();
   const result=await client.query(`INSERT INTO billing_cycles(id,site_id,billing_settings_version,period_start,period_end,cutoff_time,status,quality,opening_energy,closing_energy,consumed_kwh,rate,amount,subtotal,simulated_tax,meter_snapshot,policy_hash) VALUES($1,$2,$3,$4,$5,($5::date+1)::timestamp AT TIME ZONE $6,'pending_review','complete',$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,[id,siteId,config.version,start,end,site.timezone,opening,closing,decimal(energy,3), rates.length===1?snapshots[0].rate:decimal(energy?(subtotal*100000n+energy/2n)/energy:0n,4),totals.total,totals.subtotal,totals.tax,JSON.stringify(snapshots),TEST_FINANCIAL_POLICY_HASH]);
   return {cycles:result.rows};
  });
 }
 private async issue(client:PoolClient,cycle:any,type:'invoice'|'receipt') {
  const existing=(await client.query('SELECT * FROM documents WHERE billing_cycle_id=$1 AND document_type=$2 AND is_current',[cycle.id,type])).rows;
  if(existing.length){if(existing.length!==1||!existing[0].snapshot?.policy||!['issued','finalized'].includes(existing[0].status))throw new ConflictException('Legacy document requires explicit reconciliation');return existing[0];}
  if(cycle.quality!=='complete'||!cycle.meter_snapshot||cycle.policy_hash!==TEST_FINANCIAL_POLICY_HASH)throw new ConflictException('Verified actual TEST calculation required');
  const customer=(await client.query(`SELECT cfg.*,sc.id AS customer_id,sc.legal_name AS company_name,sc.tax_id,sc.tax_branch AS branch,sc.tax_address,sc.document_email AS billing_email,sc.phone AS billing_phone,s.name AS site_name,s.external_site_id,sc.name AS customer_name FROM site_billing_settings cfg JOIN sites s ON s.id=cfg.site_id JOIN customers sc ON sc.id=s.customer_id WHERE cfg.site_id=$1`,[cycle.site_id])).rows[0];
  if(type==='invoice'&&cycle.billing_settings_version!==undefined&&cycle.billing_settings_version!==null&&cycle.billing_settings_version!==customer?.version)throw new ConflictException('Site billing configuration changed; recalculate before issuance');
  const company=(await client.query('SELECT * FROM company_profile WHERE is_configured=true ORDER BY updated_at DESC LIMIT 1')).rows[0];
  if(!company?.company_name||!company.tax_id||!company.address||!customer?.company_name||!customer.tax_id||!customer.tax_address)throw new ConflictException('Complete issuer and customer tax identity required');
  if(!customer.tax_confirmed||customer.tax_rate===null)throw new ConflictException('Confirmed site tax configuration required');
  if(!Number.isInteger(customer.payment_term_days))throw new ConflictException('Explicit paymentTermDays required');
  const banks=(await client.query('SELECT * FROM company_bank_accounts WHERE is_configured=true ORDER BY is_default DESC,created_at')).rows;
  if(!banks.some(bank=>bank.bank_name?.trim()&&bank.account_name?.trim()&&bank.account_number?.trim()))throw new ConflictException('Usable configured payment account required');
  const recipients=(await client.query(`SELECT u.id,u.email,u.display_name AS name FROM users u JOIN site_account_assignments sa ON sa.user_id=u.id AND sa.revoked_at IS NULL JOIN sites s ON s.id=sa.site_id JOIN customers sc ON sc.id=s.customer_id WHERE s.id=$1 AND u.id=ANY($2::uuid[]) AND u.role='customer_user' AND u.status='active' AND sc.status='active' AND u.email_verified_at IS NOT NULL AND u.verified_email=u.email ORDER BY u.id`,[cycle.site_id,customer.recipient_user_ids])).rows;
  if(!recipients.length||recipients.length!==customer.recipient_user_ids.length)throw new ConflictException('Selected verified organization recipients required');
  const payments=type==='receipt'?(await client.query("SELECT * FROM payments WHERE billing_cycle_id=$1 AND status='paid' ORDER BY submitted_at,id",[cycle.id])).rows:[];
  if(type==='receipt')requireTestSettlement(payments.map(p=>p.verified_amount),cycle.amount);
  const {number,issueDate:day}=await allocateDocumentNumber(client,type);
  const invoiceOriginal=type==='receipt'?(await client.query("SELECT document_number,snapshot FROM documents WHERE billing_cycle_id=$1 AND document_type='invoice' AND is_current",[cycle.id])).rows[0]:undefined;const invoiceNumber=invoiceOriginal?.document_number;
  if(type==='receipt'&&!invoiceNumber)throw new ConflictException('Issued invoice reference required');
  const logo=await readFile(fileURLToPath(new URL('../../../../web/public/brand/solar-roof-document-stacked.png',import.meta.url)));
  const cycleDates=(await client.query(`SELECT to_char(period_start,'YYYY-MM-DD') AS starts,to_char(period_end,'YYYY-MM-DD') AS ends,to_char(due_date,'YYYY-MM-DD') AS due FROM billing_cycles WHERE id=$1`,[cycle.id])).rows[0];
  cycle={...cycle,period_start:cycleDates.starts,period_end:cycleDates.ends,due_date:cycle.due_date&&typeof cycle.due_date==='string'?cycle.due_date:cycleDates.due};
  const snapshot={brandPrimary:BRAND_PRIMARY,...(invoiceNumber?{invoiceNumber}:{}),templateVersion:FINANCIAL_TEMPLATE_VERSION,policy:{...TEST_FINANCIAL_POLICY,...frozenFinancialTax(invoiceOriginal?.snapshot?.policy,customer.tax_rate,customer.prices_include_tax)},policyHash:TEST_FINANCIAL_POLICY_HASH,cycle,customer:invoiceOriginal?.snapshot?.customer??customer,company:invoiceOriginal?.snapshot?.company??company,banks:invoiceOriginal?.snapshot?.banks??banks,payments,recipients,logo:frozenFinancialLogo(invoiceOriginal?.snapshot?.logo,company.logo_url,`data:image/png;base64,${logo.toString('base64')}`),language:'th',issueDate:day,dueDate:cycle.due_date?(typeof cycle.due_date==='string'?cycle.due_date.slice(0,10):cycle.due_date.toISOString().slice(0,10)):new Date(Date.parse(day)+customer.payment_term_days*86400000).toISOString().slice(0,10)};
  const document={id:randomUUID(),document_number:number,document_type:type,snapshot,amount:cycle.amount};
  const bytes=await renderLocalTestPdf(document);const sha256=createHash('sha256').update(bytes).digest('hex');
  const doc=(await client.query(`INSERT INTO documents(id,site_id,billing_cycle_id,document_type,document_number,status,issue_date,amount,snapshot,content_hash,file_key,template_version,revision,supersedes_document_id) VALUES($1,$2,$3,$4,$5,'issued',$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,[document.id,cycle.site_id,cycle.id,type,number,day,cycle.amount,JSON.stringify(snapshot),sha256,`local-artifact:${document.id}`,FINANCIAL_TEMPLATE_VERSION,cycle.document_revision??1,cycle.supersedes_document_id??null])).rows[0];
  if(type==='invoice')await client.query('UPDATE billing_cycles SET due_date=$2 WHERE id=$1 AND due_date IS NULL',[cycle.id,snapshot.dueDate]);
  await client.query('INSERT INTO document_artifacts(document_id,pdf_bytes,sha256) VALUES($1,$2,$3)',[doc.id,bytes,sha256]);
  await client.query('INSERT INTO financial_delivery_outbox(id,document_id,artifact_sha256) VALUES($1,$2,$3)',[randomUUID(),doc.id,sha256]);return doc;
 }
 async reviseInvoiceInTransaction(client:PoolClient,cycle:any,rate:string){
  await this.readiness.assertEnabled('adjust');const old=(await client.query("SELECT * FROM documents WHERE billing_cycle_id=$1 AND document_type='invoice' AND is_current FOR UPDATE",[cycle.id])).rows[0];if(!old?.snapshot)throw new ConflictException('Current saved invoice required');
  const config=(await client.query('SELECT * FROM site_billing_settings WHERE site_id=$1',[cycle.site_id])).rows[0];if(!config?.tax_confirmed)throw new ConflictException('Confirmed site tax required');
  const energy=scaledDecimal(cycle.consumed_kwh,3),price=scaledDecimal(rate,4);const gross=decimal((energy*price+50000n)/100000n,2);const totals=configuredTotals(gross,config.tax_rate,config.prices_include_tax);
  const snapshots=(cycle.meter_snapshot??[]).map((line:any)=>{const quantity=scaledDecimal(line.consumedKwh,3);return {...line,rate,subtotal:decimal((quantity*price+50000n)/100000n,2)};});
  await client.query("UPDATE documents SET status='superseded',is_current=false WHERE id=$1",[old.id]);
  const updated=(await client.query('UPDATE billing_cycles SET rate=$2,amount=$3,subtotal=$4,simulated_tax=$5,meter_snapshot=$6,billing_settings_version=$7 WHERE id=$1 RETURNING *',[cycle.id,rate,totals.total,totals.subtotal,totals.tax,JSON.stringify(snapshots),config.version])).rows[0];
  return this.issue(client,{...updated,due_date:old.snapshot.dueDate,document_revision:old.revision+1,supersedes_document_id:old.id},'invoice');
 }
 async manualInvoice(input:{siteId:string;lines:ManualLine[];note?:string;dueDate?:string}){
  await this.readiness.assertEnabled('issue');if(input.dueDate&&!validDate(input.dueDate))throw new BadRequestException('Valid due date required');
  const result=await this.db.transaction(async client=>{await client.query('SELECT id FROM sites WHERE id=$1 FOR UPDATE',[input.siteId]);const cfg=(await client.query('SELECT * FROM site_billing_settings WHERE site_id=$1',[input.siteId])).rows[0];if(!cfg?.tax_confirmed)throw new ConflictException('Confirmed site tax required');let totals;try{totals=manualTotals(input.lines,cfg.tax_rate,cfg.prices_include_tax);}catch(error){throw new BadRequestException((error as Error).message);}
   const cycle=(await client.query(`INSERT INTO billing_cycles(id,site_id,period_start,period_end,cutoff_time,status,quality,opening_energy,closing_energy,consumed_kwh,rate,amount,subtotal,simulated_tax,meter_snapshot,policy_hash,billing_settings_version,billing_kind,manual_lines,billing_note,due_date) VALUES($1,$2,current_date,current_date,now(),'approved','complete',0,0,0,0,$3,$4,$5,'[]',$6,$7,'manual',$8,$9,$10) RETURNING *`,[randomUUID(),input.siteId,totals.total,totals.subtotal,totals.tax,TEST_FINANCIAL_POLICY_HASH,cfg.version,JSON.stringify(totals.lines),input.note?.trim()??null,input.dueDate??null])).rows[0];return {cycle,document:await this.issue(client,cycle,'invoice')};});await this.send(result.cycle.id);return result;
 }
 async issueInvoice(id:string){await this.readiness.assertEnabled('issue');return this.db.transaction(async client=>{const cycle=(await client.query('SELECT * FROM billing_cycles WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!cycle)throw new NotFoundException('Billing cycle not found');const document=await this.issue(client,cycle,'invoice');await client.query("UPDATE billing_cycles SET status=CASE WHEN status IN('paid','pending_verification') THEN status ELSE 'approved' END WHERE id=$1",[id]);return {created:true,document:{...document,documentNumber:document.document_number}};});}
 async submitPayment(id:string,body:PaymentSubmission,actorId:string|undefined){
  if(!actorId)throw new BadRequestException('Actor required');
  const metadata=reviewedPaymentMetadata(body);
  let amount:string|null=null;try{if(body.amount!==undefined)amount=requireTestTransferAmount(body.amount);}catch(error){throw new BadRequestException((error as Error).message);}
  if(!body.slipUrl&&!body.evidenceKey)throw new BadRequestException('Transfer evidence required');
  const paidAt=body.paidAt?new Date(body.paidAt):null;if(paidAt&&!Number.isFinite(paidAt.getTime()))throw new BadRequestException('Valid transfer date required');
  return this.db.transaction(async client=>{
   const cycle=(await client.query('SELECT * FROM billing_cycles WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!cycle)throw new NotFoundException('Billing cycle not found');
   if(!['approved','pending_verification'].includes(cycle.status)||cycle.policy_hash!==TEST_FINANCIAL_POLICY_HASH)throw new ConflictException('Issued unpaid TEST invoice required');
   const invoice=(await client.query("SELECT id FROM documents WHERE billing_cycle_id=$1 AND document_type='invoice' AND status='issued'",[id])).rows[0];if(!invoice)throw new ConflictException('Issued invoice required');
   const duplicate=await client.query(`SELECT 1 FROM payments WHERE submitted_by IS NOT NULL AND status IN('pending_verification','paid') AND (payment_evidence_sha256(evidence_key)=payment_evidence_sha256($1::text) OR payment_evidence_sha256(slip_url)=payment_evidence_sha256($2::text))`,[body.evidenceKey??null,body.slipUrl??null]);if(duplicate.rowCount)throw new ConflictException('Transfer evidence already submitted');
   const paymentId=randomUUID();await client.query(`INSERT INTO payments(id,billing_cycle_id,amount,status,paid_at,slip_url,evidence_key,note,submitted_by,payer_name,payment_method,origin_bank,origin_account,declared_amount,declared_transfer_at) VALUES($1,$2,$3,'pending_verification',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[paymentId,id,null,null,body.slipUrl??null,body.evidenceKey??null,body.note??null,actorId,metadata.payerName??null,metadata.paymentMethod??null,metadata.originBank??null,metadata.originAccount??null,amount,paidAt]);
   await client.query("UPDATE billing_cycles SET status='pending_verification' WHERE id=$1",[id]);return {success:true,paymentId,status:'pending_verification'};
  }).catch(error=>{if(error?.code==='23505'&&['payments_new_active_evidence','payments_new_active_slip'].includes(error.constraint))throw new ConflictException('Transfer evidence already submitted');throw error;});
 }
 async verifyPayment(id:string,status:string,reason:string|undefined,actorId:string|undefined,review?:{paymentId:string;verifiedAmount?:string|number;verifiedTransferAt?:string;transferReference?:string;payerName?:string|null;paymentMethod?:'bank_transfer'|'promptpay'|null;originBank?:string|null;originAccount?:string|null}){
  await this.readiness.assertEnabled('approve_payment');if(!actorId)throw new BadRequestException('Actor required');if(!['approved','rejected'].includes(status))throw new BadRequestException('Invalid verification status');
  if(!review?.paymentId)throw new BadRequestException('Select one transfer to review');
  const metadata=reviewedPaymentMetadata(review);
  let verifiedAmount:string|null=null;let verifiedTransferAt:Date|null=null;
  if(status==='approved'){
   try{verifiedAmount=requireTestTransferAmount(review.verifiedAmount);}catch(error){throw new BadRequestException((error as Error).message);}
   if(!review.verifiedTransferAt)throw new BadRequestException('Confirmed transfer date and time required');
   verifiedTransferAt=new Date(review.verifiedTransferAt);if(!Number.isFinite(verifiedTransferAt.getTime()))throw new BadRequestException('Valid confirmed transfer date and time required');
  }
  return this.db.transaction(async client=>{
   const actor=(await client.query('SELECT role,status FROM users WHERE id=$1',[actorId])).rows[0];if(!actor||actor.status!=='active')throw new ForbiddenException('Live payment approval required');
   const cycle=(await client.query('SELECT * FROM billing_cycles WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!cycle)throw new NotFoundException('Billing cycle not found');
   if(!(await client.query("SELECT employee_can_access($1,'business','business.billing.approve',$2) AS allowed",[actorId,cycle.site_id])).rows[0]?.allowed)throw new ForbiddenException('Live scoped payment approval required');
   if(cycle.status==='paid'){const receipt=(await client.query("SELECT * FROM documents WHERE billing_cycle_id=$1 AND document_type='receipt'",[id])).rows[0];if(status==='approved'&&receipt)return {success:true,billingCycleStatus:'paid',receipt};throw new ConflictException('Paid cycle cannot be rejected');}
   const payments=(await client.query("SELECT * FROM payments WHERE billing_cycle_id=$1 ORDER BY submitted_at,id FOR UPDATE",[id])).rows;
   const payment=payments.find(p=>p.id===review.paymentId);if(!payment)throw new NotFoundException('Transfer not found');
   if(payment.status!=='pending_verification')throw new ConflictException('Transfer has already been reviewed');
   if(status==='rejected'&&!reason?.trim())throw new BadRequestException('Rejection reason required');
   const minor=(value:string)=>{const [whole,fraction='']=value.split('.');return BigInt(whole!)*100n+BigInt(fraction.padEnd(2,'0').slice(0,2));};
   const approvedTotal=payments.filter(p=>p.status==='paid').reduce((total,p)=>total+minor(p.verified_amount),0n);
   const total=status==='approved'?approvedTotal+minor(verifiedAmount!):approvedTotal;
   if(total>minor(cycle.amount))throw new ConflictException('Confirmed transfers exceed the bill; resolve the difference before approval');
   if(status==='approved'&&review.transferReference?.trim()){
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[review.transferReference.trim()]);
    if((await client.query("SELECT id FROM payments WHERE transfer_reference=$1 AND status='paid'",[review.transferReference.trim()])).rows.length)throw new ConflictException('Transfer reference already approved');
   }
   await client.query('UPDATE payments SET status=$2,verified_at=now(),verified_by=$3,rejection_reason=$4,verified_amount=$5,verified_transfer_at=$6,amount=$5,paid_at=$6,transfer_reference=$7,payer_name=coalesce($8,payer_name),payment_method=coalesce($9,payment_method),origin_bank=coalesce($10,origin_bank),origin_account=coalesce($11,origin_account) WHERE id=$1',[payment.id,status==='approved'?'paid':'rejected',actorId,reason?.trim()??null,verifiedAmount,verifiedTransferAt,review.transferReference?.trim()||null,metadata.payerName??null,metadata.paymentMethod??null,metadata.originBank??null,metadata.originAccount??null]);
   const settled=total===minor(cycle.amount);
   const pending=payments.some(p=>p.id!==payment.id&&p.status==='pending_verification');
   const cycleStatus=settled?'paid':pending?'pending_verification':'approved';
   const receipt=settled?await this.issue(client,cycle,'receipt'):null;
   await client.query('UPDATE billing_cycles SET status=$2 WHERE id=$1',[id,cycleStatus]);
   await client.query("INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,before_json,after_json,reason,correlation_id) VALUES($1,$2,$3,'payment',$4,$5,$6,$7,$8)",[randomUUID(),actorId,'payment.verify_'+status,payment.id,JSON.stringify(payment),JSON.stringify({status,verifiedAmount,verifiedTransferAt,cycleStatus,...metadata}),reason?.trim()??'Transfer approved',randomUUID()]);
   return {success:true,billingCycleStatus:cycleStatus,receipt};
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
  if(!hasPermission(actor,'business.billing.edit'))throw new ForbiddenException('Contract author required');
  await this.readiness.assertEnabled('send');if(!localFinancialBinding())throw new ConflictException('Local mail capture binding required');
  const lock=await this.db.pool.connect();const key=`contract-mail:${id}`;
  try{
   const scope=siteScope(actor,'business');const params:unknown[]=[id];if(scope!==null)params.push(scope);
   const contract=(await lock.query(`SELECT c.id,c.site_id FROM contracts c JOIN sites s ON s.id=c.site_id WHERE c.id=$1 ${scope===null?'':'AND s.id=ANY($2::uuid[])'}`,params)).rows[0];
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
  await this.db.query(`INSERT INTO financial_month_jobs(id,site_id,period_start,period_end) SELECT gen_random_uuid(),s.id,$1,$2 FROM sites s WHERE EXISTS(SELECT 1 FROM site_billing_settings cfg WHERE cfg.site_id=s.id AND cfg.service_start_date<=$2::date) ON CONFLICT(site_id,period_start) DO NOTHING`,[start,end]);
  const jobs=(await this.db.query("SELECT *,to_char(period_start,'YYYY-MM-DD') AS starts,to_char(period_end,'YYYY-MM-DD') AS ends FROM financial_month_jobs WHERE state IN('pending','blocked') AND next_attempt_at<=now() ORDER BY period_start,site_id")).rows;
  for(const job of jobs){try{let cycles=(await this.db.query('SELECT bc.* FROM billing_cycles bc JOIN site_billing_settings cfg ON cfg.site_id=bc.site_id WHERE bc.site_id=$1 AND bc.period_start=greatest($2::date,cfg.service_start_date) AND bc.period_end=$3',[job.site_id,job.period_start,job.period_end])).rows;
    if(!cycles.length){const cfg=(await this.db.query("SELECT to_char(service_start_date,'YYYY-MM-DD') AS starts FROM site_billing_settings WHERE site_id=$1",[job.site_id])).rows[0];if(!cfg)throw new ConflictException('Site billing configuration required');cycles=(await this.calculate(job.site_id,[sqlCalendarPeriod(job).start,cfg.starts].sort().at(-1)!,sqlCalendarPeriod(job).end)).cycles;}
    for(const cycle of cycles){await this.issueInvoice(cycle.id);await this.send(cycle.id);}await this.db.query("UPDATE financial_month_jobs SET state='done',completed_at=now(),last_error=NULL,last_attempt_at=now() WHERE id=$1",[job.id]);
   }catch(error){await this.db.query("UPDATE financial_month_jobs SET state='blocked',attempts=attempts+1,last_error=$2,last_attempt_at=now(),next_attempt_at=now()+interval '1 hour' WHERE id=$1",[job.id,(error as Error).message]);
    await this.db.query(`WITH notice AS (INSERT INTO financial_staff_notices(id,job_id,site_id,kind,detail) VALUES($1,$2,$3,'monthly_billing_blocked',$4) ON CONFLICT(job_id,kind) DO NOTHING RETURNING id) INSERT INTO notification_deliveries(id,user_id,title,channel,recipient,status) SELECT gen_random_uuid(),u.id,'TEST monthly billing blocked: '||s.name||' · '||($4::jsonb->>'error'),'system',u.email,'delivered' FROM notice CROSS JOIN users u JOIN sites s ON s.id=$3 WHERE u.status='active' AND u.role IN('owner','accountant') AND (u.customer_id IS NULL OR u.customer_id=s.customer_id)`,[randomUUID(),job.id,job.site_id,JSON.stringify({error:(error as Error).message,periodStart:job.period_start,periodEnd:job.period_end})]);}
  }return (await this.db.query('SELECT * FROM financial_month_jobs ORDER BY period_start,site_id')).rows;
 }
}
