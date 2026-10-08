import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import {BillingController} from './billing.controller.js';
function legacyHarness(existing?:Record<string,unknown>){
 let saved=existing;let writes=0;
 const db={transaction:async(run:any)=>run({query:async(sql:string,params:unknown[]=[])=>{
  if(sql.includes('SELECT * FROM billing_cycles'))return {rows:[{id:'cycle',status:'approved'}]};
  if(sql.includes('SELECT id FROM payments'))return {rows:saved?[{id:saved.id}]:[]};
  if(sql.includes('INSERT INTO payments')){
   const columns=sql.match(/payments\s*\(([^)]+)\)/)![1]!.split(',').map(s=>s.trim());const values=sql.match(/VALUES\s*\(([^)]+)\)/)![1]!.split(',');
   saved=Object.fromEntries(columns.map((name,i)=>[name,values[i]!.trim().startsWith('$')?params[Number(values[i]!.trim().slice(1))-1]:values[i]!.trim()]));writes++;
  }
  if(sql.includes('UPDATE payments')){for(const column of ['payer_name','payment_method','origin_bank','origin_account']){const match=sql.match(new RegExp(column+'=coalesce\\(\\$(\\d+),'+column+'\\)'));if(match){const value=params[Number(match[1])-1];if(value!==null&&value!==undefined)saved![column]=value;}}writes++;}
  return {rows:[]};
 }})};
 const controller=new BillingController(db as any,{isLocalTestReady:async()=>false} as any,{} as any,{} as any);
 return {controller,get saved(){return saved;},get writes(){return writes;}};
}
const req={user:{id:'actor',role:'owner'}} as any;
test('legacy submission captures trimmed payer metadata with the existing numeric amount contract',async()=>{
 const h=legacyHarness();await h.controller.payBillingCycle('cycle',{amount:107,slipUrl:'synthetic-slip',payerName:' Payer ',paymentMethod:'bank_transfer',originBank:' Origin bank ',originAccount:' 00123 '} as any,req);
 assert.equal(h.saved!.amount,107);assert.equal(h.saved!.payer_name,'Payer');assert.equal(h.saved!.payment_method,'bank_transfer');assert.equal(h.saved!.origin_bank,'Origin bank');assert.equal(h.saved!.origin_account,'00123');
});
test('legacy resubmission updates provided metadata and preserves omitted prior metadata',async()=>{
 const h=legacyHarness({id:'payment',payer_name:'Old payer',payment_method:'promptpay',origin_bank:'Prior bank',origin_account:'00001'});
 await h.controller.payBillingCycle('cycle',{amount:107,slipUrl:'new-slip',payerName:' New payer '} as any,req);assert.equal(h.saved!.payer_name,'New payer');
 await h.controller.payBillingCycle('cycle',{amount:107,slipUrl:'second-slip'},req);assert.deepEqual(h.saved,{id:'payment',payer_name:'New payer',payment_method:'promptpay',origin_bank:'Prior bank',origin_account:'00001'});assert.equal(h.writes,2);
});
test('legacy submission rejects malformed metadata before database writes',async()=>{
 for(const metadata of [{payerName:42},{paymentMethod:'cash'},{paymentMethod:'card'},{originAccount:'0'.repeat(81)}]){
  const h=legacyHarness();await assert.rejects(()=>h.controller.payBillingCycle('cycle',{amount:107,slipUrl:'slip',...metadata} as any,req),(error:any)=>error.getStatus()===400);assert.equal(h.writes,0);
 }
});
