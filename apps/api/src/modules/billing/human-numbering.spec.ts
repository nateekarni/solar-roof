import 'reflect-metadata';
import test from 'node:test';import assert from 'node:assert/strict';import {FinancialApplicationService} from './financial-application.service.js';
test('repeat receipt approval returns historical number without allocation or duplicate writes',async()=>{
 let writes=0;const existing={document_number:'RCT2026100009',snapshot:{policy:{scope:'TEST'}}};const client={query:async(sql:string)=>{
 if(sql.includes('SELECT role,status'))return {rows:[{role:'owner',status:'active'}]};if(sql.includes('employee_can_access'))return {rows:[{allowed:true}]};
 if(sql.includes('FROM billing_cycles'))return {rows:[{id:'cycle',site_id:'site',status:'paid'}]};if(sql.includes('FROM payments'))return {rows:[{id:'payment'}]};if(sql.includes('FROM documents'))return {rows:[existing]};if(/INSERT|UPDATE/.test(sql))writes++;return {rows:[]};}};
 const service=new FinancialApplicationService({transaction:async(work:any)=>work(client)} as any,{assertEnabled:async()=>({scope:'TEST'})} as any);
 const result=await service.verifyPayment('cycle','approved',undefined,'actor',{paymentId:'payment',verifiedAmount:'107.00',verifiedTransferAt:'2026-10-08T01:00:00Z'});assert.equal(result.receipt.document_number,'RCT2026100009');assert.equal(writes,0);
});
