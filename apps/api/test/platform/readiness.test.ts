import assert from 'node:assert/strict';
import test from 'node:test';
import {configurationFingerprint,deploymentFingerprint,evaluateReleaseEvidence,monitoringConditions} from '../../src/common/observability/platform-readiness.service.js';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {Pool} from 'pg';
import {PlatformAlertStore} from '../../src/common/observability/platform-alert-store.js';
import {randomUUID} from 'node:crypto';
import {AuthService} from '../../src/modules/identity/auth.service.js';
import {writeFile,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {PlatformMonitoringService} from '../../src/common/observability/platform-monitoring.service.js';
import type {DatabaseService} from '../../src/database/database.service.js';

const now=Date.parse('2026-10-01T12:00:00Z');
const images=Object.fromEntries(['api','web','worker','postgres','mqtt','certbot'].map(name=>[name,'sha256:'+'b'.repeat(64)]));
const expected={revision:'a'.repeat(40),configurationFingerprint:'c'.repeat(64),images};
function evidence(){return {version:1,...expected,profile:'target',verifiedAt:'2026-10-01T11:00:00Z',expiresAt:'2026-10-02T11:00:00Z',checks:{security:true,ingestion:true,proxy:true,gatewayReplay:true,recovery:true,documents:true,configuration:true,roles:true,rawIntegrity:true,archive:true,archiveCoverage:true,summaryCoverage:true,financialEvidence:true,retentionApproval:true,capacity:true,financialApproval:true},measurements:{rtoSeconds:100,rpoSeconds:20,restoreSeconds:10},restoreEnvelope:{maxSites:1,maxDays:31,maxRows:1000000,verifiedRows:1000000}};}

test('release evidence is bound to exact images/config/revision and expires',()=>{
  assert.equal(evaluateReleaseEvidence(evidence(),expected,now).monitoringReady,true);
  for(const bad of [null,{}, {...evidence(),revision:'d'.repeat(40)}, {...evidence(),configurationFingerprint:'e'.repeat(64)}, {...evidence(),images:{}}, {...evidence(),expiresAt:'2026-10-01T10:00:00Z'}, {...evidence(),verifiedAt:'2026-10-01T13:00:00Z'}, {...evidence(),expiresAt:'2027-01-01T00:00:00Z'}]){
    const result=evaluateReleaseEvidence(bad,expected,now);assert.equal(result.monitoringReady,false);assert.equal(result.recoveryVerified,false);assert.equal(result.retentionReady,false);
  }
});
test('fixture restore and missing document/config evidence never claim target recovery; financial flags cannot authorize finance',()=>{
  assert.equal(evaluateReleaseEvidence(evidence(),expected,now).recoveryVerified,true);
  for(const key of ['documents','configuration','roles','rawIntegrity'])assert.equal(evaluateReleaseEvidence({...evidence(),checks:{...evidence().checks,[key]:false}},expected,now).recoveryVerified,false);
  assert.equal(evaluateReleaseEvidence({...evidence(),profile:'fixture'},expected,now).recoveryVerified,false);
  assert.equal(evaluateReleaseEvidence({...evidence(),measurements:{rtoSeconds:15000,rpoSeconds:901,restoreSeconds:3601}},expected,now).recoveryVerified,false);
  assert.equal(evaluateReleaseEvidence(evidence(),expected,now).financialReady,false);
  assert.equal(evaluateReleaseEvidence(evidence(),expected,now).retentionReady,false,'Declared checks cannot bypass missing raw identity preservation proof');
  assert.equal(evaluateReleaseEvidence({...evidence(),restoreEnvelope:{maxSites:1,maxDays:31,maxRows:1000000,verifiedRows:100}},expected,now).retentionReady,false);
});
test('monitoring distinguishes idle WAL from backlog and reports unknown/stale evidence',()=>{
  const clean={observedAt:new Date(now).toISOString(),schedulerHeartbeatAt:new Date(now).toISOString(),lastSuccessfulBackupAt:now/1000-100,lastArchivedAt:now/1000-10000,failedArchives:0,lastFailedAt:null,pendingWalCount:0,oldestPendingWalAt:null,archiveError:null};
  assert.deepEqual(monitoringConditions(clean,{diskPercent:20,exhaustedJobs:0,summaryStale:false,ingestionBacklog:false},now),[]);
  const found=monitoringConditions({...clean,pendingWalCount:1,oldestPendingWalAt:now/1000-600,lastSuccessfulBackupAt:now/1000-26*3600,archiveError:'failed'}, {diskPercent:80,exhaustedJobs:1,summaryStale:true,ingestionBacklog:true},now);
  for(const key of ['wal_lag','backup_overdue','archive_failed','disk_high','jobs_exhausted','summary_stale','ingestion_backlog'])assert.ok(found.includes(key),key);
  assert.ok(monitoringConditions(null,{diskPercent:null,exhaustedJobs:0,summaryStale:false,ingestionBacklog:false},now).includes('backup_status_unknown'));
});

test('malformed timestamps and WAL counters fail closed; recovery configuration changes invalidate evidence',()=>{
  for(const verifiedAt of [null,1,'10/01/2026','2026-10-01T11:00:00'])assert.equal(evaluateReleaseEvidence({...evidence(),verifiedAt},expected,now).monitoringReady,false);
  const clean={observedAt:new Date(now).toISOString(),schedulerHeartbeatAt:new Date(now).toISOString(),lastSuccessfulBackupAt:now/1000};
  for(const pendingWalCount of [-1,0.5,'0',NaN])assert.ok(monitoringConditions({...clean,pendingWalCount},{diskPercent:20,exhaustedJobs:0,summaryStale:false,ingestionBacklog:false},now).includes('wal_status_unknown'));
  for(const key of ['PGBACKREST_REPO1_S3_BUCKET','BACKUP_ENABLED','HISTORY_RESTORE_MAX_DAYS','TELEMETRY_ARCHIVE_ENABLED','PLATFORM_WAL_LAG_SECONDS'])assert.notEqual(configurationFingerprint({}),configurationFingerprint({[key]:'changed'}),key);
});

test('release CLI accepts matching monitoring evidence and rejects finance, missing and stale evidence',async()=>{
  const path=join(tmpdir(),`solar-evidence-${randomUUID()}.json`);
  const statusPath=path+'.status';
  let workerHash='d'.repeat(64);
  const server=createServer((_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({version:1,configurationFingerprint:workerHash}));});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const env={...process.env,READINESS_DATABASE_URL:'postgresql://solar:ci-only-password@127.0.0.1:15432/solar_readiness',PLATFORM_BACKUP_STATUS_FILE:statusPath,PLATFORM_WORKER_IDENTITY_URL:`http://127.0.0.1:${(server.address() as {port:number}).port}/health/release-identity`,PLATFORM_RELEASE_REVISION:expected.revision,PLATFORM_IMAGE_DIGESTS_JSON:JSON.stringify(images)};
  const postgresHash='e'.repeat(64);
  const valid={...evidence(),configurationFingerprint:deploymentFingerprint(env,postgresHash,workerHash),verifiedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()};
  const run=async(gate:string)=>{try{return {status:0,...await promisify(execFile)(process.execPath,['--import','tsx','../../scripts/ci/platform-release-check.ts','--evidence',path,'--gate',gate],{encoding:'utf8',env})};}catch(error:any){return {status:error.code,stdout:error.stdout,stderr:error.stderr};}};
  try{
    await writeFile(statusPath,JSON.stringify({configurationFingerprintVersion:1,configurationFingerprint:postgresHash,observedAt:Date.now()/1000}));
    await writeFile(path,JSON.stringify(valid));
    const good=await run('monitoring');assert.equal(good.status,0,good.stderr);assert.equal(JSON.parse(good.stdout).monitoringReady,true);
    assert.equal((await run('financial')).status,1);
    workerHash='f'.repeat(64);assert.equal((await run('monitoring')).status,1,'Actual worker configuration change invalidates evidence');workerHash='d'.repeat(64);
    await writeFile(statusPath,JSON.stringify({configurationFingerprintVersion:1,configurationFingerprint:'f'.repeat(64),observedAt:Date.now()/1000}));assert.equal((await run('recovery')).status,1,'Actual backup configuration change invalidates evidence');
    await writeFile(statusPath,JSON.stringify({configurationFingerprintVersion:1,configurationFingerprint:postgresHash,observedAt:Date.now()/1000-181}));assert.equal((await run('monitoring')).status,1,'Stale runtime dependency identity is not verified');
    await writeFile(statusPath,JSON.stringify({configurationFingerprintVersion:1,configurationFingerprint:postgresHash,observedAt:Date.now()/1000}));
    await writeFile(path,JSON.stringify({...valid,expiresAt:'2020-01-01T00:00:00Z'}));assert.equal((await run('monitoring')).status,1);
    await unlink(path);assert.equal((await run('monitoring')).status,1);
  }finally{await unlink(path).catch(()=>{});await unlink(statusPath).catch(()=>{});server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('real alert store deduplicates failure episodes and sends only to the local fixture receiver',{skip:!process.env.READINESS_DATABASE_URL},async()=>{
  assert.equal(process.env.READINESS_DATABASE_URL,'postgresql://solar:ci-only-password@127.0.0.1:15432/solar_readiness');
  const db=new Pool({connectionString:process.env.READINESS_DATABASE_URL});
  const received:any[]=[];
  const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;received.push({key:req.headers['idempotency-key'],body:JSON.parse(body)});res.writeHead(204);res.end();});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const store=new PlatformAlertStore(db),url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
    await store.observe(['wal_lag']);await store.observe(['wal_lag']);
    const deliveries=await Promise.all([store.deliverOne(url),store.deliverOne(url)]);
    assert.equal(deliveries.filter(Boolean).length,1);
    assert.equal(received.length,1);assert.equal(received[0].body.condition,'wal_lag');assert.equal(received[0].key,received[0].body.eventId);
    await store.observe([]);await store.observe(['wal_lag']);await store.deliverOne(url);
    assert.equal(received.length,2);assert.notEqual(received[0].key,received[1].key);
    const statusPath=join(tmpdir(),`solar-backup-status-${randomUUID()}.json`);
    try{
      const seconds=Date.now()/1000;
      await writeFile(statusPath,JSON.stringify({observedAt:seconds,schedulerHeartbeatAt:seconds,lastSuccessfulBackupAt:seconds,pendingWalCount:1,oldestPendingWalAt:seconds-601,rawDiskUsedPercent:81}));
      const monitor=new PlatformMonitoringService({pool:db,query:db.query.bind(db)} as unknown as DatabaseService,{PLATFORM_BACKUP_STATUS_FILE:statusPath});
      await monitor.sample();await monitor.sample();
      const active=(await monitor.snapshot()).filter(row=>row.active).map(row=>row.condition).sort();
      assert.ok(active.includes('disk_high'));assert.ok(active.includes('wal_lag'));
      assert.ok(active.every(condition=>['disk_high','wal_lag','jobs_exhausted'].includes(condition)),'Earlier suites may leave intentionally exhausted fixture jobs');
      assert.equal(received.length,2,'Disabled receiver never sends externally');
    }finally{await unlink(statusPath).catch(()=>{});}
    await db.query('DELETE FROM platform_monitoring_alerts');
  }finally{await db.end();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('readiness and monitoring endpoints require staff authority and expose no evidence secrets',{skip:!process.env.READINESS_API_URL},async()=>{
  assert.equal(process.env.READINESS_API_URL,'http://127.0.0.1:13001');
  assert.equal(process.env.READINESS_DATABASE_URL,'postgresql://solar:ci-only-password@127.0.0.1:15432/solar_readiness');
  const db=new Pool({connectionString:process.env.READINESS_DATABASE_URL});
  const auth=new AuthService('readiness-test-access-secret-000000000000','readiness-test-refresh-secret-000000000000');
  const ids:string[]=[];
  try{
    for(const path of ['readiness','monitoring'])assert.equal((await fetch(`${process.env.READINESS_API_URL}/v1/platform/${path}`)).status,401);
    for(const role of ['owner','admin','operator','accountant','school_user']){
      const id=randomUUID();ids.push(id);
      const password='Readiness-fixture-password-123!';
      await db.query("INSERT INTO users(id,email,display_name,role,status,password_hash) VALUES($1,$2,'Readiness fixture',$3,'active',$4)",[id,`${id}@example.test`,role,auth.hashPassword(password)]);
      const login=await fetch(`${process.env.READINESS_API_URL}/v1/auth/login`,{method:'POST',headers:{Origin:'http://localhost:13000','Content-Type':'application/json'},body:JSON.stringify({email:`${id}@example.test`,password})});
      assert.equal(login.status,200);const tokens=await login.json();
      for(const path of ['readiness','monitoring']){
        const response=await fetch(`${process.env.READINESS_API_URL}/v1/platform/${path}`,{headers:{Authorization:`Bearer ${tokens.accessToken}`}});
        assert.equal(response.status,['owner','admin'].includes(role)?200:403,`${role}/${path}`);
        if(response.ok&&path==='readiness'){
          const body=await response.json();assert.equal(body.financialReady,false);assert.equal(body.recoveryVerified,false);
          assert.deepEqual(Object.keys(body).sort(),['blockers','financialReady','monitoringReady','recoveryVerified','retentionReady'].sort());
        }
      }
    }
  }finally{await db.query('DELETE FROM auth_sessions WHERE user_id=ANY($1::uuid[])',[ids]);await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]);await db.end();}
});

test('monitoring observation remains responsive while archive scheduling owns its lock',{skip:!process.env.READINESS_DATABASE_URL,timeout:5000},async()=>{
  assert.equal(process.env.READINESS_DATABASE_URL,'postgresql://solar:ci-only-password@127.0.0.1:15432/solar_readiness');
  const db=new Pool({connectionString:process.env.READINESS_DATABASE_URL,max:3,statement_timeout:900});
  const archive=await db.connect(),condition=`archive-lock-fixture-${randomUUID()}`;
  try{
    await archive.query('BEGIN');await archive.query('SELECT pg_advisory_xact_lock(73501936)');
    await db.query('SELECT 1'); // Warm a distinct monitoring connection before timing.
    const started=Date.now();
    await new PlatformAlertStore(db).observe([condition]);
    assert.ok(Date.now()-started<1000,'Monitoring must finish before the archive transaction releases its lock');
    assert.equal((await db.query('SELECT active FROM platform_monitoring_alerts WHERE condition_key=$1',[condition])).rows[0]?.active,true);
  }finally{
    await archive.query('ROLLBACK');archive.release();
    await db.query('DELETE FROM platform_monitoring_alerts WHERE condition_key=$1',[condition]);await db.end();
  }
});
