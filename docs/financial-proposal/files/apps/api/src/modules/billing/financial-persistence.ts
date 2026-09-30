import { queueDocumentDelivery } from './financial-delivery.js';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service.js';
import { calculateMeterCharge, validDate, requirePaymentTerm, requireFullSettlement } from './financial-invariants.js';

export async function inFinancialTransaction<T>(db: DatabaseService, work: (client: PoolClient)=>Promise<T>): Promise<T> {
 const client=await db.pool.connect();
 try { await client.query('BEGIN'); const value=await work(client); await client.query('COMMIT'); return value; }
 catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
export async function auditFinancial(client: PoolClient, id:string, action:string, actorId:string|null, before:unknown, after:unknown, entityType='billing_cycle') {
 await client.query(`INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,before_json,after_json,correlation_id) VALUES($1,$2,$3,$8,$4,$5,$6,$7)`,[randomUUID(),actorId,action,id,JSON.stringify(before),JSON.stringify(after),randomUUID(),entityType]);
}
export async function nextDocumentNumber(client: PoolClient, type:string, date:Date) {
 const key=type==='receipt'?'receiptPrefix':'invoicePrefix';
 const configured=await client.query('SELECT value FROM system_settings WHERE key=$1',[key]);
 const prefix=String(configured.rows[0]?.value || (type==='receipt'?'RCT{year}{month}':type==='billing_statement'?'STM{year}{month}':'INV{year}{month}')).replace('{year}',String(date.getUTCFullYear())).replace('{month}',String(date.getUTCMonth()+1).padStart(2,'0'));
 // Initialize above existing numbers when upgrading a deployed database; increment under row lock.
 const result=await client.query(`INSERT INTO document_number_series(prefix,last_value) VALUES($1,(SELECT coalesce(max(CASE WHEN substring(document_number from length($1)+1) ~ '^[0-9]+$' THEN substring(document_number from length($1)+1)::bigint ELSE 0 END),0)+1 FROM documents WHERE left(document_number,length($1))=$1)) ON CONFLICT(prefix) DO UPDATE SET last_value=document_number_series.last_value+1 RETURNING last_value`,[prefix]);
 return `${prefix}${String(result.rows[0].last_value).padStart(6,'0')}`;
}
export function requireAccountingPolicy(): void { throw new ConflictException('ACCOUNTING_NOT_CONFIRMED: confirm accounting form and implement validated tax/document policy before issuance'); }
export async function issueCycleDocument(client:PoolClient, cycle:any, type:'invoice'|'receipt') {
 const existing=await client.query(`SELECT id,document_number AS "documentNumber",status,amount,issue_date AS "issueDate",snapshot FROM documents WHERE billing_cycle_id=$1 AND document_type=$2`,[cycle.id,type]);
 if(existing.rows[0]) {
  if(!existing.rows[0].snapshot || !['issued','finalized'].includes(existing.rows[0].status)) throw new ConflictException('Existing legacy/draft document requires explicit reconciliation before issue');
  return existing.rows[0];
 }
 // Accounting policy and tax documents have not been approved. Never infer VAT or rounding.
 requireAccountingPolicy();
 if(cycle.quality!=='complete' || !cycle.meter_snapshot) throw new ConflictException('Billing requires verified actual meter snapshots before issue');
 const company=(await client.query('SELECT * FROM company_profile WHERE is_configured=true ORDER BY updated_at DESC LIMIT 1')).rows[0];
 if(!company?.company_name || !company?.tax_id || !company?.address) throw new ConflictException('Configure company name, tax ID and address before issuing documents');
 const customer=(await client.query(`SELECT c.*,s.name AS site_name,sc.name AS school_name FROM contracts c JOIN sites s ON s.id=c.site_id JOIN schools sc ON sc.id=s.school_id WHERE c.id=$1`,[cycle.contract_id])).rows[0];
 const banks=(await client.query('SELECT * FROM company_bank_accounts WHERE is_configured=true ORDER BY is_default DESC,created_at')).rows;
 const payment=type==='receipt'?(await client.query(`SELECT amount,paid_at,evidence_key FROM payments WHERE billing_cycle_id=$1 AND status='paid' ORDER BY verified_at DESC`,[cycle.id])).rows:[];
 if(!customer) throw new ConflictException('Customer contract details are required');
 if(type==='receipt') requireFullSettlement(payment.map((p:any)=>p.amount),cycle.amount);
 const issueDate=(await client.query("SELECT to_char(now() AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') AS day")).rows[0].day;
 const term=requirePaymentTerm(customer.payment_term_days);
 const dueDate=new Date(Date.parse(issueDate)+term*86400000).toISOString().slice(0,10);
 const snapshot={cycle,company,customer,banks,payment,issueDate,dueDate,paymentTermDays:term};
 const number=await nextDocumentNumber(client,type,new Date());
 const result=await client.query(`INSERT INTO documents(id,site_id,billing_cycle_id,document_type,document_number,status,issue_date,amount,snapshot,content_hash,render_eligible) VALUES($1,$2,$3,$4,$5,'issued',$9::date,$6,$7,$8,true) RETURNING id,document_number AS "documentNumber",status,amount,issue_date AS "issueDate"`,[randomUUID(),cycle.site_id,cycle.id,type,number,cycle.amount,JSON.stringify(snapshot),createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),issueDate]);
 await queueDocumentDelivery(client,result.rows[0].id);
 return result.rows[0];
}
export async function createMeasuredCycle(db:DatabaseService, siteId:string, start:string, end:string, actorId:string|null=null) {
 if(!validDate(start)||!validDate(end)||start>end) throw new BadRequestException('Valid ordered period dates are required');
 return inFinancialTransaction(db,async client=>{
 const site=(await client.query('SELECT id,timezone FROM sites WHERE id=$1 FOR UPDATE',[siteId])).rows[0];
 if(!site) throw new NotFoundException('Site not found');
 const duplicate=await client.query('SELECT id FROM billing_cycles WHERE site_id=$1 AND period_start <= $3::date AND period_end >= $2::date',[siteId,start,end]);
 if(duplicate.rows.length) throw new ConflictException('Billing period overlaps an existing cycle');
 const meters=(await client.query('SELECT * FROM billing_meters WHERE site_id=$1 AND active=true',[siteId])).rows;
 if(!meters.length) throw new ConflictException('No active billing meters configured');
 const contracts=(await client.query(`SELECT id,to_char(greatest(start_date,$2::date),'YYYY-MM-DD') AS starts,to_char(least(coalesce(end_date+1,'infinity'::date),$3::date+1),'YYYY-MM-DD') AS ends FROM contracts WHERE site_id=$1 AND status='active' AND start_date <= $3::date AND (end_date IS NULL OR end_date >= $2::date) ORDER BY start_date`,[siteId,start,end])).rows;
 if(!contracts.length)throw new ConflictException('No active contract in this billing month');
 for(let i=1;i<contracts.length;i++)if(contracts[i].starts<contracts[i-1].ends)throw new ConflictException('Contract periods overlap');
 const rates=(await client.query(`SELECT c.id AS contract_id,r.rate,to_char(greatest(r.effective_from,c.start_date,$2::date),'YYYY-MM-DD') AS starts,to_char(least(coalesce(r.effective_to,'infinity'::date),coalesce(c.end_date+1,'infinity'::date),$3::date+1),'YYYY-MM-DD') AS ends FROM rate_versions r JOIN contracts c ON c.id=r.contract_id WHERE c.site_id=$1 AND c.status='active' AND c.start_date <= $3::date AND (c.end_date IS NULL OR c.end_date >= $2::date) AND r.rate_type='fixed_kwh' AND r.currency='THB' AND r.effective_from < $3::date+1 AND (r.effective_to IS NULL OR r.effective_to > $2::date) ORDER BY starts`,[siteId,start,end])).rows;
 const cycles:any[]=[];
 let currentContract:string|null=null,segmentStart=contracts[0].starts;
 for(const contract of contracts)if(!rates.some(rate=>rate.contract_id===contract.id))throw new ConflictException('Contract has no effective rate');
 const flush=async(endBoundary:string)=>{
 if(!currentContract)return;
 const segmentEnd=new Date(Date.parse(endBoundary)-86400000).toISOString().slice(0,10);
 const res=await client.query(`INSERT INTO billing_cycles(id,site_id,contract_id,period_start,period_end,cutoff_time,status,quality,opening_energy,closing_energy,consumed_kwh,rate,amount,meter_snapshot) VALUES($1,$2,$3,$4,$5,($5::date+1)::timestamp AT TIME ZONE $6,'pending_review','complete',$7,$8,$9,$10,$11,$12) RETURNING *`,[randomUUID(),siteId,currentContract,segmentStart,segmentEnd,site.timezone,opening,closing,consumed,consumed?amount/consumed:0,Math.round(amount*100)/100,JSON.stringify(snapshots)]);
 await auditFinancial(client,res.rows[0].id,'billing.created',actorId,null,{siteId,contractId:currentContract,start:segmentStart,end:segmentEnd,consumedKwh:consumed,amount});
 cycles.push(res.rows[0]); consumed=0;amount=0;opening=0;closing=0;snapshots.length=0;segmentStart=endBoundary;
 };
 let cursor=contracts[0].starts,consumed=0,amount=0,opening=0,closing=0;
 const snapshots:any[]=[];
 for(const rate of rates){
  const from=String(rate.starts),to=String(rate.ends);
  if(currentContract && currentContract!==rate.contract_id){
   const previous=contracts.find(c=>c.id===currentContract);
   if(cursor!==previous.ends)throw new ConflictException('Effective rates do not cover the contract');
   await flush(cursor);
   cursor=contracts.find(c=>c.id===rate.contract_id).starts;segmentStart=cursor;
  }
  if(from!==cursor || to<=from) throw new ConflictException('Effective rates overlap or do not cover the contract');
  currentContract=rate.contract_id;
  for(const meter of meters){
   const readings=[];
   for(const boundary of [from,to]){
    const result=await client.query(`SELECT r.*,($3::date::timestamp AT TIME ZONE $4) AS target_time FROM (
      SELECT tr.normalized_value AS value,tr.source_time,tr.id,'telemetry' AS provenance,tr.received_time AS approved_time FROM telemetry_raw tr JOIN register_mapping_versions m ON m.id=tr.mapping_version_id WHERE tr.device_id=$1 AND m.semantic_field=$2 AND tr.quality='complete' AND lower(tr.unit)='kwh'
      UNION ALL SELECT e.value,e.source_time,e.id,'evidence' AS provenance,e.approved_at AS approved_time FROM evidence_readings e WHERE e.billing_meter_id=$5 AND e.approved_at IS NOT NULL
     ) r WHERE abs(extract(epoch FROM (r.source_time-($3::date::timestamp AT TIME ZONE $4)))) <= 300 ORDER BY CASE WHEN provenance='evidence' THEN 0 ELSE 1 END,CASE WHEN provenance='evidence' THEN approved_time END DESC,abs(extract(epoch FROM (r.source_time-($3::date::timestamp AT TIME ZONE $4)))),source_time DESC,id LIMIT 1`,[meter.device_id,meter.semantic_field,boundary,site.timezone,meter.id]);
    if(!result.rows[0]) throw new ConflictException(`Missing actual cumulative reading for meter ${meter.id} at ${boundary}`);
    readings.push(result.rows[0]);
   }
   let charge;
   try{charge=calculateMeterCharge(readings[0].value,readings[1].value,rate.rate);}catch(error){throw new ConflictException((error as Error).message);}
   consumed+=charge.consumedKwh; amount+=charge.amount;
   if(from===segmentStart) opening+=Number(readings[0].value);
   closing+=Number(readings[1].value)-Number(from===segmentStart?0:readings[0].value);
   snapshots.push({contractId:rate.contract_id,meterId:meter.id,from,to,rate:Number(rate.rate),opening:readings[0],closing:readings[1],...charge});
  }
  cursor=to;
 }
 if(cursor!==contracts[contracts.length-1].ends) throw new ConflictException('No effective rate covers the entire contract period');
 await flush(cursor);
 return {cycles};
 });
}

