import assert from 'node:assert/strict';import test from 'node:test';import {DocumentsController} from './documents.controller.js';import {NumberSeriesService,DocumentService} from './document.service.js';
test('upload rejects unsupported family without silently issuing INV',async()=>{
 const db={query:async()=>{throw new Error('Unexpected allocation');}};const c=new DocumentsController(db as any,{assertEnabled:async()=>{}} as any);
 await assert.rejects(c.uploadDocument({siteId:'site',type:'billing_statement'}),/Unsupported human document family/);
});
test('number allocation uses the actual Bangkok issuance day rather than a caller year',async()=>{
 const client={query:async(sql:string,params:unknown[]=[])=>{
 if(sql.includes('AS day'))return {rows:[{day:'2026-10-08'}]};if(sql.includes('document_number_series'))return {rows:[{last_value:1}]};
 if(sql.includes('INSERT INTO documents'))return {rows:[{documentNumber:params[3],issueDate:params[4]}]};return {rows:[]};}};
 const db={...client,transaction:async(work:any)=>work(client)};
 const series=new NumberSeriesService(db as any);
 const receipt=await series.next(client,'receipt');assert.equal(receipt.number,'RCP261000001');assert.equal(receipt.issueDate,'2026-10-08');
 const invoice=await series.next(client,'invoice');assert.equal(invoice.number,'INV261000001');assert.equal(invoice.issueDate,'2026-10-08');
});
