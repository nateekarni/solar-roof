import assert from 'node:assert/strict';
import test from 'node:test';
import type {DatabaseService} from '../../database/database.service.js';
import {DocumentService,NumberSeriesService} from '../documents/document.service.js';
import {PaymentService} from './payment.service.js';
import {ReceiptService} from './receipt.service.js';
function fixture(status='paid',withSite=true) {
 const inserts:unknown[][]=[];let allocations=0;
 const client={query:async(sql:string,params:unknown[]=[])=>{
  if(sql.includes('FROM payments')){
   assert.match(sql,/JOIN billing_cycles b ON b.id=p.billing_cycle_id/);assert.match(sql,/b.site_id AS "siteId"/);assert.deepEqual(params,['payment']);
   return {rows:[{id:'payment',billingCycleId:'actual-cycle',siteId:withSite?'actual-site':undefined,status,paidAt:new Date('2026-10-08T03:00:00Z')}]};
  }
  if(sql.includes('AS day'))return {rows:[{day:'2026-10-08'}]};
  if(sql.includes('document_number_series')){allocations++;return {rows:[{last_value:1}]};}
  if(sql.includes('INSERT INTO documents'))inserts.push(params);
  return {rows:[]};
 }};
 const db={...client,transaction:async<T>(work:(c:typeof client)=>Promise<T>)=>work(client)} as unknown as DatabaseService;
 const documents=new DocumentService(new NumberSeriesService(db),db);
 return {service:new ReceiptService(new PaymentService(db),documents),inserts,allocations:()=>allocations};
}
test('paid-payment receipt caller resolves actual billing-cycle site and persists both identities',async()=>{
 const f=fixture();const receipt=await f.service.issueForPayment('payment');
 assert.equal(receipt.number,'RCP261000001');assert.equal(receipt.snapshot.siteId,'actual-site');assert.equal(receipt.snapshot.billingCycleId,'actual-cycle');
 assert.equal(f.inserts.length,1);assert.equal(f.inserts[0]?.[1],'actual-site');assert.equal(f.inserts[0]?.[8],'actual-cycle');assert.equal(f.allocations(),1);
});
test('unpaid receipt caller rejects before number allocation or document persistence',async()=>{
 const f=fixture('pending');await assert.rejects(f.service.issueForPayment('payment'),/Payment must be paid/);
 assert.equal(f.allocations(),0);assert.deepEqual(f.inserts,[]);
});

test('paid receipt without resolved site identity fails before allocation or persistence',async()=>{
 const f=fixture('paid',false);
 await assert.rejects(f.service.issueForPayment('payment'),/Payment billing-cycle site required/);
 assert.equal(f.allocations(),0);assert.deepEqual(f.inserts,[]);
});
