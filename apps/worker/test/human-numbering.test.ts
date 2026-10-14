import { strict as assert } from 'node:assert';import test from 'node:test';
import {GenerateMonthlyInvoicesJob} from '../src/jobs/generate-monthly-invoices.job.js';
test('worker uses the billed service month to prepare drafts and never allocates an issue-month number',async()=>{
 let allocation=false;const client={query:async(sql:string,params:unknown[]=[])=>{
 if(sql.includes('SELECT b.id')){assert.deepEqual(params,['2026-09-01','2026-09-30']);return {rows:[{id:'cycle',site_id:'site',amount:'107'}]};}
 if(sql.includes('FOR UPDATE'))return {rows:[{id:'cycle',site_id:'site',amount:'107',status:'pending_review',quality:'complete',meter_snapshot:[{}]}]};
 if(sql.includes('AS day'))return {rows:[{day:'2026-10-08'}]};
 if(sql.includes('document_number_series')){allocation=true;assert.equal(params[0],'INV2610');return {rows:[{last_value:1}]};}
 if(sql.includes('INSERT INTO documents'))return {rows:[{document_number:params[2],amount:'107'}]};return {rows:[]};}};
 const db={...client,transaction:async(work:any)=>work(client)};
 const result=await new GenerateMonthlyInvoicesJob().run(db,2026,9);
 assert.equal(result[0]?.status,'pending_issue_approval');assert.equal('documentNumber' in result[0]!,false);assert.equal(allocation,false);
});
