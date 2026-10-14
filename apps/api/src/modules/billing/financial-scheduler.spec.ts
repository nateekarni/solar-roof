import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import {Logger} from '@nestjs/common';
import {FinancialScheduler} from './financial-scheduler.js';
import {FinancialApplicationService} from './financial-application.service.js';
import {FinancialReadinessService} from '../financial-readiness/financial-readiness.service.js';
import {DatabaseService} from '../../database/database.service.js';
import {canonicalGlobalFinancialConfiguration} from '../settings/settings.service.js';
import {financialConfigurationHash} from '../financial-readiness/financial-configuration.js';
import {Pool} from 'pg';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {runBillingCutover} from '../../scripts/billing-cutover-runner.js';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

async function reviewMessages():Promise<{total:number;messages:Array<{ID:string;Subject:string}>}> {
 const response=await fetch('http://127.0.0.1:18049/api/v1/messages?limit=500');
 assert.equal(response.status,200);
 return await response.json() as {total:number;messages:Array<{ID:string;Subject:string}>};
}

const company={companyName:'Issuer',taxId:'1234567890123',branch:'Head office',address:'Address',phone:'123',email:'finance@example.invalid',logoUrl:'data:image/png;base64,iVBORw0KGgo=',signatureDataUri:'data:image/png;base64,iVBORw0KGgo=',signatoryName:'Signer',signatoryTitle:'Director'};
const banks=[{id:'bank',bankName:'Bank',accountName:'Issuer',accountNumber:'1234',isConfigured:true,isDefault:true}];
function readinessFixture() {
 const state={approved:true,stale:false,unavailable:false};
 const query=async(sql:string):Promise<any>=>{
  if(state.unavailable)throw Error('dependency unavailable with secret');
  if(sql.includes('company_profile'))return {rows:[company]};
  if(sql.includes('company_bank_accounts'))return {rows:banks};
  if(sql.includes('financial_readiness_approvals'))return {rows:state.approved?[{id:'approval',config_hash:state.stale?'old-hash':financialConfigurationHash(canonicalGlobalFinancialConfiguration(company,banks as any)),approved_at:'2026-10-01',approved_by:'owner'}]:[]};
  if(sql.includes('pg_advisory'))return {rows:[]};
  if(sql.includes('FROM sites'))return {rows:[]};
  throw Error(`Unexpected query: ${sql}`);
 };
 const db={query,transaction:async(work:any)=>work({query})} as unknown as DatabaseService;
 return {state,readiness:new FinancialReadinessService(db)};
}
async function environment(work:()=>Promise<void>) {
 const before={...process.env};
 Object.assign(process.env,{NODE_ENV:'production',FINANCIAL_WRITES_ENABLED:'true',FINANCIAL_SCHEDULER_ENABLED:'true',SMTP_HOST:'127.0.0.1',SMTP_PORT:'11049',SMTP_SECURE:'false',SMTP_FROM:'finance@example.invalid'});
 for(const name of ['LOCAL_FINANCIAL_FIXTURE_MARKER','SMTP_USER','SMTP_PASSWORD','SMTP_PASS'])delete process.env[name];
 try{await work();}finally{for(const name of Object.keys(process.env))if(!(name in before))delete process.env[name];Object.assign(process.env,before);}
}