/** Evidence correction proposals preserve issued originals; financial approval is separate. */
export async function requestEvidenceCorrections(client:PoolClient,evidence:any,actorId:string){
 const affected=(await client.query(`SELECT b.* FROM billing_cycles b JOIN billing_meters m ON m.site_id=b.site_id WHERE m.id=$1 AND b.meter_snapshot IS NOT NULL AND EXISTS(SELECT 1 FROM documents d WHERE d.billing_cycle_id=b.id AND d.status IN ('issued','finalized')) FOR UPDATE OF b`,[evidence.billing_meter_id])).rows;
 const requests=[];
 for(const cycle of affected){
  let matched=false;
  const segments=cycle.meter_snapshot.map((segment:any)=>{
   const copy={...segment,opening:{...segment.opening},closing:{...segment.closing}};
   if(segment.meterId===evidence.billing_meter_id)for(const key of ['opening','closing']){
    // Legacy snapshots without a target boundary cannot safely be corrected automatically.
    if(segment[key].target_time && Math.abs(new Date(segment[key].target_time).getTime()-new Date(evidence.source_time).getTime())<=300000){copy[key]={...copy[key],value:evidence.value,id:evidence.id,source_time:evidence.source_time,provenance:'evidence'};matched=true;}
   }
   return copy;
  });
  if(!matched)continue;
  const amount=segments.reduce((sum:number,segment:any)=>sum+calculateMeterCharge(segment.opening.value,segment.closing.value,segment.rate).amount,0);
  const request=(await client.query(`INSERT INTO financial_corrections(id,billing_cycle_id,evidence_reading_id,requested_by,reason,original_amount,proposed_amount,impact_amount,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending_financial_request') RETURNING *`,[randomUUID(),cycle.id,evidence.id,actorId,evidence.reason,cycle.amount,amount,amount-Number(cycle.amount)])).rows[0];
  await auditFinancial(client,request.id,'correction.requested',actorId,null,{...request,segments},'financial_correction'); requests.push(request);
 }
 return requests;
}
