import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalFinancialApplicationService } from './local-financial-application.service.js';
import { TEST_FINANCIAL_POLICY_HASH } from './local-financial-policy.js';

test('attachment-only submission stores unknown transaction amount and time',async()=>{
 let persisted:any;
 const client={query:async(sql:string,args:any[]=[])=>{
  if(sql.includes('SELECT * FROM billing_cycles'))return {rows:[{id:'bill',status:'approved',policy_hash:TEST_FINANCIAL_POLICY_HASH}]};
  if(sql.includes('SELECT id FROM documents'))return {rows:[{id:'invoice'}]};
  if(sql.includes('INSERT INTO payments'))persisted=args;
  return {rows:[],rowCount:0};
 }};
 const service=new LocalFinancialApplicationService({transaction:async(fn:any)=>fn(client)} as any,{} as any);
 await service.submitPayment('bill',{evidenceKey:'synthetic-file',note:'Third party transfer'},'customer');
 assert.equal(persisted[2],null);assert.equal(persisted[3],null);
});

test('approval requires a selected transfer and reviewer confirmed transaction fields',async()=>{
 const service=new LocalFinancialApplicationService({transaction:async()=>{throw new Error('must validate before persistence');}} as any,{assertEnabled:async()=>{}} as any);
 await assert.rejects(()=>service.verifyPayment('bill','approved',undefined,'accountant'),(error:any)=>error.getStatus?.()===400);
});

function reviewHarness(confirmed='40.00'){
 const transfers=[{id:'previous',status:'paid',verified_amount:confirmed},{id:'first',status:'pending_verification',verified_amount:null},{id:'second',status:'pending_verification',verified_amount:null}];
 const client={query:async(sql:string,args:any[]=[])=>{
  if(sql.includes('SELECT employee_can_access'))return {rows:[{allowed:true}]}; if(sql.includes('SELECT role,status'))return {rows:[{role:'accountant',status:'active'}]};
  if(sql.includes('SELECT * FROM billing_cycles'))return {rows:[{id:'bill',amount:'100.00',status:'pending_verification'}]};
  if(sql.includes('SELECT * FROM payments'))return {rows:transfers};
  if(sql.includes('UPDATE payments')){const payment=transfers.find(p=>p.id===args[0])!;payment.status=args[1];payment.verified_amount=args[4];}
  return {rows:[]};
 }};
 return {transfers,service:new LocalFinancialApplicationService({transaction:async(fn:any)=>fn(client)} as any,{assertEnabled:async()=>{}} as any)};
}
test('partial approval accepts one transfer and retains other pending evidence',async()=>{
 const {service,transfers}=reviewHarness();
 const result=await service.verifyPayment('bill','approved',undefined,'accountant',{paymentId:'first',verifiedAmount:'20.00',verifiedTransferAt:'2026-10-08T04:00:00Z'});
 assert.equal(result.billingCycleStatus,'pending_verification');assert.equal(result.receipt,null);assert.equal(transfers[1]!.status,'paid');assert.equal(transfers[2]!.status,'pending_verification');
});
test('overpayment fails without approving evidence',async()=>{
 const {service,transfers}=reviewHarness();
 await assert.rejects(()=>service.verifyPayment('bill','approved',undefined,'accountant',{paymentId:'first',verifiedAmount:'61.00',verifiedTransferAt:'2026-10-08T04:00:00Z'}),/exceed the bill/);
 assert.equal(transfers[1]!.status,'pending_verification');
});

test('reviewer payer details persist before receipt issuance and enter audit snapshot',async()=>{
 let saved:any[],receiptPayer:any,audit:any;
 const payment={id:'transfer',status:'pending_verification',verified_amount:null,payer_name:null,origin_bank:null,origin_account:null};
 const client={query:async(sql:string,args:any[]=[])=>{
  if(sql.includes('SELECT employee_can_access'))return {rows:[{allowed:true}]}; if(sql.includes('SELECT role,status'))return {rows:[{role:'accountant',status:'active'}]};
  if(sql.includes('SELECT * FROM billing_cycles'))return {rows:[{id:'bill',amount:'100.00',status:'pending_verification'}]};
  if(sql.includes('SELECT * FROM payments'))return {rows:[payment]};
  if(sql.includes('UPDATE payments')){saved=args;Object.assign(payment,{status:args[1],verified_amount:args[4],payer_name:args[7],origin_bank:args[9],origin_account:args[10]});}
  if(sql.includes('INSERT INTO audit_events'))audit=JSON.parse(args[5]);return {rows:[]};
 }};
 const service=new LocalFinancialApplicationService({transaction:async(fn:any)=>fn(client)} as any,{assertEnabled:async()=>{}} as any);
 (service as any).issue=async()=>{receiptPayer={...payment};return {id:'receipt'};};
 await service.verifyPayment('bill','approved',undefined,'accountant',{paymentId:'transfer',verifiedAmount:'100.00',verifiedTransferAt:'2026-10-09T01:00:00Z',payerName:' ผู้ชำระเงิน ',originBank:' ธนาคาร ',originAccount:'1234'});
 assert.equal(saved![7],'ผู้ชำระเงิน');assert.equal(receiptPayer.payer_name,'ผู้ชำระเงิน');assert.equal(receiptPayer.origin_bank,'ธนาคาร');assert.equal(audit.payerName,'ผู้ชำระเงิน');
});
test('invalid optional reviewed payer metadata fails before database access',async()=>{
 const service=new LocalFinancialApplicationService({transaction:async()=>{throw new Error('unexpected persistence');}} as any,{assertEnabled:async()=>{}} as any);
 await assert.rejects(()=>service.verifyPayment('bill','approved',undefined,'accountant',{paymentId:'transfer',verifiedAmount:'100',verifiedTransferAt:'2026-10-09T01:00:00Z',payerName:'x'.repeat(201)}),/exceeds/);
});
