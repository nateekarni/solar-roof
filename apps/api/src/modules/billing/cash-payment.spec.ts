import assert from 'node:assert/strict';
import test from 'node:test';
import {FinancialApplicationService} from './financial-application.service.js';

test('cash payment requires actor and a stable idempotency key before database access',async()=>{
 let writes=0;
 const service=new FinancialApplicationService({transaction:async()=>{writes++;throw new Error('database should not be reached');}} as any,{assertEnabled:async()=>{}} as any);
 await assert.rejects(()=>service.recordCashPayment('cycle',{amount:'100.00',receivedAt:'2026-10-19'},undefined,'cash-key'),/Actor required/);
 await assert.rejects(()=>service.recordCashPayment('cycle',{amount:'100.00',receivedAt:'2026-10-19'},'actor',''),/idempotency key/i);
 assert.equal(writes,0);
});

test('cash payment rejects malformed business dates before database access',async()=>{
 let writes=0;
 const service=new FinancialApplicationService({transaction:async()=>{writes++;throw new Error('database should not be reached');}} as any,{assertEnabled:async()=>{}} as any);
 await assert.rejects(()=>service.recordCashPayment('cycle',{amount:'100.00',receivedAt:'19/10/2026'},'actor','cash-key'),/date/i);
 assert.equal(writes,0);
});

test('cash payment records a partial settlement, receipt and audit atomically',async()=>{
 const cycle={id:'cycle',site_id:'site',status:'approved',amount:'100.00'};
 let inserted:any[]|undefined,cycleStatus='',audit:any;
 const client={query:async(sql:string,args:any[]=[])=>{
  if(sql.includes('SELECT role,status FROM users'))return {rows:[{role:'owner',status:'active'}]};
  if(sql.includes('SELECT * FROM billing_cycles'))return {rows:[cycle]};
  if(sql.includes('employee_can_access'))return {rows:[{allowed:true}]};
  if(sql.includes("now() AT TIME ZONE 'Asia/Bangkok'"))return {rows:[{day:'2026-10-19'}]};
  if(sql.startsWith('SELECT * FROM payments'))return {rows:[]};
  if(sql.includes("document_type='invoice'"))return {rows:[{id:'invoice'}]};
  if(sql.startsWith('INSERT INTO payments')){inserted=args;return {rows:[{id:args[0],billing_cycle_id:args[1],amount:args[2],verified_amount:args[2],status:'paid',payment_method:'cash',received_at:args[3],paid_at:'2026-10-19T05:00:00.000Z'}]};}
  if(sql==='SELECT now() AS value')return {rows:[{value:new Date('2026-10-19T06:00:00.000Z')}]};
  if(sql.startsWith('UPDATE billing_cycles'))cycleStatus=args[1];
  if(sql.includes("'payment.cash_recorded'"))audit=JSON.parse(args[3]);
  return {rows:[]};
 }};
 const service=new FinancialApplicationService({transaction:async(fn:any)=>fn(client)} as any,{assertEnabled:async()=>{}} as any,{resolve:async()=>({userId:'owner',displayName:'Owner',position:'Owner'})} as any);
 (service as any).issueSettlementReceipt=async()=>({id:'receipt',document_number:'RCT261000001/1'});
 const result=await service.recordCashPayment('cycle',{amount:'40.00',receivedAt:'2026-10-19',note:'รับที่สำนักงาน'},'owner','cash-key');
 assert.equal(inserted?.[2],'40.00');assert.equal(inserted?.[6],'cash-key');
 assert.equal(cycleStatus,'partially_paid');assert.equal(result.outstandingAmount,'60.00');assert.equal(result.receipt.documentNumber,'RCT261000001/1');
 assert.equal(audit.amount,'40.00');assert.equal(audit.receivedAt,'2026-10-19');
});

test('partial cash payment keeps pending reminders eligible for revalidation',async()=>{
 const cycle={id:'cycle',site_id:'site',status:'approved',amount:'100.00'};
 let cancelled=false;
 const client={query:async(sql:string,args:any[]=[])=>{
  if(sql.includes('SELECT role,status FROM users'))return {rows:[{role:'owner',status:'active'}]};
  if(sql.includes('SELECT * FROM billing_cycles'))return {rows:[cycle]};
  if(sql.includes('employee_can_access'))return {rows:[{allowed:true}]};
  if(sql.includes("now() AT TIME ZONE 'Asia/Bangkok'"))return {rows:[{day:'2026-10-19'}]};
  if(sql.startsWith('SELECT * FROM payments'))return {rows:[]};
  if(sql.includes("document_type='invoice'"))return {rows:[{id:'invoice'}]};
  if(sql.startsWith('INSERT INTO payments'))return {rows:[{id:args[0],billing_cycle_id:args[1],amount:args[2],verified_amount:args[2],status:'paid',payment_method:'cash',received_at:args[3]}]};
  if(sql==='SELECT now() AS value')return {rows:[{value:new Date('2026-10-19T06:00:00.000Z')}]};
  if(sql.startsWith('UPDATE operational_delivery_outbox'))cancelled=true;
  return {rows:[]};
 }};
 const service=new FinancialApplicationService({transaction:async(fn:any)=>fn(client)} as any,{assertEnabled:async()=>{}} as any,{resolve:async()=>({userId:'owner',displayName:'Owner',position:'Owner'})} as any);
 (service as any).issueSettlementReceipt=async()=>({id:'receipt',document_number:'RCT261000001/1'});
 const result=await service.recordCashPayment('cycle',{amount:'40.00',receivedAt:'2026-10-19'},'owner','cash-partial');
 assert.equal(result.billingCycleStatus,'partially_paid');
 assert.equal(cancelled,false);
});