// Losing any flag/approval/SMTP gate would dispatch a monthly run here.
test('scheduler installs no timer and dispatches no run when a production prerequisite is missing',async t=>environment(async()=>{
 const warnings=t.mock.method(Logger.prototype,'warn',()=>{});
 t.mock.timers.enable({apis:['setInterval']});
 for(const missing of ['writes','writes-default','scheduler','scheduler-default','approval','stale-approval','smtp']) {
  const f=readinessFixture();let runs=0;
  process.env.FINANCIAL_WRITES_ENABLED=missing==='writes'?'false':'true';
  if(missing==='writes-default')delete process.env.FINANCIAL_WRITES_ENABLED;
  if(missing==='scheduler-default')delete process.env.FINANCIAL_SCHEDULER_ENABLED;else process.env.FINANCIAL_SCHEDULER_ENABLED=missing==='scheduler'?'false':'true';
  process.env.SMTP_FROM=missing==='smtp'?'':'finance@example.invalid';f.state.approved=missing!=='approval';f.state.stale=missing==='stale-approval';
  const scheduler=new (FinancialScheduler as any)({monthly:async()=>{runs++;}},f.readiness);
  try{await scheduler.onModuleInit();t.mock.timers.tick(60000);await scheduler.tick(new Date('2026-09-30T18:00:00Z'));assert.equal(runs,0,missing);}finally{scheduler.onModuleDestroy();}
 }
 assert.deepEqual(warnings.mock.calls.map(call=>call.arguments[0]),Array.from({length:3},()=>[
  'Financial scheduler awaits production readiness; redeploy after prerequisites are complete.',
  'Financial scheduler run blocked or unavailable; saved jobs and delivery state are retained.',
 ]).flat());
}));

// A rejected readiness probe must neither crash API startup nor install a timer.
test('scheduler tolerates unavailable dependencies at startup and permits a fresh readiness probe',async t=>environment(async()=>{
 const warnings=t.mock.method(Logger.prototype,'warn',()=>{});
 t.mock.timers.enable({apis:['setInterval']});const f=readinessFixture();f.state.unavailable=true;let runs=0;
 const scheduler=new (FinancialScheduler as any)({monthly:async()=>{runs++;}},f.readiness);
 try{await scheduler.onModuleInit();t.mock.timers.tick(60000);await scheduler.tick();assert.equal(runs,0);f.state.unavailable=false;await scheduler.onModuleInit();t.mock.timers.tick(60000);await new Promise(setImmediate);assert.equal(runs,1);}finally{scheduler.onModuleDestroy();}
 assert.deepEqual(warnings.mock.calls.map(call=>call.arguments[0]),[
  'Financial scheduler awaits production readiness; redeploy after prerequisites are complete.',
  'Financial scheduler run blocked or unavailable; saved jobs and delivery state are retained.',
 ]);
}));

// Removing the overlap guard would let both ticks enter the business runner.
test('ready production scheduler dispatches its interval and concurrent ticks never overlap',async t=>environment(async()=>{
 t.mock.timers.enable({apis:['setInterval']});const f=readinessFixture();let runs=0;let release!:()=>void;
 const scheduler=new (FinancialScheduler as any)({monthly:async()=>{runs++;await new Promise<void>(resolve=>{release=resolve;});}},f.readiness);
 try{await scheduler.onModuleInit();t.mock.timers.tick(60000);await new Promise(setImmediate);assert.equal(runs,1);await scheduler.tick();assert.equal(runs,1);release();await new Promise(setImmediate);process.env.FINANCIAL_WRITES_ENABLED='false';await scheduler.tick();assert.equal(runs,1);}finally{scheduler.onModuleDestroy();}
}));

// The global pre-gate must not ask calculate without the authoritative site/period.
test('monthly cutoff waits until Bangkok 01:00 then creates previous-month jobs using global readiness',()=>environment(async()=>{
 const f=readinessFixture();const inserts:unknown[][]=[];
 const query=async(sql:string,values:unknown[]=[])=>{if(sql.includes('INSERT INTO financial_month_jobs'))inserts.push(values);return {rows:[]};};
 const service=new FinancialApplicationService({query} as any,f.readiness);
 assert.deepEqual(await service.monthly(new Date('2026-09-30T17:59:00Z')),[]);assert.equal(inserts.length,0);
 await service.monthly(new Date('2026-09-30T18:00:00Z'));assert.deepEqual(inserts,[['2026-09-01','2026-09-30']]);
 process.env.FINANCIAL_SCHEDULER_ENABLED='false';await assert.rejects(service.monthly(new Date('2026-09-30T18:00:00Z')));assert.equal(inserts.length,1);
}));

