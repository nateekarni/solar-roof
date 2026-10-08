import assert from 'node:assert/strict';import test from 'node:test';import {DocumentsController} from './documents.controller.js';import {NumberSeriesService,DocumentService} from './document.service.js';
test('upload rejects unsupported family without silently issuing INV',async()=>{
 const db={query:async()=>{throw new Error('Unexpected allocation');}};const c=new DocumentsController(db as any,{assertEnabled:async()=>{}} as any);
 await assert.rejects(c.uploadDocument({siteId:'site',type:'billing_statement'}),/Unsupported human document family/);
});
test('generic upload atomically inserts a number using actual Bangkok issuance day',async()=>{
 const client={query:async(sql:string,params:unknown[]=[])=>{
 if(sql.includes('AS day'))return {rows:[{day:'2026-10-08'}]};if(sql.includes('document_number_series'))return {rows:[{last_value:1}]};
 if(sql.includes('INSERT INTO documents'))return {rows:[{documentNumber:params[3],issueDate:params[4]}]};return {rows:[]};}};
 const db={...client,transaction:async(work:any)=>work(client)};
 const c=new DocumentsController(db as any,{assertEnabled:async()=>{}} as any);
 const row=await c.uploadDocument({siteId:'site',type:'receipt',issueDate:'2020-01-01'});assert.equal(row.documentNumber,'RCP261000001');assert.equal(row.issueDate,'2026-10-08');
 const service=new DocumentService(new NumberSeriesService(db as any),db as any);const doc=await service.finalize({siteId:'site',type:'invoice',year:2020,snapshot:{}});
 assert.equal(doc.number,'INV261000001');assert.equal(doc.year,2026);
});
