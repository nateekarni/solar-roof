import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {ConflictException} from '@nestjs/common';
import {TeamService} from './team.service.js';
import {DatabaseService} from '../../database/database.service.js';

async function fixture(){
 const connectionString=process.env.DATABASE_URL!;const url=new URL(connectionString);
 assert.ok(['localhost','127.0.0.1'].includes(url.hostname));assert.equal(url.port,'15449');assert.match(url.pathname,/(test|review)/);
 const schema='position_name_test_'+randomUUID().replaceAll('-','');
 const pool=new Pool({connectionString,application_name:schema,options:`-c search_path=${schema},public -c statement_timeout=5000`,max:4});
 await pool.query(`CREATE SCHEMA ${schema};CREATE TABLE users(id uuid PRIMARY KEY,role text,status text,updated_at timestamptz);CREATE TABLE sites(id uuid PRIMARY KEY);CREATE TABLE site_account_assignments(user_id uuid,site_id uuid,revoked_at timestamptz);CREATE TABLE audit_events(id uuid PRIMARY KEY,actor_id uuid,action text,entity_type text,entity_id uuid,correlation_id uuid,after_json jsonb)`);
 await pool.query(await readFile(new URL('../../../../../infra/migrations/047_employee_domain_permissions.sql',import.meta.url),'utf8'));
 return {pool,sql:await readFile(new URL('../../../../../infra/migrations/058_user_document_identity.sql',import.meta.url),'utf8'),close:async()=>{await pool.query(`DROP SCHEMA ${schema} CASCADE`);await pool.end();}};
}

