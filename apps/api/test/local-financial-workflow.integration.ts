import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../src/database/database.service.js';
import { FinancialReadinessService } from '../src/modules/billing/financial-readiness.service.js';
import { LocalFinancialApplicationService } from '../src/modules/billing/local-financial-application.service.js';
import { localFinancialBinding } from '../src/modules/billing/local-financial-policy.js';
if(!localFinancialBinding())throw new Error('Exact local TEST binding required');
const api='http://127.0.0.1:13059',mail='http://127.0.0.1:18049';
const id=(key:string)=>createHash('sha256').update(`solar-financial-flow-review-v1:${key}`).digest('hex').slice(0,32).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5');
const db=new DatabaseService();const readiness=new FinancialReadinessService(db),application=new LocalFinancialApplicationService(db,readiness);
async function login(email:string){const response=await fetch(`${api}/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:13049'},body:JSON.stringify({email,password:process.env.LOCAL_FINANCIAL_TEST_PASSWORD??'LocalFinancial2026!'})});if(response.status!==200)throw new Error(await response.text());return (await response.json()).accessToken as string;}
async function request(token:string,path:string,method='GET',body?:unknown,expected=200){const response=await fetch(`${api}${path}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Origin:'http://localhost:13049'},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await response.text();assert.equal(response.status,expected,`${method} ${path}: ${value}`);return value?JSON.parse(value):null;}
async function attachment(document:any,token:string){const response=await fetch(`${api}/v1/operations/documents/${document.id}/pdf`,{headers:{Authorization:`Bearer ${token}`}});assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.subarray(0,5).toString(),'%PDF-');const hash=createHash('sha256').update(bytes).digest('hex');assert.equal(hash,document.content_hash);
 const messages=await (await fetch(`${mail}/api/v1/messages`)).json();const item=messages.messages.find((m:any)=>m.Subject.includes(document.document_number));assert.ok(item,'Captured actual SMTP message required');const detail=await (await fetch(`${mail}/api/v1/message/${item.ID}`)).json();assert.equal(detail.Attachments.length,1);const captured=Buffer.from(await (await fetch(`${mail}/api/v1/message/${item.ID}/part/${detail.Attachments[0].PartID}`)).arrayBuffer());assert.equal(createHash('sha256').update(captured).digest('hex'),hash);return hash;}
try {
 const owner=await login('owner@example.test'),accountant=await login('accountant@example.test'),userA=await login('finance-a@example.test'),userB=await login('finance-b@example.test');
 const capabilities=await request(owner,'/v1/auth/capabilities');assert.ok(capabilities.actions.includes('calculate'));assert.ok(!capabilities.actions.includes('adjust'));
 // Real monthly business operation with selected simulated scheduler time; issuer dates use actual approval time.
 const jobs=await application.monthly(new Date('2026-10-01T01:00:00+07:00'));const done=jobs.find(j=>j.site_id===id('site-a-main')),blocked=jobs.find(j=>j.site_id===id('site-b-missing'));assert.equal(done.state,'done');assert.equal(blocked.state,'blocked');assert.match(blocked.last_error,/Missing actual cumulative reading/);
 const replay=await application.monthly(new Date('2026-10-01T01:00:00+07:00'));assert.equal(replay.find(j=>j.id===blocked.id).attempts,blocked.attempts,'hourly recheck gate');
 const september=(await db.query('SELECT * FROM billing_cycles WHERE site_id=$1 AND period_start=$2',[id('site-a-main'),'2026-09-01'])).rows[0];assert.equal(Number(september.amount),4623.45);
 const invoice=(await db.query("SELECT * FROM documents WHERE billing_cycle_id=$1 AND document_type='invoice'",[september.id])).rows[0];assert.equal(invoice.snapshot.customer.id,september.contract_id);const invoiceHash=await attachment(invoice,owner);
 await request(userB,`/v1/billing-cycles/${september.id}/pay`,'POST',{amount:4623.45,evidenceKey:'cross-org'},403);
 await request(userB,`/v1/operations/documents/${invoice.id}/pdf`,'GET',undefined,404);
 await request(userA,`/v1/billing-cycles/${september.id}/pay`,'POST',{amount:4623.45,evidenceKey:'synthetic-rejected-transfer'},201);
 await request(accountant,`/v1/billing-cycles/${september.id}/verify-payment`,'PATCH',{status:'rejected',rejectionReason:'Synthetic rejection scenario'});
 await request(userA,`/v1/billing-cycles/${september.id}/pay`,'POST',{amount:2000,evidenceKey:'synthetic-resubmit-transfer-1'},201);
 await request(accountant,`/v1/billing-cycles/${september.id}/verify-payment`,'PATCH',{status:'approved'},409);
 await request(userA,`/v1/billing-cycles/${september.id}/pay`,'POST',{amount:2623.45,evidenceKey:'synthetic-resubmit-transfer-2'},201);
 await request(userA,`/v1/billing-cycles/${september.id}/pay`,'POST',{amount:2623.45,evidenceKey:'synthetic-resubmit-transfer-2'},409);
 const approval=await request(accountant,`/v1/billing-cycles/${september.id}/verify-payment`,'PATCH',{status:'approved'});const receipt=approval.receipt;assert.equal(receipt.snapshot.payments.length,2);const receiptHash=await attachment(receipt,owner);
 const counts=(await db.query('SELECT (SELECT count(*) FROM documents) AS docs,(SELECT count(*) FROM document_artifacts) AS artifacts,(SELECT count(*) FROM financial_delivery_outbox WHERE state=$1) AS sent',['sent'])).rows[0];
 await request(owner,`/v1/billing-cycles/${september.id}/verify-payment`,'PATCH',{status:'approved'});await application.monthly(new Date('2026-10-01T01:00:00+07:00'));
 const after=(await db.query('SELECT (SELECT count(*) FROM documents) AS docs,(SELECT count(*) FROM document_artifacts) AS artifacts,(SELECT count(*) FROM financial_delivery_outbox WHERE state=$1) AS sent',['sent'])).rows[0];assert.deepEqual(after,counts);
 await assert.rejects(db.query('UPDATE document_artifacts SET sha256=$2 WHERE document_id=$1',[invoice.id,'0'.repeat(64)]),/immutable/);
 console.log(JSON.stringify({verifiedAt:new Date().toISOString(),invoiceId:invoice.id,receiptId:receipt.id,invoiceHash,receiptHash,counts,blockedJobId:blocked.id,policyState:'verification_in_progress',checks:['real_monthly_job','sample_decimal_total','actual_download_smtp_hash_equality','rejection_resubmit','multiple_transfers_exact','underpayment_block','duplicate_evidence_block','cross_org_scope','idempotent_replay','immutable_artifact','hourly_missing_data_recheck_gate']},null,2));
}finally{await db.onModuleDestroy();}

