import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const logoHash=(uri:string)=>createHash('sha256').update(Buffer.from(uri.split(',')[1]!, 'base64')).digest('hex');
test('site billing calculation rejects missing configuration without contract lookup',async()=>{let contracts=false;const db={transaction:async(run:any)=>run({query:async(sql:string)=>{if(sql.includes('FROM sites'))return {rows:[{id:'s'}]};if(sql.includes('FROM contracts'))contracts=true;return {rows:[]};}})};const service=new FinancialApplicationService(db as any,{assertEnabled:async()=>{}} as any);await assert.rejects(service.calculate('s','2026-09-01','2026-09-30'),/Site billing configuration/);assert.equal(contracts,false);});
test('changed billing configuration blocks issuing a calculation with stale tax policy',async()=>{const cycle={id:'cycle',site_id:'site',quality:'complete',meter_snapshot:[],policy_hash:TEST_FINANCIAL_POLICY_HASH,billing_settings_version:1};const db={transaction:async(run:any)=>run({query:async(sql:string)=>{if(sql.includes('FROM billing_cycles'))return {rows:[cycle]};if(sql.includes('FROM site_billing_settings'))return {rows:[{version:2}]};return {rows:[]};}})};await assert.rejects(new FinancialApplicationService(db as any,{assertEnabled:async()=>{}} as any).issueInvoice('cycle'),/configuration changed/);});
import { ConflictException } from '@nestjs/common';
import { reviewedActualEnergyDifference } from './financial-application.service.js';
test('exact cumulative counter reset requires typed conflict and review',()=>{
 assert.throws(()=>reviewedActualEnergyDifference('10000.0006','10000.0004'),error=>error instanceof ConflictException&&error.getStatus()===409&&/Meter reset requires review/.test(error.message));
 assert.equal(reviewedActualEnergyDifference('10000.0004','10000.0006'),'0.000');
});
import {FinancialApplicationService} from './financial-application.service.js';
import {TEST_FINANCIAL_POLICY_HASH} from './local-financial-policy.js';
import type {DatabaseService} from '../../database/database.service.js';
import type {FinancialReadinessService} from '../financial-readiness/financial-readiness.service.js';
test('TEST payment persistence keeps an exact large string amount',async()=>{
 let inserted=false;
 const db={transaction:async(run:any)=>run({query:async(sql:string,params:unknown[])=>{
 if(sql.includes('SELECT * FROM billing_cycles'))return {rows:[{id:'cycle',status:'approved',policy_hash:TEST_FINANCIAL_POLICY_HASH}]};
 if(sql.includes('SELECT id FROM documents'))return {rows:[{id:'invoice'}]};
 if(sql.includes('SELECT 1 FROM payments'))return {rows:[],rowCount:0};
 if(sql.includes('INSERT INTO payments')){assert.equal(params[2],null);assert.equal(params[12],'90071992547409.91');inserted=true;}
 return {rows:[]};
 }})};
 const service=new FinancialApplicationService(db as unknown as DatabaseService,{} as FinancialReadinessService);
 await service.submitPayment('cycle',{amount:'90071992547409.91',evidenceKey:'exact-large-synthetic'},'actor');assert.ok(inserted);
});
test('future financial originals freeze protocol site identity and persist the renderer template version',async()=>{
 let persisted:any;let insertedVersion:unknown;
 const cycle={id:'cycle',site_id:'site-a',contract_id:'contract-a',quality:'complete',policy_hash:TEST_FINANCIAL_POLICY_HASH,amount:'107.00',subtotal:'100.00',simulated_tax:'7.00',meter_snapshot:[{from:'2026-09-01',to:'2026-10-01',consumedKwh:'25.000',rate:'4.0000',subtotal:'100.00'}]};
 const customer={contract_number:'PPA261000001',id:'contract-a',company_name:'ลูกค้าทดสอบ',tax_id:'1111111111111',tax_address:'ที่อยู่ลูกค้า',site_name:'ไซต์ทดสอบ',external_site_id:'PROTOCOL-002',payment_term_days:30,tax_confirmed:true,tax_rate:'7.0000',prices_include_tax:false,recipient_user_ids:['recipient']};
 const db={transaction:async(run:any)=>run({query:async(sql:string,params:any[]=[])=>{
 if(sql.includes('SELECT * FROM billing_cycles'))return {rows:[cycle]};if(sql.includes('SELECT * FROM documents'))return {rows:[]};
 if(sql.includes('FROM site_billing_settings cfg JOIN sites')){const {external_site_id,...legacy}=customer;return {rows:[sql.includes('s.external_site_id')?customer:legacy]};}
 if(sql.includes('FROM company_profile'))return {rows:[{company_name:'บริษัททดสอบ',tax_id:'0000000000000',address:'ที่อยู่ผู้ขาย'}]};
 if(sql.includes('FROM company_bank_accounts'))return {rows:[{bank_name:'ธนาคารทดสอบ',account_name:'บริษัททดสอบ',account_number:'1234'}]};
 if(sql.includes('FROM users'))return {rows:[{id:'recipient',email:'verified@example.invalid',name:'ผู้รับ'}]};
 if(sql.includes("AS day"))return {rows:[{day:'2026-10-08'}]};if(sql.includes('document_number_series'))return {rows:[{last_value:1}]};
 if(sql.includes('AS starts'))return {rows:[{starts:'2026-09-01',ends:'2026-09-30'}]};
 if(sql.includes('INSERT INTO documents')){persisted=JSON.parse(params[7]);insertedVersion=params[10];return {rows:[{id:params[0],snapshot:persisted}]};}return {rows:[]};}})};
 const service=new FinancialApplicationService(db as unknown as DatabaseService,{assertEnabled:async()=>{}} as unknown as FinancialReadinessService);
 const result=await service.issueInvoice('cycle');assert.equal(result.document.snapshot.customer.external_site_id,'PROTOCOL-002');assert.equal(persisted.templateVersion,'sarabun-a4-v7');assert.equal(insertedVersion,'sarabun-a4-v7');assert.equal(persisted.logoDataUri,persisted.logo);assert.equal(persisted.brandPrimary,'#f29700');assert.equal(persisted.policyHash,TEST_FINANCIAL_POLICY_HASH);assert.equal(persisted.policy.logo,'/brand/solar-roof-document.png');assert.equal(logoHash(persisted.logo),createHash('sha256').update(readFileSync(new URL('../../../../web/public/brand/solar-roof-document-stacked.png',import.meta.url))).digest('hex'));
});