for(const crossDomain of [false,true])test(`concurrent normalized position creation ${crossDomain?'across domains reuses identity':'in one domain requires existing-preset review'}`,{skip:process.env.RBAC_SQL_TEST!=='true'},async()=>{
 const f=await fixture();let release!:()=>void;const barrier=new Promise<void>(resolve=>{release=resolve;});let pending;
 try{
  await f.pool.query(f.sql);
  const owner={id:randomUUID(),role:'owner'},admin={id:randomUUID(),role:'admin'},first=randomUUID(),second=randomUUID();
  await f.pool.query("INSERT INTO users(id,role,status) VALUES($1,'owner','active'),($2,'admin','active'),($3,'operator','active'),($4,'operator','active')",[owner.id,admin.id,first,second]);
  const clients=await Promise.all([f.pool.connect(),f.pool.connect()]);
  const pids=await Promise.all(clients.map(async client=>(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid));
  const entered=new Set<number>();
  const services=clients.map((client,index)=>{
   let firstQuery=true;const wrapped=new Proxy(client,{get(target,key){if(key==='query')return async(sql:string,values:unknown[])=>{const result=await target.query(sql,values);if(firstQuery&&sql.includes('FROM users')){firstQuery=false;entered.add(index);await barrier;}return result;};const member=Reflect.get(target,key);return typeof member==='function'?member.bind(target):member;}});
   return new TeamService({transaction:(work:Parameters<DatabaseService['transaction']>[0])=>DatabaseService.prototype.transaction.call({pool:{connect:async()=>wrapped}} as unknown as DatabaseService,work)} as unknown as DatabaseService);
  });
  pending=Promise.allSettled(services.map((service,index)=>service.updateGrant(index&&crossDomain?admin:owner,index?second:first,index&&crossDomain?'technical':'business',{revision:0,position:{name:index?'\t finance \n':'Finance',rules:{}},overrides:{},scope:{mode:'all',siteIds:[]}})));
  const deadline=Date.now()+3000;let overlap=false;
  while(Date.now()<deadline){const rows=(await f.pool.query('SELECT pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=ANY($1::int[])',[pids])).rows;if(entered.size===2||entered.size===1&&rows.some(row=>row.blockers.some((pid:number)=>pids.includes(pid)))){overlap=true;break;}await new Promise(resolve=>setTimeout(resolve,10));}
  release();const outcomes=await pending;assert.equal(overlap,true);
  assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,crossDomain?2:1);
  assert.equal(outcomes.filter(result=>result.status==='fulfilled'&&result.value.positionReused===true).length,crossDomain?1:0);
  const failure=outcomes.find(result=>result.status==='rejected');
  if(!crossDomain){assert.ok(failure?.status==='rejected'&&failure.reason instanceof ConflictException);assert.equal((failure.reason.getResponse() as {code:string}).code,'POSITION_NAME_EXISTS');}
  const identities=(await f.pool.query('SELECT id,name FROM employee_positions')).rows;assert.equal(identities.length,1);
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM employee_position_domains')).rows[0].n,crossDomain?2:1);
  const users=(await f.pool.query('SELECT company_position_id,permission_revision FROM users WHERE id=ANY($1::uuid[])',[ [first,second] ])).rows;
  assert.equal(users.filter(row=>row.company_position_id===identities[0].id).length,crossDomain?2:1);
  assert.equal(users.reduce((sum,row)=>sum+row.permission_revision,0),crossDomain?2:1);
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM audit_events')).rows[0].n,crossDomain?2:1);
  const service=new TeamService({transaction:(work:Parameters<DatabaseService['transaction']>[0])=>DatabaseService.prototype.transaction.call({pool:f.pool} as unknown as DatabaseService,work)} as unknown as DatabaseService);
  await assert.rejects(service.savePosition(owner,'business',{name:' FINANCE ',rules:{'business.billing.view':true}}),error=>{assert.ok(error instanceof ConflictException);assert.equal((error.getResponse() as {code:string}).code,'POSITION_NAME_EXISTS');return true;});
  assert.deepEqual((await f.pool.query("SELECT rules FROM employee_position_domains WHERE domain='business'")).rows[0].rules,{});
  if(!crossDomain){
   const loser=outcomes.findIndex(result=>result.status==='rejected');
   await service.updateGrant(owner,loser?second:first,'business',{revision:0,position:{id:identities[0].id},overrides:{'business.billing.view':true},scope:{mode:'all',siteIds:[]}});
   assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM employee_positions')).rows[0].n,1);
   assert.equal((await f.pool.query('SELECT sum(permission_revision)::int AS n FROM users')).rows[0].n,2);
  }
  // Direct writes cannot bypass the authoritative normalized unique index.
  await assert.rejects(f.pool.query('INSERT INTO employee_positions(id,name) VALUES($1,$2)',[randomUUID(),'\u00a0FINANCE\u00a0']),error=>{assert.equal((error as {code:string}).code,'23505');return true;});
  await f.pool.query('INSERT INTO employee_positions(id,name) VALUES($1,$2)',[randomUUID(),'CAFE\u0301']);
  await assert.rejects(f.pool.query('INSERT INTO employee_positions(id,name) VALUES($1,$2)',[randomUUID(),'café']),error=>{assert.equal((error as {code:string}).code,'23505');return true;});
 }finally{release();if(pending)await pending;await f.close();}
});

test('migration refuses ambiguous existing presets without deleting or merging permission data',{skip:process.env.RBAC_SQL_TEST!=='true'},async()=>{
 const f=await fixture();const client=await f.pool.connect();
 try{
  await client.query('INSERT INTO employee_positions(id,name) VALUES($1,$3),($2,$4)',[randomUUID(),randomUUID(),'Finance',' finance ']);
  await client.query('BEGIN');
  await assert.rejects(client.query(f.sql),/Duplicate normalized position names/);
  await client.query('ROLLBACK');
  assert.equal((await client.query('SELECT count(*)::int AS n FROM employee_positions')).rows[0].n,2);
  assert.equal((await client.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='users' AND column_name='company_position_id'")).rows[0].n,0);
 }finally{await client.query('ROLLBACK');client.release();await f.close();}
});
