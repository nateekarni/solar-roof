import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { NotificationFeedService } from './notification-feed.service.js';
import type { DatabaseService } from '../../database/database.service.js';
const uid='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
const school='10000000-0000-0000-0000-000000000001',school2='10000000-0000-0000-0000-000000000002';
const site='20000000-0000-0000-0000-000000000001',site2='20000000-0000-0000-0000-000000000002';
const contract='30000000-0000-0000-0000-000000000001',cycle='40000000-0000-0000-0000-000000000001';
test('PostgreSQL enforces scope, per-user reads and transactional lifecycle events',{skip:process.env.NOTIFICATION_SQL_TEST!=='true'},async t=>{
 const url=process.env.NOTIFICATION_TEST_DATABASE_URL;assert.ok(url);assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname));
 const pool=new Pool({connectionString:url});const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query('CREATE SCHEMA notification_test; SET LOCAL search_path=notification_test,public');
  await client.query(`CREATE TABLE users(id uuid PRIMARY KEY);
   CREATE TABLE sites(id uuid PRIMARY KEY,school_id uuid NOT NULL);
   CREATE TABLE contracts(id uuid PRIMARY KEY,site_id uuid,version integer,status text);
   CREATE TABLE billing_cycles(id uuid PRIMARY KEY,site_id uuid);
   CREATE TABLE documents(id uuid PRIMARY KEY,site_id uuid,document_type text,status text,document_number text,created_at timestamptz DEFAULT now());
   CREATE TABLE payments(id uuid PRIMARY KEY,billing_cycle_id uuid,verified_at timestamptz,status text);
   CREATE TABLE alerts(id uuid PRIMARY KEY,site_id uuid,title text,detail text,severity text,occurred_at timestamptz,status text);
   CREATE TABLE platform_jobs(id uuid PRIMARY KEY,created_by uuid,scope uuid[],payload jsonb);
   CREATE TABLE notification_deliveries(id uuid PRIMARY KEY,user_id uuid,job_id uuid,title text,status text,created_at timestamptz);
  `);
  await client.query(await readFile(new URL('../../../../../infra/migrations/038_notification_feed.sql',import.meta.url),'utf8'));
  await client.query('INSERT INTO users VALUES($1),($2);',[uid,other]);
  await client.query('INSERT INTO sites VALUES($1,$2),($3,$4)',[site,school,site2,school2]);
  await client.query('INSERT INTO billing_cycles VALUES($1,$2)',[cycle,site]);
  const service=new NotificationFeedService(client as unknown as DatabaseService);
  const customer={id:uid,role:'school_user',schoolId:school};const admin={id:uid,role:'admin'};
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
  await client.query("INSERT INTO notification_feed_events VALUES('contract:outside',$1,'Other school','secret','/records/contracts/other',now())",[site2]);
  await t.test('rows and counts hide other schools and technical alarms from customers',async()=>{
   const result=await service.feed(customer);assert.equal(result.rows.length,4);assert.equal(result.unreadCount,4);
   assert.ok(result.rows.every((r:{kind:string})=>r.kind==='workflow'));
   assert.equal((await service.feed(admin)).unreadCount,6);
   assert.deepEqual(await service.feed({...customer,schoolId:undefined}),{rows:[],unreadCount:0});
   assert.equal((await service.feed(customer,site2)).unreadCount,0);
  });
  await t.test('unsupported destinations and revoked job scopes cannot leak into rows or read state',async()=>{
   await client.query('SAVEPOINT scope_fixtures');
   await client.query("INSERT INTO notification_feed_events VALUES('contract:bad-destination',$1,'Secret','Technical','/settings/platform',now())",[site]);
   await client.query("INSERT INTO platform_jobs VALUES('80000000-0000-0000-0000-000000000001',$1,ARRAY[$2::uuid,$3::uuid],'{}')",[uid,school,school2]);
   await client.query("INSERT INTO notification_deliveries VALUES('90000000-0000-0000-0000-000000000001',$1,'80000000-0000-0000-0000-000000000001','Mixed schools','failed',now())",[uid]);
   const operator={id:uid,role:'operator',schoolId:school};
   assert.equal((await service.feed(operator)).unreadCount,5);
   assert.equal((await service.feed({...operator,schoolId:undefined})).unreadCount,7);
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
   assert.equal((await service.feed({...customer,schoolId:school2})).unreadCount,1);
   assert.equal((await service.readAll(admin)).unreadCount,0);
   assert.equal((await client.query('SELECT status FROM alerts')).rows[0].status,'open');
   assert.equal((await service.feed({...admin,id:other})).unreadCount,6);
  });
  await t.test('reapplying the migration does not duplicate events or reset read state',async()=>{
   await client.query(await readFile(new URL('../../../../../infra/migrations/038_notification_feed.sql',import.meta.url),'utf8'));
   assert.equal((await service.feed(customer)).unreadCount,0);
   assert.equal((await service.feed({...customer,id:other})).unreadCount,4);
  });
 }finally{await client.query('ROLLBACK');client.release();await pool.end();}
});

test('concurrent readers return the committed unread count after a conflicting read insert',{skip:process.env.NOTIFICATION_SQL_TEST!=='true'},async()=>{
 const url=process.env.NOTIFICATION_TEST_DATABASE_URL;assert.ok(url);assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname));
 const pool=new Pool({connectionString:url});
 const setup=await pool.connect(),writer=await pool.connect(),reader=await pool.connect();
 const schema='notification_concurrency_'+randomUUID().replaceAll('-','');
 let pending:Promise<unknown>|undefined;
 try{
  await setup.query(`CREATE SCHEMA ${schema}; SET search_path=${schema},public;
   CREATE TABLE sites(id uuid PRIMARY KEY,school_id uuid);
   CREATE TABLE notification_feed_events(id text PRIMARY KEY,site_id uuid,title text,detail text,destination text,created_at timestamptz);
   CREATE TABLE notification_feed_reads(user_id uuid,notification_id text,read_at timestamptz,PRIMARY KEY(user_id,notification_id));
   CREATE TABLE alerts(id uuid,site_id uuid,title text,detail text,severity text,occurred_at timestamptz);
   CREATE TABLE platform_jobs(id uuid,created_by uuid,scope uuid[],payload jsonb);
   CREATE TABLE notification_deliveries(id uuid,user_id uuid,job_id uuid,title text,status text,created_at timestamptz);
  `);
  await setup.query('INSERT INTO sites VALUES($1,$2)',[site,school]);
  await setup.query("INSERT INTO notification_feed_events VALUES('document:concurrent',$1,'Issued invoice','','/records/documents/concurrent',now())",[site]);
  await writer.query(`SET search_path=${schema},public; BEGIN`);
  await reader.query(`SET search_path=${schema},public`);
  await writer.query("INSERT INTO notification_feed_reads VALUES($1,'document:concurrent',now())",[uid]);
  const pid=(await reader.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const service=new NotificationFeedService(reader as unknown as DatabaseService);
  pending=service.read({id:uid,role:'school_user',schoolId:school},['document:concurrent']);
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
  assert.equal((await service.feed({id:uid,role:'school_user',schoolId:school})).unreadCount,0);
 }finally{
  await writer.query('ROLLBACK');
  if(pending)await pending.catch(()=>{});
  await setup.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  setup.release();writer.release();reader.release();await pool.end();
 }
});