// Missing persistence/normalization must fail here, independently of SQL column ordering.
function paymentSubmissionHarness() {
 const saved:Record<string,unknown>[]=[];
 const db={transaction:async(run:any)=>run({query:async(sql:string,params:unknown[]=[])=>{
  if(sql.includes('SELECT * FROM billing_cycles'))return {rows:[{id:'cycle',status:'approved',policy_hash:TEST_FINANCIAL_POLICY_HASH}]};
  if(sql.includes('SELECT id FROM documents'))return {rows:[{id:'invoice'}]};
  if(sql.includes('SELECT 1 FROM payments'))return {rows:[],rowCount:0};
  if(sql.includes('INSERT INTO payments')){
   const columns=sql.match(/payments\s*\(([^)]+)\)/)![1]!.split(',').map(s=>s.trim());
   const values=sql.match(/VALUES\s*\(([^)]+)\)/)![1]!.split(',');
   saved.push(Object.fromEntries(columns.map((name,i)=>[name,values[i]!.trim().startsWith('$')?params[Number(values[i]!.trim().slice(1))-1]:values[i]!.trim()])));
  }
  return {rows:[]};
 }})};
 return {saved,service:new FinancialApplicationService(db as unknown as DatabaseService,{} as FinancialReadinessService)};
}
test('transfer submissions persist trimmed optional payer metadata with exact amounts',async()=>{
 const {saved,service}=paymentSubmissionHarness();
 await service.submitPayment('cycle',{amount:'107.00',evidenceKey:'metadata',payerName:'  ผู้จ่ายจริง  ',paymentMethod:' promptpay ',originBank:' ธนาคารผู้จ่าย ',originAccount:' 001-234 '} as any,'actor');
 assert.equal(saved[0]!.payer_name,'ผู้จ่ายจริง');assert.equal(saved[0]!.payment_method,'promptpay');assert.equal(saved[0]!.origin_bank,'ธนาคารผู้จ่าย');assert.equal(saved[0]!.origin_account,'001-234');assert.equal(saved[0]!.declared_amount,'107.00');assert.equal(saved[0]!.amount,null);
});
test('malformed payer metadata fails before payment persistence',async()=>{
 for(const field of ['payerName','originBank','originAccount'])for(const value of [123,{},[],true]){
  const {saved,service}=paymentSubmissionHarness();await assert.rejects(()=>service.submitPayment('cycle',{amount:'107.00',evidenceKey:'invalid',[field]:value} as any,'actor'),(error:any)=>error.getStatus()===400);assert.equal(saved.length,0);
 }
 for(const metadata of [{payerName:'x'.repeat(201)},{originBank:'x'.repeat(121)},{originAccount:'x'.repeat(81)},{paymentMethod:'cash'},{paymentMethod:'card'},{paymentMethod:1}]){
  const {saved,service}=paymentSubmissionHarness();await assert.rejects(()=>service.submitPayment('cycle',{amount:'107.00',evidenceKey:'invalid',...metadata} as any,'actor'),(error:any)=>error.getStatus()===400);assert.equal(saved.length,0);
 }
});
test('legacy omission and optional blank fields persist no fabricated payer information',async()=>{
 for(const metadata of [{},{payerName:' ',paymentMethod:' ',originBank:null,originAccount:''}]){
  const {saved,service}=paymentSubmissionHarness();await service.submitPayment('cycle',{amount:'107.00',evidenceKey:'legacy',...metadata} as any,'actor');
  for(const field of ['payer_name','payment_method','origin_bank','origin_account'])assert.equal(saved[0]![field]??null,null);
 }
});
test('payer fields accept their trimmed maximum lengths and both transfer methods',async()=>{
 for(const paymentMethod of ['bank_transfer','promptpay']){
  const {saved,service}=paymentSubmissionHarness();await service.submitPayment('cycle',{amount:'107.00',evidenceKey:'limits',payerName:' '+ 'ก'.repeat(200)+' ',originBank:'x'.repeat(120),originAccount:'0'.repeat(80),paymentMethod} as any,'actor');assert.equal(saved[0]!.payer_name,'ก'.repeat(200));assert.equal(saved[0]!.payment_method,paymentMethod);
 }
});

