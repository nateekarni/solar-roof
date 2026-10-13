import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {assertIsolatedDatabase} from './fixtures.js';
import {AuthService} from '../../src/modules/identity/auth.service.js';
import {ReportExportJob} from '../../../worker/src/jobs/report-export.job.js';
const compose=(...args:string[])=>{assert.match(process.env.COMPOSE_PROJECT_NAME??'',/^solar-ci-[a-f0-9-]{36}$/);return execFileSync('docker',['compose','-f','infra/ci/compose.yml',...args],{cwd:new URL('../../../../',import.meta.url),stdio:'pipe'});};

test('retired report and job endpoints deny every role without queuing work',async()=>{
 const db=new Pool({connectionString:assertIsolatedDatabase(process.env.READINESS_DATABASE_URL!)});
 const auth=new AuthService('readiness-test-access-secret-000000000000','readiness-test-refresh-secret-000000000000');
 try {
  for(const role of ['owner','admin','operator','accountant','customer_user']){
   const id=randomUUID(),email=id+'@example.test',password='Retired-fixture-password-123!';
   await db.query("INSERT INTO users(id,email,display_name,role,status,password_hash) VALUES($1,$2,'Retired fixture',$3,'active',$4)",[id,email,role,auth.hashPassword(password)]);
   const base=process.env.READINESS_API_URL!,origin=process.env.READINESS_WEB_URL!;
   const login=await fetch(base+'/v1/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(login.status,200);
   const headers={Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+(await login.json()).accessToken};
   for(const [method,path] of [['POST','/v1/reports'],['GET','/v1/reports/'+id+'/download'],['GET','/v1/jobs'],['GET','/v1/jobs/'+id],['GET','/v1/jobs/'+id+'/download'],['POST','/v1/jobs/'+id+'/retry']]){
    const response=await fetch(base+path,{method,headers,...(method==='POST'?{body:JSON.stringify({type:'energy',format:'csv',dateFrom:'2026-01-01',dateTo:'2026-01-02'})}:{})});assert.equal(response.status,403,role+' '+method+' '+path);
   }
   assert.equal(Number((await db.query('SELECT count(*) FROM platform_jobs WHERE created_by=$1',[id])).rows[0].count),0);
  }
 } finally {await db.end();}
});

test('persisted legacy export requests fail closed without publishing an artifact',async()=>{
 compose('stop','worker');
 const db=new Pool({connectionString:assertIsolatedDatabase(process.env.READINESS_DATABASE_URL!)});
 const worker=new ReportExportJob(db);
 try {
  await db.query("UPDATE platform_jobs SET status='cancelled' WHERE status IN ('queued','running')");
  const id=randomUUID();await db.query("INSERT INTO platform_jobs(id,kind,payload,payload_hash) VALUES($1,'report',$2,'retired-test')",[id,{type:'energy',format:'csv',dateFrom:'2026-01-01',dateTo:'2026-01-02'}]);
  await worker.runOnce();
  const row=(await db.query('SELECT * FROM platform_jobs WHERE id=$1',[id])).rows[0];
  assert.equal(row.status,'failed');assert.equal(row.error_code,'permission_revoked');assert.equal(row.object_key,null);
  assert.equal(Number((await db.query('SELECT count(*) FROM notification_deliveries WHERE job_id=$1',[id])).rows[0].count),0);
 } finally {worker.storage.destroy();await db.end();}
});

test('leases cap reports across workers, reject stale owners, and support archive jobs',async()=>{
 compose('stop','worker');
 const db=new Pool({connectionString:assertIsolatedDatabase(process.env.READINESS_DATABASE_URL!)});
 try {
  const {JobStore}=await import('../../../worker/src/jobs/job-store.js');const store=new JobStore(db);
  await db.query("UPDATE platform_jobs SET status='cancelled' WHERE status IN ('queued','running')");
  const ids=[randomUUID(),randomUUID(),randomUUID()];for(const id of ids)await db.query("INSERT INTO platform_jobs(id,kind,payload,payload_hash) VALUES($1,'report','{}','fixture')",[id]);
  const claims=await Promise.all(['one','two','three'].map(owner=>store.claim('report',owner,1)));
  assert.equal(claims.filter(Boolean).length,2);assert.equal(new Set(claims.filter(Boolean).map((j:any)=>j.id)).size,2);
  const first=claims.find(Boolean)!;await db.query("UPDATE platform_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[first.id]);
  const recovered=await store.claim('report','recovered',60);assert.equal(recovered?.id,first.id);
  assert.equal(await store.heartbeat(first.id,first.worker_id),false);assert.equal(await store.complete(first.id,first.worker_id,'invalid'),false);
  assert.equal(await store.fail(first.id,'recovered','storage_unavailable'),true);
  const archive=randomUUID();await db.query("INSERT INTO platform_jobs(id,kind,payload,payload_hash) VALUES($1,'archive','{}','fixture')",[archive]);
  assert.equal((await store.claim('archive','archiver'))?.id,archive);
  assert.equal(await store.complete(archive,'archiver','archives/fixture'),true);
 }finally{await db.end();}
});
