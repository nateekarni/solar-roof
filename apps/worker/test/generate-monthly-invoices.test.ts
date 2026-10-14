import {strict as assert} from 'node:assert';
import test from 'node:test';
import {GenerateMonthlyInvoicesJob} from '../src/jobs/generate-monthly-invoices.job.js';

test('worker prepares complete drafts without numbers, documents or artifacts and reuses pending drafts',async()=>{
 const cycle={id:'cycle-1',site_id:'site-1',amount:'10414.63',status:'pending_review',quality:'complete',meter_snapshot:[{consumedKwh:'25.000'}]};
 const db={
  async transaction<T>(work:(client:any)=>Promise<T>):Promise<T>{return work(this);},
  async query(sql:string){
   if(sql.includes('SELECT b.id')||sql.includes('FOR UPDATE'))return {rows:[{...cycle}]};
   if(sql.startsWith('SELECT id FROM documents'))return {rows:[]};
   if(sql.startsWith('UPDATE billing_cycles')){cycle.status='pending_issue_approval';return {rows:[{...cycle}]};}
   throw new Error(`Worker crossed approval boundary: ${sql}`);
  },
 };
 const job=new GenerateMonthlyInvoicesJob();
 const result=await job.run(db,2026,1);
 assert.equal(result.length,1);assert.equal(result[0]?.status,'pending_issue_approval');assert.equal(result[0]?.created,true);
 assert.equal('documentNumber' in result[0]!,false);
 assert.equal((await job.run(db,2026,1))[0]?.created,false);
});

test('worker skips incomplete, cancelled or already issued cycles',async()=>{
 for(const overrides of [{quality:'partial'},{status:'cancelled'},{issued:true}]){
  const cycle={id:'cycle',status:'pending_review',quality:'complete',meter_snapshot:[{}],...overrides};
  const db={transaction:async(work:any)=>work(db),query:async(sql:string)=>{
   if(sql.includes('SELECT b.id')||sql.includes('FOR UPDATE'))return {rows:[cycle]};
   if(sql.startsWith('SELECT id FROM documents'))return {rows:overrides.issued?[{id:'invoice'}]:[]};
   throw Error('Ineligible cycle was mutated');
  }};
  assert.deepEqual(await new GenerateMonthlyInvoicesJob().run(db,2026,1),[]);
 }
});
