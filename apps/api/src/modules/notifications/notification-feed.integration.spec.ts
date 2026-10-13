import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { NotificationFeedService } from './notification-feed.service.js';
import type { DatabaseService } from '../../database/database.service.js';
import type { FinancialReadinessStatus } from '@solar/api-contracts';
const completeReadiness:FinancialReadinessStatus={scope:null,fingerprint:'a'.repeat(64),approval:null,items:[],actions:{calculate:{enabled:false,missing:[]},issue:{enabled:false,missing:[]},approve_payment:{enabled:false,missing:[]},adjust:{enabled:false,missing:[]},send:{enabled:false,missing:[]}}};
function testDatabaseUrl(){
 const url=process.env.NOTIFICATION_TEST_DATABASE_URL;assert.ok(url);
 const target=new URL(url);
 assert.ok(['postgres:','postgresql:'].includes(target.protocol)&&['localhost','127.0.0.1','[::1]'].includes(target.hostname)&&!target.search&&!target.hash);
 assert.match(target.pathname,/^\/[a-z0-9_]*(?:test|review)[a-z0-9_]*$/i,'Dedicated test or review database required');
 return url;
}
const uid='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
const ownerId='00000000-0000-0000-0000-000000000003',adminId='00000000-0000-0000-0000-000000000004',operatorId='00000000-0000-0000-0000-000000000005';
const customerIdentity='10000000-0000-0000-0000-000000000001',customer2='10000000-0000-0000-0000-000000000002';
const site='20000000-0000-0000-0000-000000000001',site2='20000000-0000-0000-0000-000000000002';
const contract='30000000-0000-0000-0000-000000000001',cycle='40000000-0000-0000-0000-000000000001';
test('PostgreSQL enforces scope, per-user reads and transactional lifecycle events',{skip:process.env.NOTIFICATION_SQL_TEST!=='true'},async t=>{
 const url=testDatabaseUrl();
 const pool=new Pool({connectionString:url});const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query('CREATE SCHEMA notification_test; SET LOCAL search_path=notification_test,public');
  await client.query(`CREATE TABLE users(id uuid PRIMARY KEY,role text,status text DEFAULT 'active');
   CREATE TABLE site_account_assignments(user_id uuid,site_id uuid,revoked_at timestamptz);
   CREATE TABLE operational_event_recipients(notification_id text,user_id uuid);
   CREATE TABLE operational_delivery_outbox(alert_id uuid);
   CREATE TABLE sites(id uuid PRIMARY KEY,customer_id uuid NOT NULL);
   CREATE TABLE contracts(id uuid PRIMARY KEY,site_id uuid,version integer,status text);
   CREATE TABLE billing_cycles(id uuid PRIMARY KEY,site_id uuid);
   CREATE TABLE documents(id uuid PRIMARY KEY,site_id uuid,document_type text,status text,document_number text,created_at timestamptz DEFAULT now());
   CREATE TABLE payments(id uuid PRIMARY KEY,billing_cycle_id uuid,verified_at timestamptz,status text);
   CREATE TABLE alerts(id uuid PRIMARY KEY,site_id uuid,title text,detail text,severity text,occurred_at timestamptz,status text);
   CREATE TABLE platform_jobs(id uuid PRIMARY KEY,created_by uuid,scope uuid[],payload jsonb);
   CREATE TABLE notification_deliveries(id uuid PRIMARY KEY,user_id uuid,job_id uuid,title text,status text,created_at timestamptz);
  `);
  await client.query(await readFile(new URL('../../../../../infra/migrations/038_notification_feed.sql',import.meta.url),'utf8'));
  await client.query("INSERT INTO users(id,role) VALUES($1,'customer_user'),($2,'customer_user'),($3,'owner'),($4,'admin'),($5,'operator')",[uid,other,ownerId,adminId,operatorId]);
  await client.query(await readFile(new URL('../../../../../infra/migrations/047_employee_domain_permissions.sql',import.meta.url),'utf8'));
  await client.query(await readFile(new URL('../../../../../infra/migrations/049_live_notification_permissions.sql',import.meta.url),'utf8'));
  await client.query(`INSERT INTO employee_domain_grants(user_id,domain,overrides,scope_mode) VALUES($1,'business','{"business.billing.view":true,"business.documents.view":true,"business.receipts.view":true}','all')`,[operatorId]);
  await client.query('INSERT INTO sites VALUES($1,$2),($3,$4)',[site,customerIdentity,site2,customer2]);
  await client.query('INSERT INTO site_account_assignments(user_id,site_id) VALUES($1,$3),($2,$3)',[uid,other,site]);
  await client.query('INSERT INTO billing_cycles VALUES($1,$2)',[cycle,site]);
  let readinessStatus=completeReadiness;
  const readiness={status:async()=>readinessStatus};
  const service=new NotificationFeedService(client as unknown as DatabaseService,readiness);
  const customer={id:uid,role:'customer_user',customerId:customerIdentity,assignedSiteIds:[site]};const admin={id:adminId,role:'admin'};const owner={id:ownerId,role:'owner'};
  await t.test('lifecycle emits only real transitions and rolls back with business data',async()=>{
   await client.query('INSERT INTO contracts VALUES($1,$2,1,\'active\')',[contract,site]);
   await client.query('UPDATE contracts SET version=version WHERE id=$1',[contract]);
   assert.equal((await service.feed(customer)).unreadCount,1);
   await client.query('UPDATE contracts SET version=2 WHERE id=$1',[contract]);
   assert.equal((await service.feed(customer)).unreadCount,2);
   await client.query("INSERT INTO documents VALUES('50000000-0000-0000-0000-000000000001',$1,'invoice','draft','INV-1',now())",[site]);
   assert.equal((await service.feed(customer)).unreadCount,2);
   await client.query("UPDATE documents SET status='issued'");
   await client.query("UPDATE documents SET status='finalized'");
   assert.equal((await service.feed(customer)).unreadCount,3);
   const invoice=(await service.feed(customer)).rows.find((row:{id:string})=>row.id==='document:50000000-0000-0000-0000-000000000001');
   assert.equal(invoice.destination,'/records/documents/50000000-0000-0000-0000-000000000001');
   await client.query("INSERT INTO payments VALUES('60000000-0000-0000-0000-000000000001',$1,NULL,'pending')",[cycle]);
   await client.query("UPDATE payments SET status='paid',verified_at=now()");
   assert.equal((await service.feed(customer)).unreadCount,4);
   await client.query('SAVEPOINT business_rollback');
   await client.query('UPDATE contracts SET version=3');
   await client.query('ROLLBACK TO SAVEPOINT business_rollback');
   assert.equal((await service.feed(customer)).unreadCount,4);
  });
  await client.query("INSERT INTO alerts VALUES('70000000-0000-0000-0000-000000000001',$1,'Technical alarm','secret','critical',now(),'open')",[site]);
  await client.query("INSERT INTO notification_feed_events VALUES('contract:outside',$1,'Other customer','secret','/records/contracts/other',now())",[site2]);
  await t.test('rows and counts hide other customers and technical alarms from customers',async()=>{
   const result=await service.feed(customer);assert.equal(result.rows.length,4);assert.equal(result.unreadCount,4);
   assert.ok(result.rows.every((r:{kind:string})=>r.kind==='workflow'));
   assert.equal((await service.feed(admin)).unreadCount,1);
   assert.equal((await service.feed(owner)).unreadCount,5);
   assert.deepEqual(await service.feed({...customer,customerId:undefined}),{rows:[],unreadCount:0});
   assert.equal((await service.feed(customer,site2)).unreadCount,0);
  });
  await t.test('unsupported destinations and revoked job scopes cannot leak into rows or read state',async()=>{
   await client.query('SAVEPOINT scope_fixtures');
   await client.query("INSERT INTO notification_feed_events VALUES('contract:bad-destination',$1,'Secret','Technical','/settings/platform',now())",[site]);
   await client.query("INSERT INTO platform_jobs VALUES('80000000-0000-0000-0000-000000000001',$1,ARRAY[$2::uuid,$3::uuid],'{}')",[operatorId,customerIdentity,customer2]);
   await client.query("INSERT INTO notification_deliveries VALUES('90000000-0000-0000-0000-000000000001',$1,'80000000-0000-0000-0000-000000000001','Mixed customers','failed',now())",[operatorId]);
   const operator={id:operatorId,role:'operator',customerId:customerIdentity};
   assert.equal((await service.feed(operator)).unreadCount,5);
   assert.equal((await service.feed({...operator,customerId:undefined})).unreadCount,7);
   await service.read(operator,['workflow:90000000-0000-0000-0000-000000000001','contract:bad-destination']);
   assert.equal((await client.query("SELECT count(*)::int AS count FROM notification_feed_reads WHERE notification_id IN ('workflow:90000000-0000-0000-0000-000000000001','contract:bad-destination')")).rows[0].count,0);
   assert.equal((await service.feed(customer)).unreadCount,4);
   await client.query('ROLLBACK TO SAVEPOINT scope_fixtures');
  });
  await t.test('read only touches accessible current-user identities and never acknowledges alerts',async()=>{
   assert.equal((await service.read(customer,['contract:outside','alert:70000000-0000-0000-0000-000000000001'])).unreadCount,4);
   assert.equal((await service.readAll(customer,site2)).unreadCount,0);
   assert.equal((await service.readAll(customer,site)).unreadCount,0);
   assert.equal((await service.feed({...customer,id:other})).unreadCount,4);
   assert.equal((await service.feed({...customer,customerId:customer2,assignedSiteIds:[site2]})).unreadCount,0);
   assert.equal((await service.readAll(admin)).unreadCount,0);
   assert.equal((await service.readAll(owner)).unreadCount,0);
   assert.equal((await client.query('SELECT status FROM alerts')).rows[0].status,'open');
   assert.equal((await service.feed({...customer,id:other})).unreadCount,4);
  });
  await t.test('reapplying the migration does not duplicate events or reset read state',async()=>{
   await client.query(await readFile(new URL('../../../../../infra/migrations/038_notification_feed.sql',import.meta.url),'utf8'));
   assert.equal((await service.feed(customer)).unreadCount,0);
   assert.equal((await service.feed({...customer,id:other})).unreadCount,4);
  });
  await t.test('persisted recipients and live assignment revocation govern rows and read writes',async()=>{
   await client.query("INSERT INTO notification_feed_events VALUES('workflow:assigned',$1,'Reminder','Due','/records/billing/cycle',now())",[site]);
   await client.query("INSERT INTO operational_event_recipients VALUES('workflow:assigned',$1)",[uid]);
   assert.equal((await service.feed(customer)).unreadCount,1);
   assert.equal((await service.feed({...customer,id:other})).unreadCount,4);
   await client.query('UPDATE site_account_assignments SET revoked_at=now() WHERE user_id=$1',[uid]);
   assert.deepEqual(await service.feed(customer),{rows:[],unreadCount:0});
   await service.read(customer,['workflow:assigned']);
   assert.equal((await client.query("SELECT count(*)::integer AS count FROM notification_feed_reads WHERE notification_id='workflow:assigned'")).rows[0].count,0);
  });
  await t.test('derived finance reminders use current identity and per-Owner persisted read state',async()=>{
   const secondOwner='00000000-0000-0000-0000-000000000006';
   await client.query("INSERT INTO users(id,role) VALUES($1,'owner')",[secondOwner]);
   readinessStatus={...completeReadiness,items:[{id:'company.logo',ready:false,responsibility:'owner'},{id:'approval.confirmation',ready:false,responsibility:'owner'},{id:'environment.smtp',ready:false,responsibility:'environment'}]};
   const id='workflow:finance-readiness:aaaaaaaaaaaaaaaaaaaaaaaa';
   const initial=await service.feed(owner);
   assert.equal(initial.unreadCount,1);
   assert.equal(initial.rows[0].id,id);
   assert.deepEqual(initial.rows[0].metadata,{type:'finance-readiness',missingCount:2});
   assert.equal((await service.feed(owner,site2)).rows[0].id,id);
   assert.equal((await service.feed(admin)).rows.some((r:{id:string})=>r.id===id),false);
   await service.read(admin,[id]);await service.read(customer,[id]);
   await service.read(owner,['workflow:finance-readiness:forged']);
   assert.equal((await client.query("SELECT count(*)::int AS count FROM notification_feed_reads WHERE notification_id LIKE 'workflow:finance-readiness:%'")).rows[0].count,0);
   assert.deepEqual(await service.read(owner,[id,id]),{unreadCount:0});
   assert.ok((await service.feed(owner)).rows[0].readAt);
   assert.equal((await service.feed({...owner,id:secondOwner})).unreadCount,6);
   assert.equal((await client.query('SELECT count(*)::int AS count FROM notification_feed_reads WHERE user_id=$1 AND notification_id=$2',[ownerId,id])).rows[0].count,1);
   readinessStatus={...readinessStatus,fingerprint:'b'.repeat(64),items:[{id:'approval.confirmation',ready:false,responsibility:'owner'}]};
   const renewed='workflow:finance-readiness:bbbbbbbbbbbbbbbbbbbbbbbb';
   assert.equal((await service.feed(owner)).unreadCount,1);
   await service.read(owner,[id]);
   assert.equal((await service.feed(owner)).unreadCount,1);
   assert.equal((await client.query('SELECT count(*)::int AS count FROM notification_feed_reads WHERE notification_id=$1',[renewed])).rows[0].count,0);
   assert.deepEqual(await service.readAll(owner,site2),{unreadCount:0});
   assert.ok((await service.feed(owner)).rows[0].readAt);
   readinessStatus={...completeReadiness,items:[{id:'environment.smtp',ready:false,responsibility:'environment'},{id:'site.meter',ready:false,responsibility:'technical'}]};
   const completed=await service.feed(owner);
   assert.equal(completed.unreadCount,0);
   assert.equal(completed.rows.some((r:{id:string})=>r.id.startsWith('workflow:finance-readiness:')),false);
   await service.read(owner,['workflow:finance-readiness:cccccccccccccccccccccccc']);
   assert.equal((await client.query("SELECT count(*)::int AS count FROM notification_feed_reads WHERE notification_id='workflow:finance-readiness:cccccccccccccccccccccccc'")).rows[0].count,0);
  });
  await t.test('read-all includes derived and persisted items beyond the returned page',async()=>{
   await client.query('SAVEPOINT full_feed');
   await client.query("INSERT INTO notification_feed_events SELECT 'workflow:page:'||n,$1,'Billing item','','/records/billing/cycle',now() FROM generate_series(1,105) n",[site]);
   readinessStatus={...completeReadiness,fingerprint:'d'.repeat(64),items:[{id:'approval.confirmation',ready:false,responsibility:'owner'}]};
   const before=await service.feed(owner);
   assert.equal(before.rows.length,100);assert.equal(before.unreadCount,106);
   assert.equal(before.rows.filter((r:{id:string})=>r.id.startsWith('workflow:finance-readiness:')).length,1);
   assert.deepEqual(await service.readAll(owner),{unreadCount:0});
   assert.equal((await service.feed(owner)).unreadCount,0);
   assert.equal((await client.query("SELECT count(*)::int AS count FROM notification_feed_reads WHERE user_id=$1 AND (notification_id LIKE 'workflow:page:%' OR notification_id='workflow:finance-readiness:dddddddddddddddddddddddd')",[ownerId])).rows[0].count,106);
   await client.query('ROLLBACK TO SAVEPOINT full_feed');
   readinessStatus=completeReadiness;
  });
 }finally{await client.query('ROLLBACK');client.release();await pool.end();}
});

