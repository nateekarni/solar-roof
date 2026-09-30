import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../src/database/database.service.js';
import { dispatchFinancialDelivery,queueDocumentDelivery } from '../src/modules/billing/financial-delivery.js';
import { ensureDocumentArtifact } from '../src/modules/documents/document-artifact.js';
import { FinancialAutomationService } from '../src/modules/billing/financial-automation.service.js';
import { DocumentService,NumberSeriesService } from '../src/modules/documents/document.service.js';

const isolated=process.env.FINANCIAL_TEST_DATABASE_URL;
test('PostgreSQL durable delivery preserves PDF bytes, scopes recipients, bounds retries, and reminder pauses', {skip:!isolated},async()=>{
 assert.match(isolated!,/\/solar_financial_v2(?:\?|$)/,'Only the dedicated disposable database is allowed');
 process.env.DATABASE_URL=isolated;
 const db=new DatabaseService();
 const school=randomUUID(),other=randomUUID(),site=randomUUID(),contract=randomUUID(),cycle=randomUUID(),document=randomUUID();
 const good=randomUUID(),inactive=randomUUID(),wrong=randomUUID(),unverified=randomUUID();
 try {
  await db.query("INSERT INTO schools(id,name,code,region) VALUES($1::uuid,'Test Thai','test-'||$1::text,'test'),($2::uuid,'Other','test-'||$2::text,'test')",[school,other]);
  await db.query("INSERT INTO sites(id,school_id,name,capacity_mwp) VALUES($1,$2,'Test roof',1)",[site,school]);
  for(const [id,status,schoolId,verified] of [[good,'active',school,true],[inactive,'inactive',school,true],[wrong,'active',other,true],[unverified,'active',school,false]]) {
   const email=`${id}@example.invalid`;
   await db.query("INSERT INTO users(id,email,display_name,role,status,school_id,email_verified_at,verified_email) VALUES($1,$2,'Test','school_user',$3,$4,$5,$6)",[id,email,status,schoolId,verified?new Date():null,verified?email:null]);
  }
  await db.query("INSERT INTO contracts(id,site_id,version,start_date,payment_terms,signer_name,payment_term_days,recipient_user_ids) VALUES($1,$2,1,'2026-09-01','30 days','Test',30,$3)",[contract,site,[good,inactive,wrong,unverified]]);
  await db.query("INSERT INTO billing_cycles(id,site_id,contract_id,period_start,period_end,cutoff_time,status,quality,opening_energy,closing_energy,consumed_kwh,rate,amount,meter_snapshot) VALUES($1,$2,$3,'2026-09-01','2026-09-30','2026-09-30T17:00:00Z','approved','complete',100,125,25,4,100,'[]')",[cycle,site,contract]);
  const snapshot={company:{company_name:'บริษัท ทดสอบ',address:'กรุงเทพมหานคร',tax_id:'TEST'},customer:{school_name:'โรงเรียนทดสอบ',site_name:'Test roof'},cycle:{period_start:'2026-09-01',period_end:'2026-09-30',meter_snapshot:[]},issueDate:'2026-10-01',dueDate:'2000-01-01'};
  // A pre-existing issued fixture tests dispatch independently; production accounting gate remains closed.
  await db.query("INSERT INTO documents(id,site_id,billing_cycle_id,document_type,document_number,status,issue_date,amount,snapshot,render_eligible) VALUES($1,$2,$3,'invoice',$4,'issued','2026-10-01',100,$5,true)",[document,site,cycle,`TEST-${document}`,snapshot]);
  await db.transaction(client=>queueDocumentDelivery(client,document));
  await db.transaction(client=>queueDocumentDelivery(client,document));
  const rows=(await db.query('SELECT * FROM financial_delivery_outbox WHERE document_id=$1',[document])).rows;
  assert.equal(rows.length,1);
  const outbox=rows[0].id; const delivered:Buffer[]=[];const addresses:string[]=[];
  const send=async(mail:any)=>{addresses.push(mail.to);delivered.push(mail.bytes);};
  await Promise.all([dispatchFinancialDelivery(db,outbox,send),dispatchFinancialDelivery(db,outbox,send)]);
  assert.deepEqual(addresses,[`${good}@example.invalid`]);
  assert.equal((await db.query('SELECT state FROM financial_delivery_outbox WHERE id=$1',[outbox])).rows[0].state,'sent');
  const artifact=(await db.query('SELECT pdf_bytes FROM document_artifacts WHERE document_id=$1',[document])).rows[0].pdf_bytes;
  assert.deepEqual(delivered[0],artifact);
  const service=new DocumentService(new NumberSeriesService(db),db);
  assert.deepEqual((await service.download(document,{role:'school_user',schoolId:school})).bytes,artifact);
  await assert.rejects(service.download(document,{role:'school_user',schoolId:other}));
  await assert.rejects(db.query("UPDATE document_artifacts SET sha256=repeat('0',64) WHERE document_id=$1",[document]),/immutable/);
  const logs=(await db.query('SELECT * FROM financial_delivery_attempts WHERE outbox_id=$1',[outbox])).rows;
  assert.equal(logs.filter(row=>row.state==='skipped').length,3);
  // Email changes invalidate existing verification; each retry re-resolves the account.
  await db.query("UPDATE users SET email='changed-'||email WHERE id=$1",[good]);
  await db.query("UPDATE financial_delivery_outbox SET state='pending',attempts=0,next_attempt_at=now() WHERE id=$1",[outbox]);
  for(let i=0;i<6;i++){
   await db.query('UPDATE financial_delivery_outbox SET next_attempt_at=now() WHERE id=$1',[outbox]);
   await dispatchFinancialDelivery(db,outbox,send);
  }
  const failed=(await db.query('SELECT state,attempts FROM financial_delivery_outbox WHERE id=$1',[outbox])).rows[0];
  assert.deepEqual(failed,{state:'failed',attempts:5});assert.equal(addresses.length,1);
    // Concurrent monthly retries recover existing issuance without clobbering payment review.
  await db.query("UPDATE billing_cycles SET status='pending_verification' WHERE id=$1",[cycle]);
  const monthly=randomUUID();
  await db.query("INSERT INTO financial_month_jobs(id,site_id,period_start,period_end) VALUES($1,$2,'2026-09-01','2026-09-30')",[monthly,site]);
  const scheduler=new FinancialAutomationService(db);
  await Promise.all([scheduler.processMonth(monthly),scheduler.processMonth(monthly)]);
  assert.equal((await db.query('SELECT state FROM financial_month_jobs WHERE id=$1',[monthly])).rows[0].state,'done');
  assert.equal((await db.query('SELECT status FROM billing_cycles WHERE id=$1',[cycle])).rows[0].status,'pending_verification');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM documents WHERE billing_cycle_id=$1',[cycle])).rows[0].n,1);
await db.query("INSERT INTO system_settings(key,value) VALUES('financialRemindersEnabled','true'),('financialReminderDays','[1,7]') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  const automation=new FinancialAutomationService(db);
  await (automation as any).queueReminders();
  const reminders=(await db.query("SELECT id FROM financial_delivery_outbox WHERE document_id=$1 AND purpose LIKE 'reminder:%'",[document])).rows;
  assert.equal(reminders.length,2);
  await db.query("INSERT INTO payments(id,billing_cycle_id,status,amount) VALUES($1,$2,'pending_verification',100)",[randomUUID(),cycle]);
  await dispatchFinancialDelivery(db,reminders[0].id,send);
  assert.equal((await db.query('SELECT state FROM financial_delivery_outbox WHERE id=$1',[reminders[0].id])).rows[0].state,'paused');
  // Fresh issuance truthfully remains blocked at accounting, and hourly retries retain one first notice.
  const nextCycle=randomUUID(),blockedJob=randomUUID();
  await db.query("INSERT INTO billing_cycles(id,site_id,contract_id,period_start,period_end,cutoff_time,status,quality,opening_energy,closing_energy,consumed_kwh,rate,amount,meter_snapshot) VALUES($1,$2,$3,'2026-10-01','2026-10-31','2026-10-31T17:00:00Z','pending_review','complete',125,150,25,4,100,'[]')",[nextCycle,site,contract]);
  await db.query("INSERT INTO financial_month_jobs(id,site_id,period_start,period_end) VALUES($1,$2,'2026-10-01','2026-10-31')",[blockedJob,site]);
  await scheduler.processMonth(blockedJob);
  const blocked=(await db.query('SELECT state,last_error,next_attempt_at>now() AS deferred FROM financial_month_jobs WHERE id=$1',[blockedJob])).rows[0];
  assert.equal(blocked.state,'blocked');assert.equal(blocked.deferred,true);assert.match(blocked.last_error,/ACCOUNTING_NOT_CONFIRMED/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM documents WHERE billing_cycle_id=$1',[nextCycle])).rows[0].n,0);
  await db.query('UPDATE financial_month_jobs SET next_attempt_at=now() WHERE id=$1',[blockedJob]);
  await scheduler.processMonth(blockedJob);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM financial_staff_notices WHERE dedupe_key=$1",[`month-first:${blockedJob}`])).rows[0].n,1);
  await (scheduler as any).dailySummary();await (scheduler as any).dailySummary();
  assert.equal((await db.query("SELECT count(*)::int AS n FROM financial_staff_notices WHERE site_id=$1 AND kind='daily_billing_summary'",[site])).rows[0].n,1);
  // A queued legacy snapshot must never be mistaken for permission to reconstruct.
  const legacy=randomUUID();
  await db.query("INSERT INTO documents(id,site_id,billing_cycle_id,document_type,document_number,status,issue_date,amount,snapshot) VALUES($1,$2,$3,'receipt',$4,'issued','2026-10-01',100,$5)",[legacy,site,cycle,`LEGACY-${legacy}`,snapshot]);
  await db.transaction(client=>queueDocumentDelivery(client,legacy));
  await assert.rejects(db.transaction(client=>ensureDocumentArtifact(client,legacy)),/historical documents are not reconstructed/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM document_artifacts WHERE document_id=$1',[legacy])).rows[0].n,0);
  // Timeout could follow SMTP acceptance; never retry an ambiguous dispatch automatically.
  await db.query('UPDATE users SET verified_email=email,email_verified_at=now() WHERE id=$1',[good]);
  const uncertainBox=randomUUID();
  await db.query("INSERT INTO financial_delivery_outbox(id,document_id,purpose) VALUES($1,$2,'reminder:99')",[uncertainBox,document]);
  await db.query("UPDATE payments SET status='rejected' WHERE billing_cycle_id=$1",[cycle]);
  let timeoutAttempts=0;
  const timeout=async()=>{timeoutAttempts++;throw Object.assign(new Error('Connection timed out after DATA'),{code:'ETIMEDOUT'});};
  await dispatchFinancialDelivery(db,uncertainBox,timeout);
  await dispatchFinancialDelivery(db,uncertainBox,timeout);
  assert.equal(timeoutAttempts,1);
  assert.equal((await db.query('SELECT state FROM financial_delivery_outbox WHERE id=$1',[uncertainBox])).rows[0].state,'uncertain');
  const exhausted=randomUUID();
  await db.query("INSERT INTO financial_delivery_outbox(id,document_id,purpose,state,attempts) VALUES($1,$2,'reminder:100','retry',5)",[exhausted,document]);
  await dispatchFinancialDelivery(db,exhausted,send);
  assert.equal((await db.query('SELECT state FROM financial_delivery_outbox WHERE id=$1',[exhausted])).rows[0].state,'failed');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM financial_staff_notices WHERE dedupe_key=$1',[`delivery-failed:${exhausted}`])).rows[0].n,1);
 }finally{await db.pool.end();}
});