test('approval freezes all approved transfer metadata, excludes rejected history and reuses the frozen original on retry',async()=>{
 let persisted:any;let artifactCount=0;
 const cycle={id:'cycle',site_id:'site-a',contract_id:'contract-a',status:'pending_verification',quality:'complete',policy_hash:TEST_FINANCIAL_POLICY_HASH,amount:'107.00',subtotal:'100.00',simulated_tax:'7.00',meter_snapshot:[]};
 const transfers=[{id:'a',billing_cycle_id:'cycle',amount:'57.00',verified_amount:null as string|null,status:'pending_verification',paid_at:'2026-10-08T01:00:00Z',payer_name:'Payer',payment_method:'promptpay',origin_bank:'Payer bank',origin_account:'00123'},{id:'b',billing_cycle_id:'cycle',amount:'50.00',status:'pending_verification',paid_at:'2026-10-08T02:00:00Z'},{id:'old',billing_cycle_id:'cycle',amount:'107.00',status:'rejected',paid_at:'2026-10-07T01:00:00Z',payer_name:'Rejected payer'}];
 const db={transaction:async(run:any)=>run({query:async(sql:string,params:any[]=[])=>{
 if(sql.includes('SELECT employee_can_access'))return {rows:[{allowed:true}]}; if(sql.includes('SELECT role,status FROM users'))return {rows:[{role:'accountant',status:'active'}]};
 if(sql.includes('SELECT * FROM billing_cycles'))return {rows:[cycle]};
 if(sql.includes('SELECT * FROM documents'))return {rows:persisted?[persisted]:[]};
 if(sql.includes('SELECT * FROM payments'))return {rows:sql.includes("status='paid'")?transfers.filter(p=>p.status==='paid'):transfers};
 if(sql.includes('UPDATE payments'))for(const p of transfers)if(p.id===params[0]){p.status=params[1];(p as any).verified_amount=params[4];}
 if(sql.includes('FROM site_billing_settings cfg JOIN sites'))return {rows:[{contract_number:'PPA261000001',company_name:'Synthetic customer',tax_id:'1111111111111',tax_address:'Customer address',payment_term_days:30,tax_confirmed:true,tax_rate:'7.0000',prices_include_tax:false,recipient_user_ids:['recipient']}]};
 if(sql.includes('FROM company_profile'))return {rows:[{company_name:'Synthetic issuer',tax_id:'0000000000000',address:'Issuer address'}]};
 if(sql.includes('FROM company_bank_accounts'))return {rows:[{bank_name:'Receiving bank',account_name:'Issuer',account_number:'9999'}]};
 if(sql.includes('FROM users u'))return {rows:[{id:'recipient',email:'test@example.invalid'}]};
 if(sql.includes('AS day'))return {rows:[{day:'2026-10-08'}]};
 if(sql.includes('document_number_series'))return {rows:[{last_value:1}]};
 if(sql.includes('SELECT document_number'))return {rows:[{document_number:'INV261000001'}]};
 if(sql.includes('AS starts'))return {rows:[{starts:'2026-09-01',ends:'2026-09-30'}]};
 if(sql.includes('INSERT INTO documents')){persisted={id:params[0],snapshot:JSON.parse(params[7])};return {rows:[persisted]};}
 if(sql.includes('INSERT INTO document_artifacts'))artifactCount++;
 if(sql.startsWith('UPDATE billing_cycles'))cycle.status=params[1];
 return {rows:[]};}})};
 const service=new FinancialApplicationService(db as unknown as DatabaseService,{assertEnabled:async()=>{}} as unknown as FinancialReadinessService);
 await service.verifyPayment('cycle','approved',undefined,'accountant',{paymentId:'a',verifiedAmount:'57.00',verifiedTransferAt:'2026-10-08T01:00:00Z'});
 const result=await service.verifyPayment('cycle','approved',undefined,'accountant',{paymentId:'b',verifiedAmount:'50.00',verifiedTransferAt:'2026-10-08T02:00:00Z'});
 assert.deepEqual(result.receipt.snapshot.payments.map((p:any)=>p.id),['a','b']);assert.equal(result.receipt.snapshot.payments[0].payer_name,'Payer');assert.equal(result.receipt.snapshot.payments[0].origin_account,'00123');assert.equal(result.receipt.snapshot.payments[1].payer_name,undefined);assert.equal(artifactCount,1);
 transfers[0]!.payer_name='Changed later';const retry=await service.verifyPayment('cycle','approved',undefined,'accountant',{paymentId:'b',verifiedAmount:'50.00',verifiedTransferAt:'2026-10-08T02:00:00Z'});assert.equal(retry.receipt.snapshot.payments[0].payer_name,'Payer');assert.equal(artifactCount,1);assert.equal(retry.receipt.id,result.receipt.id);
});