test('concurrent readers return the committed unread count after a conflicting read insert',{skip:process.env.NOTIFICATION_SQL_TEST!=='true'},async()=>{
 const url=testDatabaseUrl();
 const pool=new Pool({connectionString:url});
 const setup=await pool.connect(),writer=await pool.connect(),reader=await pool.connect();
 const schema='notification_concurrency_'+randomUUID().replaceAll('-','');
 let pending:Promise<unknown>|undefined;
 try{
  await setup.query(`CREATE SCHEMA ${schema}; SET search_path=${schema},public;
   CREATE TABLE users(id uuid PRIMARY KEY,role text,status text DEFAULT 'active');
   CREATE TABLE site_account_assignments(user_id uuid,site_id uuid,revoked_at timestamptz);
   CREATE TABLE operational_event_recipients(notification_id text,user_id uuid);
   CREATE TABLE operational_delivery_outbox(alert_id uuid);
   CREATE TABLE sites(id uuid PRIMARY KEY,customer_id uuid);
   CREATE TABLE notification_feed_events(id text PRIMARY KEY,site_id uuid,title text,detail text,destination text,created_at timestamptz);
   CREATE TABLE notification_feed_reads(user_id uuid,notification_id text,read_at timestamptz,PRIMARY KEY(user_id,notification_id));
   CREATE TABLE alerts(id uuid,site_id uuid,title text,detail text,severity text,occurred_at timestamptz);
   CREATE TABLE platform_jobs(id uuid,created_by uuid,scope uuid[],payload jsonb);
   CREATE TABLE notification_deliveries(id uuid,user_id uuid,job_id uuid,title text,status text,created_at timestamptz);
  `);
  await setup.query('INSERT INTO sites VALUES($1,$2)',[site,customerIdentity]);
  await setup.query("INSERT INTO users(id,role) VALUES($1,'customer_user')",[uid]);
  await setup.query(await readFile(new URL('../../../../../infra/migrations/047_employee_domain_permissions.sql',import.meta.url),'utf8'));
  await setup.query(await readFile(new URL('../../../../../infra/migrations/049_live_notification_permissions.sql',import.meta.url),'utf8'));
  await setup.query('INSERT INTO site_account_assignments(user_id,site_id) VALUES($1,$2)',[uid,site]);
  await setup.query("INSERT INTO notification_feed_events VALUES('document:concurrent',$1,'Issued invoice','','/records/documents/concurrent',now())",[site]);
  await writer.query(`SET search_path=${schema},public; BEGIN`);
  await reader.query(`SET search_path=${schema},public`);
  await writer.query("INSERT INTO notification_feed_reads VALUES($1,'document:concurrent',now())",[uid]);
  const pid=(await reader.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const service=new NotificationFeedService(reader as unknown as DatabaseService,{status:async()=>completeReadiness});
  pending=service.read({id:uid,role:'customer_user',customerId:customerIdentity,assignedSiteIds:[site]},['document:concurrent']);
  // The second insert takes its old snapshot, then waits on the first reader's
  // uncommitted unique key. Observe the actual PostgreSQL lock before commit.
  const deadline=Date.now()+3000;let blocked=false;
  while(Date.now()<deadline){
   blocked=(await setup.query("SELECT wait_event_type='Lock' AS blocked FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0]?.blocked===true;
   if(blocked)break;
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(blocked,true,'second reader must wait on the first read insert');
  await writer.query('COMMIT');
  assert.deepEqual(await pending,{unreadCount:0});
  assert.equal((await service.feed({id:uid,role:'customer_user',customerId:customerIdentity,assignedSiteIds:[site]})).unreadCount,0);
 }finally{
  await writer.query('ROLLBACK');
  if(pending)await pending.catch(()=>{});
  await setup.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  setup.release();writer.release();reader.release();await pool.end();
 }
});
