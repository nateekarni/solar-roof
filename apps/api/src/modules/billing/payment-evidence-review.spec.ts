import test from 'node:test';
import assert from 'node:assert/strict';
import { FinancialApplicationService } from './financial-application.service.js';
import { TEST_FINANCIAL_POLICY_HASH } from './local-financial-policy.js';

test('attachment-only submission stores unknown transaction amount and time',async()=>{
 let persisted:any;
 const client={query:async(sql:string,args:any[]=[])=>{
  if(sql.includes('SELECT * FROM billing_cycles'))return {rows:[{id:'bill',site_id:'site-a',amount:'100.00',status:'approved',policy_hash:TEST_FINANCIAL_POLICY_HASH}]};
  if(sql.includes('FROM users u WHERE u.id=$1'))return {rows:[{role:'customer_user',status:'active',assigned:true}]};
  if(sql.includes('SELECT status,verified_amount,amount FROM payments'))return {rows:[]};
  if(sql.includes('SELECT id FROM documents'))return {rows:[{id:'invoice'}]};
  if(sql.includes('INSERT INTO payments'))persisted=args;
  return {rows:[],rowCount:0};
 }};
 const service=new FinancialApplicationService({transaction:async(fn:any)=>fn(client)} as any,{} as any);
 await service.submitPayment('bill',{evidenceKey:'synthetic-file',note:'Third party transfer'},'customer');
 assert.equal(persisted[2],null);assert.equal(persisted[3],null);
});

function submissionValidationHarness(options:{assigned?:boolean;today?:string;paid?:string[]}={}){
 let inserted=false;
 const client={query:async(sql:string,args:any[]=[])=>{
  if(sql.includes('SELECT * FROM billing_cycles'))return {rows:[{id:'bill',site_id:'site-a',amount:'100.00',status:'approved',policy_hash:TEST_FINANCIAL_POLICY_HASH}]};
  if(sql.includes('FROM users u WHERE u.id=$1'))return {rows:[{role:'customer_user',status:'active',assigned:options.assigned!==false}]};
  if(sql.includes("now() AT TIME ZONE 'Asia/Bangkok'"))return {rows:[{day:options.today??'2026-10-20',transfer_day:args[0]?'2026-10-21':null}]};
  if(sql.includes('FROM payments WHERE billing_cycle_id=$1 FOR UPDATE'))return {rows:(options.paid??[]).map(verified_amount=>({status:'paid',verified_amount}))};
  if(sql.includes('SELECT id FROM documents'))return {rows:[{id:'invoice'}]};
  if(sql.includes('SELECT 1 FROM payments'))return {rows:[],rowCount:0};
  if(sql.includes('INSERT INTO payments'))inserted=true;
  return {rows:[],rowCount:0};
 }};
 const service=new FinancialApplicationService({transaction:async(fn:any)=>fn(client)} as any,{} as any);
 return {service,inserted:()=>inserted};
}

test('customer payment submission requires a live assignment to the invoice site',async()=>{
 const {service,inserted}=submissionValidationHarness({assigned:false});
 await assert.rejects(()=>service.submitPayment('bill',{amount:'10.00',evidenceKey:'foreign-site'},'customer'),(error:any)=>error.getStatus?.()===403);
 assert.equal(inserted(),false);
});

test('customer payment submission rejects a future Bangkok transfer date',async()=>{
 const {service,inserted}=submissionValidationHarness();
 await assert.rejects(()=>service.submitPayment('bill',{amount:'10.00',paidAt:'2026-10-21T05:00:00.000Z',evidenceKey:'future-date'},'customer'),(error:any)=>error.getStatus?.()===400);
 assert.equal(inserted(),false);
});

test('customer payment submission rejects a declared amount above the locked outstanding balance',async()=>{
 const {service,inserted}=submissionValidationHarness({paid:['80.00']});
 await assert.rejects(()=>service.submitPayment('bill',{amount:'20.01',evidenceKey:'over-balance'},'customer'),/exceed the bill/i);
 assert.equal(inserted(),false);
});

test('approval requires a selected transfer and reviewer confirmed transaction fields',async()=>{
 const service=new FinancialApplicationService({transaction:async()=>{throw new Error('must validate before persistence');}} as any,{assertEnabled:async()=>{}} as any);
 await assert.rejects(()=>service.verifyPayment('bill','approved',undefined,'accountant'),(error:any)=>error.getStatus?.()===400);
});

