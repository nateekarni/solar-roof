import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
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
}));

// A rejected readiness probe must neither crash API startup nor install a timer.
test('scheduler tolerates unavailable dependencies at startup and permits a fresh readiness probe',async t=>environment(async()=>{
 t.mock.timers.enable({apis:['setInterval']});const f=readinessFixture();f.state.unavailable=true;let runs=0;
 const scheduler=new (FinancialScheduler as any)({monthly:async()=>{runs++;}},f.readiness);
 try{await scheduler.onModuleInit();t.mock.timers.tick(60000);await scheduler.tick();assert.equal(runs,0);f.state.unavailable=false;await scheduler.onModuleInit();t.mock.timers.tick(60000);await new Promise(setImmediate);assert.equal(runs,1);}finally{scheduler.onModuleDestroy();}
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
  const copy=['users','customers','sites','site_account_assignments','site_billing_settings','devices','payload_profile_revisions','billing_source_bindings','billing_meters','register_mapping_versions','rate_versions','company_profile','company_bank_accounts','contracts'];
  for(const table of [...copy,'billing_cycles','documents','document_artifacts','financial_delivery_outbox','document_number_series','payments','audit_events','financial_readiness_approvals','telemetry_raw','financial_month_jobs','financial_staff_notices','notification_deliveries']) {
   await pool.query(`CREATE TABLE ${schema}.${table} (LIKE public.${table} INCLUDING ALL)`);
   if(copy.includes(table))await pool.query(`INSERT INTO ${schema}.${table} SELECT * FROM public.${table}`);
  }
  const owner=(await pool.query("SELECT id FROM users WHERE role='owner' AND status='active' ORDER BY id LIMIT 1")).rows[0];assert.ok(owner);
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
  await t.test('00:59 creates no job; 01:00 issues and delivers only the ready site',async()=>{
   assert.deepEqual(await service.monthly(new Date('2026-09-30T17:59:00Z')),[]);
   assert.equal((await pool.query('SELECT count(*)::int n FROM financial_month_jobs')).rows[0].n,0);
   const jobs=await service.monthly(at);assert.equal(jobs.length,2);
   assert.equal(jobs.find(j=>j.site_id===siteId)?.state,'done');assert.equal(jobs.find(j=>j.site_id===blockedId)?.state,'blocked');
   const cycle=(await pool.query('SELECT * FROM billing_cycles')).rows[0];assert.equal(cycle.site_id,siteId);assert.equal(cycle.financial_scope,'PRODUCTION');assert.equal(Number(cycle.amount),4753.1);
   const document=(await pool.query('SELECT d.*,a.pdf_bytes,a.sha256 FROM documents d JOIN document_artifacts a ON a.document_id=d.id')).rows[0];
   assert.equal(document.snapshot.policy.scope,'PRODUCTION');assert.equal(createHash('sha256').update(document.pdf_bytes).digest('hex'),document.sha256);
   const mail=(await reviewMessages()).messages.filter(m=>!existingMail.has(m.ID)&&m.Subject.includes(document.document_number));
   assert.equal(mail.length,document.snapshot.recipients.length);assert.ok(mail.every((m:any)=>!m.Subject.includes('TEST')));
  });
  await t.test('blocked notice stores safe missing IDs and production notifications have no TEST marking',async()=>{
   const notice=(await pool.query('SELECT * FROM financial_staff_notices')).rows[0];assert.equal(notice.site_id,blockedId);assert.ok(Array.isArray(notice.detail.missing),'Safe readiness missing IDs must be persisted');assert.ok(notice.detail.missing.includes('site.tax'));
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
   assert.equal((await pool.query('SELECT count(*)::int n FROM financial_staff_notices')).rows[0].n,1);
   assert.equal((await pool.query("SELECT attempts FROM financial_month_jobs WHERE site_id=$1",[blockedId])).rows[0].attempts,2);
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
   const replay=await runBillingCutover({...input,apply:true},db,readiness,service);
   assert.equal(first.mode,'applied');assert.deepEqual(replay,first);
   assert.deepEqual(cli(true),first);
   assert.equal((await reviewMessages()).total,mailBefore);
   assert.equal((await pool.query('SELECT count(*)::int n FROM documents')).rows[0].n,1);
   assert.equal((await pool.query("SELECT count(*)::int n FROM audit_events WHERE action='finance.cutover_started'")).rows[0].n,1);
   await assert.rejects(runBillingCutover({...input,apply:true,periodStart:'2026-09-02'},db,readiness,service),/different inputs/);
   process.env.FINANCIAL_SCHEDULER_ENABLED='false';
   await assert.rejects(runBillingCutover({...input,apply:true},db,readiness,service));
  });
 } finally {await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
}));
