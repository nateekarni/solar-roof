import test from 'node:test';import assert from 'node:assert/strict';import {BillingController} from './billing.controller.js';
function fixture(){const client={query:async(sql:string,params:unknown[]=[])=>{
 if(sql.includes('FROM billing_cycles'))return {rows:[{id:'cycle',siteId:'site',site_id:'site',periodEnd:'2026-09-30',amount:'107'}]};
 if(sql.includes('FROM payments'))return {rows:[{id:'payment'}]};if(sql.includes('AS day'))return {rows:[{day:'2026-10-08'}]};
 if(sql.includes('document_number_series'))return {rows:[{last_value:1}]};if(sql.includes('INSERT INTO documents'))return {rows:[{documentNumber:params[3]}]};return {rows:[]};}};
 return new BillingController({...client,transaction:async(work:any)=>work(client)} as any,{assertEnabled:async()=>{},isLocalTestReady:async()=>false} as any,{} as any,{} as any);
}
test('legacy invoice issuer uses central issue-month authority',async()=>{const result=await fixture().generateInvoiceForBillingCycle('cycle');assert.equal(result.document.documentNumber,'INV261000001');});
test('legacy receipt issuer uses RCP issue-month authority',async()=>{const result=await fixture().verifyPayment('cycle',{status:'approved'},{user:{id:'actor'}} as any);assert.equal(result.receipt.documentNumber,'RCP261000001');});
test('repeat receipt approval returns historical number without allocation or duplicate writes',async()=>{
 let writes=0;const existing={documentNumber:'RCT2026100009'};const client={query:async(sql:string)=>{
 if(sql.includes('FROM billing_cycles'))return {rows:[{id:'cycle',site_id:'site',status:'paid'}]};if(sql.includes('FROM payments'))return {rows:[{id:'payment'}]};if(sql.includes('FROM documents'))return {rows:[existing]};if(/INSERT|UPDATE/.test(sql))writes++;return {rows:[]};}};
 const c=new BillingController({...client,transaction:async(work:any)=>work(client)} as any,{assertEnabled:async()=>{},isLocalTestReady:async()=>false} as any,{} as any,{} as any);
 const result=await c.verifyPayment('cycle',{status:'approved'},{user:{id:'actor'}} as any);assert.equal(result.receipt.documentNumber,existing.documentNumber);assert.equal(writes,0);
});