function reviewHarness(confirmed='40.00', withIdentity=true){
 const transfers=[{id:'previous',status:'paid',verified_amount:confirmed},{id:'first',status:'pending_verification',verified_amount:null},{id:'second',status:'pending_verification',verified_amount:null}];
 const client={query:async(sql:string,args:any[]=[])=>{
  if(withIdentity&&sql.includes('p.name AS position'))return {rows:[{id:'accountant',display_name:'ผู้ตรวจหลักฐาน',position:'ฝ่ายบัญชี',signature_data:null}]};
  if(sql==='SELECT now() AS value')return {rows:[{value:new Date('2026-10-14T01:00:00.000Z')}]};
  if(sql.includes('SELECT employee_can_access'))return {rows:[{allowed:true}]}; if(sql.includes('SELECT role,status'))return {rows:[{role:'accountant',status:'active'}]};
  if(sql.includes('SELECT * FROM billing_cycles'))return {rows:[{id:'bill',amount:'100.00',status:'pending_verification'}]};
  if(sql.includes('SELECT * FROM payments'))return {rows:transfers};
  if(sql.includes('UPDATE payments')&&!sql.includes('receipt_document_id')){const payment=transfers.find(p=>p.id===args[0])!;payment.status=args[1];payment.verified_amount=args[4];}
  return {rows:[]};
 }};
 const service=new FinancialApplicationService({transaction:async(fn:any)=>fn(client)} as any,{assertEnabled:async()=>{}} as any);
 (service as any).issue=async()=>({id:'receipt',document_number:'REC-001/1'});
 return {transfers,service};
}
test('partial approval accepts one transfer and retains other pending evidence',async()=>{
 const {service,transfers}=reviewHarness();
 const result=await service.verifyPayment('bill','approved',undefined,'accountant',{paymentId:'first',verifiedAmount:'20.00',verifiedTransferAt:'2026-10-08T04:00:00Z'});
 assert.equal(result.billingCycleStatus,'pending_verification');assert.ok(result.receipt);assert.equal(transfers[1]!.status,'paid');assert.equal(transfers[2]!.status,'pending_verification');
});
test('overpayment fails without approving evidence',async()=>{
 const {service,transfers}=reviewHarness();
 await assert.rejects(()=>service.verifyPayment('bill','approved',undefined,'accountant',{paymentId:'first',verifiedAmount:'61.00',verifiedTransferAt:'2026-10-08T04:00:00Z'}),/exceed the bill/);
 assert.equal(transfers[1]!.status,'pending_verification');
});

test('missing reviewer identity blocks settlement before changing evidence or allocating a receipt',async()=>{
 const {service,transfers}=reviewHarness('40.00',false);
 await assert.rejects(()=>service.verifyPayment('bill','approved',undefined,'accountant',{paymentId:'first',verifiedAmount:'60.00',verifiedTransferAt:'2026-10-08T04:00:00Z'}));
 assert.equal(transfers[1]!.status,'pending_verification');
});

test('reviewer payer details persist before receipt issuance and enter audit snapshot',async()=>{
 let saved:any[],receiptPayer:any,audit:any;
 const payment={id:'transfer',status:'pending_verification',verified_amount:null,payer_name:null,origin_bank:null,origin_account:null};
 const client={query:async(sql:string,args:any[]=[])=>{
  if(sql.includes('p.name AS position'))return {rows:[{id:'accountant',display_name:'ผู้ตรวจหลักฐาน',position:'ฝ่ายบัญชี',signature_data:null}]};
  if(sql==='SELECT now() AS value')return {rows:[{value:new Date('2026-10-14T01:00:00.000Z')}]};
  if(sql.includes('SELECT employee_can_access'))return {rows:[{allowed:true}]}; if(sql.includes('SELECT role,status'))return {rows:[{role:'accountant',status:'active'}]};
  if(sql.includes('SELECT * FROM billing_cycles'))return {rows:[{id:'bill',amount:'100.00',status:'pending_verification'}]};
  if(sql.includes('SELECT * FROM payments'))return {rows:[payment]};
  if(sql.includes('UPDATE payments')&&!sql.includes('receipt_document_id')){saved=args;Object.assign(payment,{status:args[1],verified_amount:args[4],payer_name:args[7],origin_bank:args[10],origin_account:args[11]});}
  if(sql.includes('INSERT INTO audit_events'))audit=JSON.parse(args[5]);return {rows:[]};
 }};
 const service=new FinancialApplicationService({transaction:async(fn:any)=>fn(client)} as any,{assertEnabled:async()=>{}} as any);
 (service as any).issue=async()=>{receiptPayer={...payment};return {id:'receipt'};};
 await service.verifyPayment('bill','approved',undefined,'accountant',{paymentId:'transfer',verifiedAmount:'100.00',verifiedTransferAt:'2026-10-09T01:00:00Z',payerName:' ผู้ชำระเงิน ',originBank:' ธนาคาร ',originAccount:'1234'});
 assert.equal(saved![7],'ผู้ชำระเงิน');assert.equal(receiptPayer.payer_name,'ผู้ชำระเงิน');assert.equal(receiptPayer.origin_bank,'ธนาคาร');assert.equal(audit.payerName,'ผู้ชำระเงิน');
});
test('invalid optional reviewed payer metadata fails before database access',async()=>{
 const service=new FinancialApplicationService({transaction:async()=>{throw new Error('unexpected persistence');}} as any,{assertEnabled:async()=>{}} as any);
 await assert.rejects(()=>service.verifyPayment('bill','approved',undefined,'accountant',{paymentId:'transfer',verifiedAmount:'100',verifiedTransferAt:'2026-10-09T01:00:00Z',payerName:'x'.repeat(201)}),/exceeds/);
});
