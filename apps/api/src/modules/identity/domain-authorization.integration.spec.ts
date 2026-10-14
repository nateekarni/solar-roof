import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { ConflictException } from '@nestjs/common';
import { TeamService } from './team.service.js';
import { AuthorizationService } from './authorization.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { hasPermission,siteScope } from '../../common/auth/authorization.js';
import { DatabaseService } from '../../database/database.service.js';

test('PostgreSQL domain presets overrides scope revision and revocation remain live and atomic',{skip:process.env.RBAC_SQL_TEST!=='true'},async()=>{
 const url=process.env.DATABASE_URL!;
 assert.ok(url);const location=new URL(url);assert.ok(['127.0.0.1','localhost'].includes(location.hostname));assert.equal(location.port,'15449');
 const pool=new Pool({connectionString:url});const client=await pool.connect();
 const owner={id:randomUUID(),role:'owner'},admin={id:randomUUID(),role:'admin'},employee=randomUUID(),siteA=randomUUID(),siteB=randomUUID();
 try{
  await client.query('BEGIN');await client.query(`CREATE SCHEMA rbac_domain_test; SET LOCAL search_path=rbac_domain_test,public`);
  await client.query(`CREATE TABLE users(id uuid PRIMARY KEY,email text,display_name text,avatar_data text,role text,status text,updated_at timestamptz);
   CREATE TABLE sites(id uuid PRIMARY KEY);
   CREATE TABLE site_account_assignments(user_id uuid,site_id uuid,revoked_at timestamptz);
   CREATE TABLE auth_sessions(id uuid PRIMARY KEY,user_id uuid,revoked_at timestamptz,refresh_hash text);
   CREATE TABLE audit_events(id uuid PRIMARY KEY,actor_id uuid,action text,entity_type text,entity_id text,correlation_id uuid,after_json jsonb);
   CREATE TABLE system_settings(key text PRIMARY KEY,value text,updated_at timestamptz);
  `);
  await client.query(await readFile(new URL('../../../../../infra/migrations/047_employee_domain_permissions.sql',import.meta.url),'utf8'));
  await client.query(await readFile(new URL('../../../../../infra/migrations/049_live_notification_permissions.sql',import.meta.url),'utf8'));
  await client.query(await readFile(new URL('../../../../../infra/migrations/058_user_document_identity.sql',import.meta.url),'utf8'));
  await client.query("INSERT INTO users(id,email,display_name,role,status) VALUES($1,'owner@test.local','Owner','owner','active'),($2,'admin@test.local','Admin','admin','active'),($3,'employee@test.local','Employee','operator','active')",[owner.id,admin.id,employee]);
  await client.query('INSERT INTO sites(id) VALUES($1),($2)',[siteA,siteB]);
  const db={query:client.query.bind(client),transaction:async(work:any)=>{await client.query('SAVEPOINT service_work');try{const result=await work(client);await client.query('RELEASE SAVEPOINT service_work');return result;}catch(error){await client.query('ROLLBACK TO SAVEPOINT service_work');throw error;}}} as unknown as DatabaseService;
  const team=new TeamService(db),authorization=new AuthorizationService(db),settings=new SettingsService(db);
  const position=await team.savePosition(owner,'business',{name:'Finance',rules:{'business.billing.view':true,'business.billing.approve':true}});
  const assignment=await team.updateGrant(owner,employee,'business',{revision:0,position:{id:position.id},overrides:{'business.billing.approve':false},scope:{mode:'selected',siteIds:[siteA]}});
  assert.deepEqual(assignment.position,{id:position.id,name:'Finance'});
  const technical=await team.updateGrant(admin,employee,'technical',{revision:1,position:{name:'วิศวกร',rules:{'technical.gateways.view':true}},overrides:{},scope:{mode:'selected',siteIds:[siteB]}});
  assert.equal(technical.position.name,'วิศวกร');
  assert.equal((await client.query('SELECT company_position_id FROM users WHERE id=$1',[employee])).rows[0].company_position_id,technical.position.id);
  assert.deepEqual((await client.query('SELECT rules FROM employee_position_domains WHERE position_id=$1',[technical.position.id])).rows[0].rules,{'technical.gateways.view':true});
  let live=await authorization.load(employee,'operator');assert.equal(live.revision,2);assert.equal(hasPermission({role:'operator',authorization:live},'business.billing.view'),true);assert.equal(hasPermission({role:'operator',authorization:live},'business.billing.approve'),false);
  assert.deepEqual(siteScope({role:'operator',authorization:live},'business'),[siteA]);assert.deepEqual(siteScope({role:'operator',authorization:live},'technical'),[siteB]);
  const access=async(domain:string,key:string,site:string)=>(await client.query('SELECT employee_can_access($1,$2,$3,$4) AS allowed',[employee,domain,key,site])).rows[0].allowed;
  assert.equal(await access('business','business.billing.view',siteA),true);assert.equal(await access('business','business.billing.view',siteB),false);assert.equal(await access('business','business.billing.approve',siteA),false);
  // A failure after all mutation statements must roll back the new preset, canonical position, grant and revision.
  const before=(await client.query('SELECT count(*)::int AS count FROM employee_positions')).rows[0].count;
  const previousGrant=(await client.query('SELECT * FROM employee_domain_grants WHERE user_id=$1 AND domain=\'business\'',[employee])).rows[0];
  await client.query(`CREATE FUNCTION reject_team_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.action='business.permissions.updated' THEN RAISE EXCEPTION 'Audit unavailable'; END IF; RETURN NEW; END$$;
   CREATE TRIGGER reject_team_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_team_audit()`);
  await assert.rejects(()=>team.updateGrant(owner,employee,'business',{revision:2,position:{name:'Rolled back',rules:{}},overrides:{},scope:{mode:'all',siteIds:[]}}),/Audit unavailable/);
  assert.equal((await client.query('SELECT count(*)::int AS count FROM employee_positions')).rows[0].count,before);
  assert.deepEqual((await client.query('SELECT company_position_id,permission_revision FROM users WHERE id=$1',[employee])).rows[0],{company_position_id:technical.position.id,permission_revision:2});
  assert.deepEqual((await client.query('SELECT * FROM employee_domain_grants WHERE user_id=$1 AND domain=\'business\'',[employee])).rows[0],previousGrant);
  await client.query('DROP TRIGGER reject_team_audit ON audit_events; DROP FUNCTION reject_team_audit()');
  const impact=await team.positionImpact(owner,position.id,'business',{rules:{'business.billing.view':false,'business.billing.approve':true}});assert.deepEqual(impact.employees[0]?.changes,[{permission:'business.billing.view',before:true,after:false}]);
  await team.savePosition(owner,'business',{name:'Finance',revision:0,rules:{'business.billing.view':false,'business.billing.approve':true}},position.id);
  live=await authorization.load(employee,'operator');assert.equal(live.revision,3);assert.equal(hasPermission({role:'operator',authorization:live},'business.billing.view'),false);assert.equal(await access('business','business.billing.view',siteA),false);
  await assert.rejects(()=>team.updateGrant(owner,employee,'business',{revision:2,position:{id:position.id},overrides:{},scope:{mode:'all',siteIds:[]}}),/reload/);
  await team.revokeGrant(owner,employee,'business',{revision:3});live=await authorization.load(employee,'operator');assert.equal(live.revision,4);assert.deepEqual(siteScope({role:'operator',authorization:live},'business'),[]);assert.equal(hasPermission({role:'operator',authorization:live},'technical.gateways.view'),true);
  await settings.updateDomainSettings('business',{revision:0,settings:{documentRetentionYears:9,defaultUnitPriceThb:5}},owner.id);
  await assert.rejects(()=>settings.updateDomainSettings('business',{revision:0,settings:{documentRetentionYears:2}},owner.id),/reload/);assert.equal((await settings.getDomainSettings('business')).settings.documentRetentionYears,9);
  assert.equal((await settings.getDomainSettings('technical')).revision,0);
  for(const [actor,domain,permission,name] of [[owner,'business','business.billing.view','กรรมการบริษัท'],[admin,'technical','technical.gateways.view','ผู้ดูแลระบบ']] as const){
   const original=await authorization.load(actor.id,actor.role);
   const manager=await team.updateGrant(actor,actor.id,domain,{revision:0,position:{name,rules:{[permission]:false}},overrides:{[permission]:false},scope:{mode:'selected',siteIds:[]}});
   const updated=await authorization.load(actor.id,actor.role);
   assert.deepEqual(updated.permissions,original.permissions);assert.deepEqual(updated.scopes,original.scopes);
   assert.equal(updated.revision,1);assert.equal(hasPermission({role:actor.role,authorization:updated},permission),true);
   assert.equal((await client.query('SELECT count(*)::int AS count FROM employee_domain_grants WHERE user_id=$1',[actor.id])).rows[0].count,0);
   assert.equal((await client.query('SELECT company_position_id FROM users WHERE id=$1',[actor.id])).rows[0].company_position_id,manager.position.id);
   assert.equal((await client.query('SELECT after_json FROM audit_events WHERE entity_id=$1 AND action=$2',[actor.id,`${domain}.permissions.updated`])).rows[0].after_json.position.name,name);
   const listing=(await team.employees(actor,domain)).employees;
   assert.deepEqual(listing.map(row=>row.role).sort(),[actor.role,'operator'].sort());
   assert.equal(listing.find(row=>row.id===actor.id)?.companyPosition,name);
   assert.equal(listing.find(row=>row.id===actor.id)?.companyPositionId,manager.position.id);
  }
  await client.query('INSERT INTO auth_sessions(id,user_id,refresh_hash) VALUES($1,$2,\'hash\')',[randomUUID(),employee]);
  const preview=await team.deactivationImpact(owner,employee);assert.equal(preview.activeSessions,1);assert.equal(preview.domains[0]?.domain,'technical');
  await team.deactivate(owner,employee,{revision:4,impactConfirmed:true});assert.equal(await access('technical','technical.gateways.view',siteB),false);assert.equal((await client.query('SELECT count(*)::int AS count FROM auth_sessions WHERE revoked_at IS NULL')).rows[0].count,0);
  assert.equal((await client.query("SELECT count(*)::int AS count FROM audit_events WHERE action='business.settings.updated'")).rows[0].count,1);
 }finally{await client.query('ROLLBACK');client.release();await pool.end();}
});