test('additional TEST evidence retains each transfer metadata independently without overwriting prior submissions',async()=>{
 const {saved,service}=paymentSubmissionHarness();
 await service.submitPayment('cycle',{amount:'57.00',evidenceKey:'first',payerName:'First payer',paymentMethod:'bank_transfer',originAccount:'00123'},'actor');
 await service.submitPayment('cycle',{amount:'50.00',evidenceKey:'second',payerName:'Second payer',paymentMethod:'promptpay'},'actor');
 assert.equal(saved.length,2);assert.equal(saved[0]!.payer_name,'First payer');assert.equal(saved[0]!.origin_account,'00123');assert.equal(saved[1]!.payer_name,'Second payer');assert.equal(saved[1]!.origin_account,null);assert.notEqual(saved[0]!.id,saved[1]!.id);
});

test('uploaded invoice and receipt logos stay frozen with saved PDF hashes after company replacement and replay',async()=>{
 const uploaded=`data:image/png;base64,${readFileSync(new URL('../../../../web/public/brand/solar-roof-mark.png',import.meta.url)).toString('base64')}`;
 const company={company_name:'Issuer at issuance',tax_id:'0000000000000',address:'Issuer address',logo_url:uploaded};
 const cycle={id:'cycle',site_id:'site-a',contract_id:'contract-a',status:'pending_review',quality:'complete',policy_hash:TEST_FINANCIAL_POLICY_HASH,amount:'107.00',subtotal:'100.00',simulated_tax:'7.00',meter_snapshot:[]};
 const payment={id:'payment',status:'pending_verification',amount:'107.00',verified_amount:null as string|null,paid_at:'2026-10-08T01:00:00Z'};
 const documents:any[]=[];const artifacts=new Map<string,{bytes:Buffer;sha256:string}>();
 const client={query:async(sql:string,params:any[]=[])=>{
  if(sql.includes('SELECT role,status FROM users'))return {rows:[{role:'accountant',status:'active'}]};
  if(sql.includes('SELECT employee_can_access'))return {rows:[{allowed:true}]};
  if(sql.includes('SELECT * FROM billing_cycles'))return {rows:[cycle]};
  if(sql.includes('SELECT * FROM documents'))return {rows:documents.filter(d=>d.document_type===(params[1]??'receipt'))};
  if(sql.includes('FROM site_billing_settings cfg JOIN sites'))return {rows:[{company_name:'Customer at issuance',tax_id:'1111111111111',tax_address:'Customer address',payment_term_days:30,tax_confirmed:true,tax_rate:'7.0000',prices_include_tax:false,recipient_user_ids:['recipient']}]};
  if(sql.includes('FROM company_profile'))return {rows:[company]};
  if(sql.includes('FROM company_bank_accounts'))return {rows:[{bank_name:'Receiving bank',account_name:'Account name',account_number:'1234'}]};
  if(sql.includes('FROM users u'))return {rows:[{id:'recipient',email:'verified@example.invalid',name:'Verified recipient'}]};
  if(sql.includes('SELECT * FROM payments'))return {rows:sql.includes("status='paid'")&&payment.status!=='paid'?[]:[payment]};
  if(sql.includes('UPDATE payments')){payment.status=params[1];payment.verified_amount=params[4];}
  if(sql.includes('AS day'))return {rows:[{day:'2026-10-08'}]};
  if(sql.includes('document_number_series'))return {rows:[{last_value:1}]};
  if(sql.includes('SELECT document_number,snapshot'))return {rows:documents.filter(d=>d.document_type==='invoice')};
  if(sql.includes('AS starts'))return {rows:[{starts:'2026-09-01',ends:'2026-09-30'}]};
  if(sql.includes('INSERT INTO documents')){const saved={id:params[0],document_number:params[4],document_type:params[3],status:'issued',snapshot:JSON.parse(params[7]),content_hash:params[8]};documents.push(saved);return {rows:[saved]};}
  if(sql.includes('INSERT INTO document_artifacts'))artifacts.set(params[0],{bytes:Buffer.from(params[1]),sha256:params[2]});
  if(sql==='UPDATE billing_cycles SET status=$2 WHERE id=$1')cycle.status=params[1];
  return {rows:[]};
 }};
 const service=new FinancialApplicationService({transaction:async(run:any)=>run(client)} as unknown as DatabaseService,{assertEnabled:async()=>{}} as unknown as FinancialReadinessService);
 const invoice=(await service.issueInvoice('cycle')).document;
 assert.equal(invoice.snapshot.logoDataUri,uploaded);assert.equal(invoice.snapshot.logo,uploaded);
 const invoiceSnapshot=JSON.stringify(invoice.snapshot),invoiceBytes=Buffer.from(artifacts.get(invoice.id)!.bytes),invoiceHash=invoice.content_hash;
 company.logo_url='';company.company_name='Company after replacement';cycle.status='pending_verification';
 const receipt=(await service.verifyPayment('cycle','approved',undefined,'accountant',{paymentId:'payment',verifiedAmount:'107.00',verifiedTransferAt:'2026-10-08T01:00:00Z'})).receipt;
 assert.equal(receipt.snapshot.logoDataUri,uploaded);assert.equal(receipt.snapshot.logo,uploaded);assert.equal(receipt.snapshot.company.company_name,'Issuer at issuance');
 const receiptSnapshot=JSON.stringify(receipt.snapshot),receiptBytes=Buffer.from(artifacts.get(receipt.id)!.bytes),receiptHash=receipt.content_hash;
 await service.issueInvoice('cycle');await service.verifyPayment('cycle','approved',undefined,'accountant',{paymentId:'payment',verifiedAmount:'107.00',verifiedTransferAt:'2026-10-08T01:00:00Z'});
 assert.equal(documents.length,2);assert.equal(artifacts.size,2);
 for(const [document,snapshot,bytes,hash] of [[invoice,invoiceSnapshot,invoiceBytes,invoiceHash],[receipt,receiptSnapshot,receiptBytes,receiptHash]] as const){
  assert.equal(JSON.stringify(document.snapshot),snapshot);assert.deepEqual(artifacts.get(document.id)!.bytes,bytes);assert.equal(artifacts.get(document.id)!.sha256,hash);assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
 }
});
