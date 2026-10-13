import '../../apps/api/node_modules/reflect-metadata/Reflect.js';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {assertLocalDockerTarget} from './guard.mjs';
import {cutoffInstant} from './fixture.mjs';
import {sites,reading} from './telemetry-fixture.mjs';
import {DatabaseService} from '../../apps/api/src/database/database.service.ts';
import {FinancialReadinessService} from '../../apps/api/src/modules/financial-readiness/financial-readiness.service.ts';
import {FinancialApplicationService} from '../../apps/api/src/modules/billing/financial-application.service.ts';
assertLocalDockerTarget('financial');
const month=process.argv.find(a=>a.startsWith('--month='))?.slice(8)??'2026-08';
const cutoff=new Date(cutoffInstant(month));
if(cutoff.getTime()>Date.now())throw Error('Use a completed month with seeded actual boundaries');
const db=new DatabaseService({statementTimeout:120000,applicationName:'local-cutoff-test'});
const service=new FinancialApplicationService(db,new FinancialReadinessService(db));
try{
 const initial=(await db.query("SELECT count(*)::int n FROM documents d JOIN billing_cycles b ON b.id=d.billing_cycle_id WHERE b.period_start=$1 AND d.document_type='invoice'",[month+'-01'])).rows[0].n;
 const before=await db.query('SELECT count(*)::int AS n FROM documents');
 assert.deepEqual(await service.monthly(cutoff),[],'00:00 Bangkok must not issue before 01:00');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM documents')).rows[0].n,before.rows[0].n);
 const runAt=new Date(cutoff.getTime()+3600000);
 await service.monthly(runAt);
 const rows=(await db.query(`SELECT j.id,j.state,j.last_error,s.name,s.external_site_id FROM financial_month_jobs j JOIN sites s ON s.id=j.site_id WHERE j.period_start=$1 ORDER BY s.external_site_id`,[month+'-01'])).rows;
 assert.equal(rows.length,10,'Exactly ten sites need monthly jobs');
 assert.deepEqual(rows.map(r=>r.external_site_id).sort(),sites.map(s=>s.code).sort());
 assert.ok(rows.every(r=>r.state==='done'),JSON.stringify(rows.filter(r=>r.state!=='done')));
 const snapshot=async()=>JSON.stringify((await db.query(`SELECT bc.id,bc.amount,bc.consumed_kwh,d.id AS document_id,d.content_hash FROM billing_cycles bc JOIN documents d ON d.billing_cycle_id=bc.id WHERE bc.period_start=$1 ORDER BY bc.id,d.id`,[month+'-01'])).rows);
 const bills=(await db.query(`SELECT b.*,s.external_site_id FROM billing_cycles b JOIN sites s ON s.id=b.site_id WHERE b.period_start=$1`,[month+'-01'])).rows;
 assert.equal(bills.length,10);for(const bill of bills){const s=sites.find(s=>s.code===bill.external_site_id);const energy=Number((reading(s,'meter',cutoff.getTime()).kwh-reading(s,'meter',Date.parse(month+'-01T00:00:00+07:00')).kwh).toFixed(3));const subtotal=Math.round(energy*s.rate*100)/100;const tax=Math.round(subtotal*7)/100;assert.equal(Number(bill.consumed_kwh),energy);assert.equal(Number(bill.subtotal),subtotal);assert.equal(Number(bill.simulated_tax),tax);assert.equal(Number(bill.amount),Math.round((subtotal+tax)*100)/100);}
 const documents=(await db.query(`SELECT d.document_number FROM documents d JOIN billing_cycles b ON b.id=d.billing_cycle_id WHERE b.period_start=$1 AND d.document_type='invoice'`,[month+'-01'])).rows;
 assert.equal(documents.length,10);
 const mailCount=async()=>{const body=await(await fetch('http://127.0.0.1:18049/api/v1/messages?limit=500')).json();return body.messages.filter(m=>documents.some(d=>m.Subject.includes(d.document_number))).length;};
 const deliverySnapshot=async()=>JSON.stringify((await db.query(`SELECT o.* FROM financial_delivery_outbox o JOIN documents d ON d.id=o.document_id JOIN billing_cycles b ON b.id=d.billing_cycle_id WHERE b.period_start=$1 ORDER BY o.id`,[month+'-01'])).rows);
 const issued=await snapshot(),sent=await mailCount(),deliveries=await deliverySnapshot();assert.equal(sent,10,'One captured email per invoice');
 await service.monthly(runAt);assert.equal(await snapshot(),issued,'Replay must preserve bill IDs, amounts and PDF hashes');assert.equal(await mailCount(),sent,'Replay must not resend emails');assert.equal(await deliverySnapshot(),deliveries);
 const result={month,mode:initial===0?'fresh-cutoff':'existing-period-replay',initialInvoiceCount:initial,finalInvoiceCount:documents.length,timezone:'Asia/Bangkok',cutoff:cutoff.toISOString(),runAt:runAt.toISOString(),beforeCutoffPassed:true,idempotencyPassed:true,amountsVerified:true,emailIdempotencyPassed:true,jobs:rows};
 await mkdir('output/local-system',{recursive:true});await writeFile(`output/local-system/cutoff-${month}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await db.pool.end();}