for(const role of ['owner','admin'] as const)for(const reciprocal of [false,true]){
 test(`PostgreSQL concurrent ${role} ${reciprocal?'reciprocal assignments':'self-saves'} serialize user locks`,{skip:process.env.RBAC_SQL_TEST!=='true'},async()=>{
  const connectionString=process.env.DATABASE_URL!;
  const location=new URL(connectionString);
  assert.ok(['127.0.0.1','localhost'].includes(location.hostname));assert.equal(location.port,'15449');
  assert.match(location.pathname,/^\/[a-z0-9_]*(?:test|review)[a-z0-9_]*$/i);
  const schema='team_lock_test_'+randomUUID().replaceAll('-','');
  const pool=new Pool({connectionString,options:`-c search_path=${schema},public -c statement_timeout=5000`,max:3});
  const ids=['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002'];
  const domain=role==='owner'?'business':'technical';
  let releaseBarrier!:()=>void;
  const barrier=new Promise<void>(resolve=>{releaseBarrier=resolve;});
  let pending:Promise<PromiseSettledResult<Awaited<ReturnType<TeamService['updateGrant']>>>[]>|undefined;
  const clients:PoolClient[]=[];
  try{
   await pool.query(`CREATE SCHEMA ${schema};
    CREATE TABLE users(id uuid PRIMARY KEY,role text,status text,updated_at timestamptz);
    CREATE TABLE sites(id uuid PRIMARY KEY);
    CREATE TABLE site_account_assignments(user_id uuid,site_id uuid,revoked_at timestamptz);
    CREATE TABLE audit_events(id uuid PRIMARY KEY,actor_id uuid,action text,entity_type text,entity_id uuid,correlation_id uuid,after_json jsonb)`);
   await pool.query(await readFile(new URL('../../../../../infra/migrations/047_employee_domain_permissions.sql',import.meta.url),'utf8'));
   await pool.query(await readFile(new URL('../../../../../infra/migrations/058_user_document_identity.sql',import.meta.url),'utf8'));
   await pool.query("INSERT INTO users(id,role,status) VALUES($1,$3,'active'),($2,$3,'active')",[ids[0],ids[1],role]);
   clients.push(await pool.connect(),await pool.connect());
   const pids=await Promise.all(clients.map(async client=>(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number));
   const initialLocks=new Set<number>();
   const services=clients.map((client,index)=>{
    let firstUserQuery=true;
    const wrapped=new Proxy(client,{get(target,key){
     if(key==='query')return async(sql:string,values:unknown[]=[])=>{
      const result=await target.query(sql,values);
      if(firstUserQuery&&sql.startsWith('SELECT')&&sql.includes('FROM users')){
       firstUserQuery=false;initialLocks.add(index);await barrier;
      }
      return result;
     };
     const member=Reflect.get(target,key);return typeof member==='function'?member.bind(target):member;
    }});
    // Execute the real transaction helper; only the connection boundary is controlled for the interleaving.
    const db={transaction:(work:Parameters<DatabaseService['transaction']>[0])=>DatabaseService.prototype.transaction.call({pool:{connect:async()=>wrapped}} as unknown as DatabaseService,work)} as unknown as DatabaseService;
    return new TeamService(db);
   });
   pending=Promise.allSettled(services.map((service,index)=>service.updateGrant({id:ids[reciprocal?index:0]!,role},ids[reciprocal?1-index:0]!,domain,{
    revision:0,position:{name:`Manager ${index}`,rules:{}},overrides:{},scope:{mode:'all',siteIds:[]},
   })));
   // Hold the first completed authorization/lock query until the other request has either
   // acquired a compatible lock (the old SHARE upgrade bug) or is waiting for its exclusive lock.
   let overlapping=false;
   const deadline=Date.now()+3000;
   while(Date.now()<deadline){
    const activity=(await pool.query('SELECT pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=ANY($1::int[])',[pids])).rows;
    if(initialLocks.size===2||initialLocks.size===1&&activity.some(row=>row.blockers.some((pid:number)=>pids.includes(pid)))){overlapping=true;break;}
    await new Promise(resolve=>setTimeout(resolve,10));
   }
   releaseBarrier();
   const outcomes=await pending;
   assert.equal(overlapping,true,'Requests must overlap while a participant row is locked');
   const successes=outcomes.filter(result=>result.status==='fulfilled');
   const failures=outcomes.filter(result=>result.status==='rejected');
   assert.equal(successes.length,reciprocal?2:1);
   assert.equal(failures.length,reciprocal?0:1);
   if(!reciprocal)assert.ok(failures[0]!.reason instanceof ConflictException,`Expected reload conflict, received ${failures[0]!.reason}`);
   const state=(await pool.query('SELECT id,role,status,company_position_id,permission_revision FROM users ORDER BY id')).rows;
   assert.equal(state[0].permission_revision,1);assert.equal(state[1].permission_revision,reciprocal?1:0);
   assert.ok(state[0].company_position_id);assert.equal(Boolean(state[1].company_position_id),reciprocal);
   assert.ok(state.every(row=>row.role===role&&row.status==='active'));
   assert.equal((await pool.query('SELECT count(*)::int AS count FROM employee_positions')).rows[0].count,reciprocal?2:1);
   assert.equal((await pool.query('SELECT count(*)::int AS count FROM employee_position_domains')).rows[0].count,reciprocal?2:1);
   assert.equal((await pool.query('SELECT count(*)::int AS count FROM employee_domain_grants')).rows[0].count,0);
   assert.equal((await pool.query('SELECT count(*)::int AS count FROM audit_events')).rows[0].count,reciprocal?2:1);
  }finally{
   releaseBarrier();
   if(pending)await pending;
   // Both service transactions release their clients through DatabaseService.transaction.
   if(!pending)for(const client of clients)client.release();
   await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();
  }
 });
}