test('monthly completes after preparing approval and never issues or sends',()=>environment(async()=>{
 for(const ready of [true,false]) {
  const updates:string[]=[];
  const job={id:'job',site_id:'site',period_start:'2026-09-01',period_end:'2026-09-30',starts:'2026-09-01',ends:'2026-09-30'};
  const db={query:async(sql:string)=>{
   if(sql.includes("SET state='done'"))updates.push('done');
   if(sql.includes("SET state='blocked'")){updates.push('blocked');return {rows:[{id:job.id}]};}
   if(sql.includes("state IN('pending','blocked')"))return {rows:[job]};
   if(sql.includes('SELECT bc.*'))return {rows:[{id:'cycle'}]};
   if(sql.includes('financial_delivery_outbox'))throw Error('Scheduler read delivery state');
   return {rows:[]};
  }};
  const service=new FinancialApplicationService(db as any,readinessFixture().readiness);
  service.prepareInvoice=async()=>{if(!ready)throw Error('Blocked');return {cycle:{id:'cycle',status:'pending_issue_approval'},created:true};};
  service.issueInvoice=async()=>{throw Error('Scheduler issued');};service.send=async()=>{throw Error('Scheduler sent');};
  await service.monthly(new Date('2026-09-30T18:00:00Z'));
  assert.deepEqual(updates,ready?['done']:['blocked']);
 }
}));

// Real SQL/readiness/artifacts and Mailpit: bypassing a blocked site's gate,
// dropping uniqueness/replay guards, or leaking raw errors breaks these assertions.
test('production monthly jobs isolate blocked sites, retain safe notices and retry without duplicate originals or mail',
 {skip:!process.env.FINANCIAL_READINESS_TEST_DATABASE_URL},async t=>environment(async()=>{
 const target=new URL(process.env.FINANCIAL_READINESS_TEST_DATABASE_URL!);
 assert.equal(target.hostname,'127.0.0.1');assert.equal(target.port,'15449');assert.equal(target.pathname,'/solar_financial_flow_review');
 const schema='task8_'+randomUUID().replaceAll('-','');const admin=new Pool({connectionString:target.toString()});
 await admin.query(`CREATE SCHEMA ${schema}`);
 const pool=new Pool({connectionString:target.toString(),options:`-c search_path=${schema},public`,max:8});
 try {
  const copy=['employee_positions','users','employee_position_domains','employee_domain_grants','customers','sites','site_account_assignments','site_billing_settings','devices','payload_profile_revisions','billing_source_bindings','billing_meters','register_mapping_versions','rate_versions','company_profile','company_bank_accounts','contracts'];
  for(const table of [...copy,'billing_cycles','documents','document_artifacts','financial_delivery_outbox','document_number_series','payments','audit_events','financial_readiness_approvals','telemetry_raw','financial_month_jobs','financial_staff_notices','notification_deliveries']) {
   await pool.query(`CREATE TABLE ${schema}.${table} (LIKE public.${table} INCLUDING ALL)`);
   if(copy.includes(table))await pool.query(`INSERT INTO ${schema}.${table} SELECT * FROM public.${table}`);
  }
  await pool.query(await readFile(new URL('../../../../../infra/migrations/059_billing_issuance_approval.sql',import.meta.url),'utf8'));
  await pool.query(await readFile(new URL('../../../../../infra/migrations/058_user_document_identity.sql',import.meta.url),'utf8'));
  const owner=(await pool.query("SELECT id FROM users WHERE role='owner' AND status='active' ORDER BY id LIMIT 1")).rows[0];assert.ok(owner);
  const positionId=randomUUID();await pool.query("INSERT INTO employee_positions(id,name) VALUES($1,'Scheduler cutover approver')",[positionId]);
  await pool.query('UPDATE users SET company_position_id=$2 WHERE id=$1',[owner.id,positionId]);
  const siteId=(await pool.query(`SELECT s.id FROM sites s JOIN site_billing_settings cfg ON cfg.site_id=s.id WHERE EXISTS(SELECT 1 FROM billing_meters b WHERE b.site_id=s.id AND b.active) AND EXISTS(SELECT 1 FROM public.telemetry_raw tr WHERE tr.site_id=s.id AND tr.source_time='2026-09-01T00:00:00+07:00') ORDER BY s.id LIMIT 1`)).rows[0]?.id;assert.ok(siteId,'Dedicated review meter fixture required');
  const blockedId=(await pool.query('SELECT id FROM sites WHERE id<>$1 ORDER BY id LIMIT 1',[siteId])).rows[0]?.id;assert.ok(blockedId);
  // Limit job creation to the two sites, leaving one explicitly incomplete.
  await pool.query('DELETE FROM site_billing_settings WHERE site_id<>ALL($1::uuid[])',[[siteId,blockedId]]);
  await pool.query("UPDATE site_billing_settings SET service_start_date='2026-09-01',tax_rate=10,prices_include_tax=false,tax_confirmed=(site_id=$1),version=version+1",[siteId]);
  await pool.query(`INSERT INTO telemetry_raw SELECT * FROM public.telemetry_raw WHERE site_id=$1 AND source_time IN('2026-09-01T00:00:00+07:00','2026-10-01T00:00:00+07:00')`,[siteId]);
  const meter=(await pool.query('SELECT * FROM billing_meters WHERE site_id=$1 AND active ORDER BY id LIMIT 1',[siteId])).rows[0];
  await pool.query('UPDATE billing_meters SET active=false WHERE site_id=$1 AND id<>$2',[siteId,meter.id]);
  await pool.query("UPDATE telemetry_raw SET normalized_value=CASE WHEN source_time='2026-09-01T00:00:00+07:00' THEN 1000 ELSE 2000 END WHERE device_id=$1 AND semantic_field=$2",[meter.device_id,meter.semantic_field]);
  await pool.query('UPDATE rate_versions SET retired_at=now() WHERE site_id=$1',[siteId]);
  await pool.query("INSERT INTO rate_versions(id,site_id,effective_from,rate_type,rate,currency,changed_by,change_reason) VALUES($1,$2,'2026-09-01','fixed_kwh',4.3210,'THB',$3,'Task 8 deterministic fixture')",[randomUUID(),siteId,owner.id]);
  const logo='data:image/png;base64,'+(await readFile(new URL('../../../../web/public/brand/solar-roof-mark.png',import.meta.url))).toString('base64');
  await pool.query("UPDATE company_profile SET company_name='Production scheduler issuer',tax_id='1234567890123',branch='Head office',address='Address',phone='021234567',email='finance@example.invalid',logo_url=$1,signature_data_uri=$1,signatory_name='Signer',signatory_title='Director'",[logo]);
  await pool.query("UPDATE customers SET legal_name='Production customer',tax_id='1234567890123',tax_address='Address',document_email='customer@example.invalid',status='active' WHERE id=(SELECT customer_id FROM sites WHERE id=$1)",[siteId]);
  await pool.query("UPDATE sites SET status='active',timezone='Asia/Bangkok' WHERE id=ANY($1::uuid[])",[[siteId,blockedId]]);
  const db={pool,query:pool.query.bind(pool),transaction:DatabaseService.prototype.transaction} as unknown as DatabaseService;
  const readiness=new FinancialReadinessService(db);await readiness.confirm({id:owner.id,role:'owner'});
  const service=new FinancialApplicationService(db,readiness);const at=new Date('2026-09-30T18:00:00Z');
  const existingMail=new Set((await reviewMessages()).messages.map(m=>m.ID));
  await t.test('replicas prepare one pending invoice and notify staff without any issuance or mail',async()=>{
   assert.deepEqual(await service.monthly(new Date('2026-09-30T17:59:00Z')),[]);
   assert.equal((await pool.query('SELECT count(*)::int n FROM financial_month_jobs')).rows[0].n,0);
   const replica=new FinancialApplicationService(db,readiness);
   await Promise.all([new FinancialScheduler(service,readiness).tick(at),new FinancialScheduler(replica,readiness).tick(at)]);
   const jobs=(await pool.query('SELECT * FROM financial_month_jobs')).rows;
   assert.equal(jobs.find(j=>j.site_id===siteId)?.state,'done');assert.equal(jobs.find(j=>j.site_id===blockedId)?.state,'blocked');
   const cycle=(await pool.query('SELECT * FROM billing_cycles')).rows[0];
   assert.equal(cycle.status,'pending_issue_approval');assert.equal(cycle.financial_scope,'PRODUCTION');assert.equal(Number(cycle.amount),4753.1);
   for(const table of ['documents','document_artifacts','financial_delivery_outbox','document_number_series'])assert.equal((await pool.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n,0,table);
   const notices=(await pool.query("SELECT * FROM financial_staff_notices WHERE site_id=$1 AND kind='monthly_billing_awaiting_approval'",[siteId])).rows;
   assert.equal(notices.length,1);assert.equal(notices[0].detail.status,'pending_issue_approval');
   const notifications=(await pool.query("SELECT title FROM notification_deliveries WHERE title LIKE 'Billing awaiting issuance approval:%'")).rows;
   assert.ok(notifications.length);assert.ok(notifications.every(n=>!n.title.includes('issued')));
   assert.equal((await reviewMessages()).total,existingMail.size);
  });
  await t.test('blocked notice stores safe missing IDs and production notifications have no TEST marking',async()=>{
   const notice=(await pool.query('SELECT * FROM financial_staff_notices WHERE site_id=$1',[blockedId])).rows[0];assert.equal(notice.site_id,blockedId);assert.ok(Array.isArray(notice.detail.missing),'Safe readiness missing IDs must be persisted');assert.ok(notice.detail.missing.includes('site.tax'));
   assert.ok(!JSON.stringify(notice.detail).includes('Financial workflows await'));assert.equal(notice.detail.scope,'PRODUCTION');
   const notifications=(await pool.query("SELECT title FROM notification_deliveries WHERE channel='system'")).rows;assert.ok(notifications.length);assert.ok(notifications.every(n=>!n.title.includes('TEST')));
  });
  await t.test('replay and concurrent ticks retain job/document/mail counts; retry retains one blocked notice',async()=>{
   const originals=JSON.stringify((await pool.query('SELECT id,document_number,content_hash FROM documents ORDER BY id')).rows);
   const outboxes=JSON.stringify((await pool.query('SELECT * FROM financial_delivery_outbox ORDER BY id')).rows);
   const before=(await reviewMessages()).total;
   const scheduler=new FinancialScheduler(service,readiness);await Promise.all([scheduler.tick(at),scheduler.tick(at)]);
   await pool.query("UPDATE financial_month_jobs SET next_attempt_at=now() WHERE state='blocked'");await service.monthly(at);
   assert.equal(JSON.stringify((await pool.query('SELECT id,document_number,content_hash FROM documents ORDER BY id')).rows),originals);
   assert.equal(JSON.stringify((await pool.query('SELECT * FROM financial_delivery_outbox ORDER BY id')).rows),outboxes);
   assert.equal((await reviewMessages()).total,before);
   assert.equal((await pool.query('SELECT count(*)::int n FROM financial_staff_notices WHERE site_id=$1',[blockedId])).rows[0].n,1);
   assert.ok((await pool.query("SELECT attempts FROM financial_month_jobs WHERE site_id=$1",[blockedId])).rows[0].attempts>=2);
  });
  await t.test('cutover dry run writes nothing; explicit operation replay preserves originals and rejects changed inputs',async()=>{
   const input={siteId,periodStart:'2026-09-01',periodEnd:'2026-09-30',operationKey:randomUUID(),ownerId:owner.id,apply:false};
   const before=(await pool.query('SELECT count(*)::int n FROM audit_events')).rows[0].n;
   const preview=await runBillingCutover(input,db,readiness,service);assert.equal(preview.mode,'dry-run');
   assert.equal((await pool.query('SELECT count(*)::int n FROM audit_events')).rows[0].n,before);
   const cliTarget=new URL(target);cliTarget.searchParams.set('options',`-c search_path=${schema},public`);
   const args=[fileURLToPath(new URL('../../../../../node_modules/tsx/dist/cli.mjs',import.meta.url)),'--tsconfig',fileURLToPath(new URL('../../../tsconfig.json',import.meta.url)),fileURLToPath(new URL('../../scripts/billing-cutover.ts',import.meta.url)),`--site=${siteId}`,`--owner=${owner.id}`,'--period-start=2026-09-01','--period-end=2026-09-30',`--operation-key=${input.operationKey}`];
   const cli=(apply=false)=>JSON.parse(execFileSync(process.execPath,apply?[...args,'--apply']:args,{encoding:'utf8',env:{...process.env,DATABASE_URL:cliTarget.toString()}}));
   assert.equal(cli().mode,'dry-run');
   const mailBefore=(await reviewMessages()).total;
   const first=await runBillingCutover({...input,apply:true},db,readiness,service);
   assert.equal(first.mode,'applied');if(first.mode!=='applied')throw Error('Cutover did not apply');
   const recipients=(await pool.query('SELECT snapshot FROM documents WHERE id=$1',[first.documentId])).rows[0].snapshot.recipients.length;
   assert.equal((await reviewMessages()).total,mailBefore+recipients);
   const replay=await runBillingCutover({...input,apply:true},db,readiness,service);
   assert.equal(first.mode,'applied');assert.deepEqual(replay,first);
   assert.deepEqual(cli(true),first);
   assert.equal((await reviewMessages()).total,mailBefore+recipients);
   assert.equal((await pool.query('SELECT count(*)::int n FROM documents')).rows[0].n,1);
   assert.equal((await pool.query("SELECT count(*)::int n FROM audit_events WHERE action='finance.cutover_started'")).rows[0].n,1);
   await assert.rejects(runBillingCutover({...input,apply:true,periodStart:'2026-09-02'},db,readiness,service),/different inputs/);
   process.env.FINANCIAL_SCHEDULER_ENABLED='false';
   await assert.rejects(runBillingCutover({...input,apply:true},db,readiness,service));
  });
  await t.test('a late failed preparation replica cannot overwrite another replica completed preparation',async()=>{
   process.env.FINANCIAL_SCHEDULER_ENABLED='true';
   // Cutover has explicitly approved this cycle; replay must retain that original.
   const job=(await pool.query('SELECT id FROM financial_month_jobs WHERE site_id=$1',[siteId])).rows[0];
   await pool.query("UPDATE financial_month_jobs SET state='pending',completed_at=NULL,next_attempt_at=now() WHERE id=$1",[job.id]);
   const original=(await pool.query('SELECT id,document_number,content_hash FROM documents')).rows;
   const mailBefore=(await reviewMessages()).total;
   let arrived!:()=>void,release!:()=>void;const reached=new Promise<void>(resolve=>arrived=resolve),held=new Promise<void>(resolve=>release=resolve);
   const slowDb={...db,query:async(sql:string,values:unknown[]=[])=>{
    if(sql.includes('SELECT bc.*')&&values[0]===siteId){arrived();await held;throw Error('Dependency unavailable');}
    return db.query(sql,values);
   }} as DatabaseService;
   const losing=new FinancialScheduler(new FinancialApplicationService(slowDb,readiness),readiness).tick(at);
   await reached;await new FinancialScheduler(new FinancialApplicationService(db,readiness),readiness).tick(at);
   release();await losing;
   assert.equal((await pool.query('SELECT state FROM financial_month_jobs WHERE id=$1',[job.id])).rows[0].state,'done');
   assert.deepEqual((await pool.query('SELECT id,document_number,content_hash FROM documents')).rows,original);assert.equal((await reviewMessages()).total,mailBefore);
  });
  await t.test('monthly replay after explicit approval does not depend on delivery or resend saved originals',async()=>{
   const original=(await pool.query('SELECT id,content_hash FROM documents')).rows,mailBefore=(await reviewMessages()).total;
   await pool.query("UPDATE financial_month_jobs SET state='pending',completed_at=NULL,next_attempt_at=now() WHERE site_id=$1",[siteId]);
   await service.monthly(at);
   assert.equal((await pool.query('SELECT state FROM financial_month_jobs WHERE site_id=$1',[siteId])).rows[0].state,'done');
   assert.deepEqual((await pool.query('SELECT id,content_hash FROM documents')).rows,original);assert.equal((await reviewMessages()).total,mailBefore);
  });
  await t.test('first month ending on service start retains a same-day manual bill and creates a distinct metered energy invoice',async()=>{
   const manual=await service.manualInvoice({siteId,lines:[{description:'Installation service',quantity:'1.000',unitPrice:'100.0000'}],idempotencyKey:randomUUID()},owner.id);
   // A historical manual bill issued on the first service day. Only this private
   // fixture's calendar fields are backdated; its saved artifact remains intact.
   await pool.query("UPDATE billing_cycles SET period_start='2026-08-31',period_end='2026-08-31' WHERE id=$1",[manual.cycle.id]);
   await pool.query("UPDATE site_billing_settings SET service_start_date='2026-08-31' WHERE site_id=$1",[siteId]);
   await pool.query("INSERT INTO rate_versions(id,site_id,effective_from,effective_to,rate_type,rate,currency,changed_by,change_reason) VALUES($1,$2,'2026-08-31','2026-08-31','fixed_kwh',4.3210,'THB',$3,'Month-end regression agreed tariff')",[randomUUID(),siteId,owner.id]);
   await pool.query("INSERT INTO telemetry_raw SELECT (jsonb_populate_record(NULL::telemetry_raw,to_jsonb(tr)||jsonb_build_object('id',$1::uuid,'ingestion_id',$1::text,'source_time','2026-08-31T00:00:00+07:00','normalized_value',950,'total_energy_kwh',950))).* FROM telemetry_raw tr WHERE device_id=$2 AND semantic_field=$3 AND source_time='2026-09-01T00:00:00+07:00' LIMIT 1",[randomUUID(),meter.device_id,meter.semantic_field]);
   const monthEnd=new Date('2026-08-31T18:00:00Z');
   await service.monthly(monthEnd);
   const job=(await pool.query("SELECT state,last_error FROM financial_month_jobs WHERE site_id=$1 AND period_start='2026-08-01'",[siteId])).rows[0];
   assert.equal(job.state,'done',job.last_error);
   const cycles=(await pool.query("SELECT * FROM billing_cycles WHERE site_id=$1 AND period_start='2026-08-31' AND period_end='2026-08-31' ORDER BY billing_kind",[siteId])).rows;
   assert.deepEqual(cycles.map(c=>c.billing_kind),['energy','manual']);
   assert.equal(cycles[1].id,manual.cycle.id);assert.equal(Number(cycles[0].consumed_kwh),50);assert.equal(Number(cycles[0].amount),237.66);
   assert.equal((await pool.query("SELECT state FROM financial_month_jobs WHERE site_id=$1 AND period_start='2026-08-01'",[siteId])).rows[0].state,'done');
   const originals=(await pool.query('SELECT id,content_hash FROM documents WHERE billing_cycle_id=ANY($1::uuid[]) ORDER BY id',[cycles.map(c=>c.id)])).rows;
   assert.equal(originals.length,0);const beforeMail=(await reviewMessages()).total;
   await pool.query("UPDATE financial_month_jobs SET state='pending',completed_at=NULL,next_attempt_at=now() WHERE site_id=$1 AND period_start='2026-08-01'",[siteId]);
   await service.monthly(monthEnd);
   assert.deepEqual((await pool.query('SELECT id,content_hash FROM documents WHERE billing_cycle_id=ANY($1::uuid[]) ORDER BY id',[cycles.map(c=>c.id)])).rows,originals);
   assert.equal((await reviewMessages()).total,beforeMail);
  });
 } finally {await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
}));
