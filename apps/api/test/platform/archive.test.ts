import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {S3Client,GetObjectCommand,PutObjectCommand} from '@aws-sdk/client-s3';
import {gunzipSync} from 'node:zlib';
import {ArchiveObjectStore} from '../../../worker/src/jobs/archive-object-store.js';
import {ArchiveTelemetryJob} from '../../../worker/src/jobs/archive-telemetry.job.js';
import {RestoreHistoryJob} from '../../../worker/src/jobs/restore-history.job.js';
import {execFileSync,fork} from 'node:child_process';
import {once} from 'node:events';
import {AuthService} from '../../src/modules/identity/auth.service.js';
import {ArchiveRetentionGuard} from '../../../worker/src/jobs/archive-retention.guard.js';
import {HistoryJobsWorker} from '../../../worker/src/jobs/history-worker.js';
import {createHash} from 'node:crypto';
import {ArchiveProducer} from '../../../worker/src/jobs/archive-producer.js';

const compose=(...args:string[])=>{assert.match(process.env.COMPOSE_PROJECT_NAME??'',/^solar-ci-[a-f0-9-]{36}$/);return execFileSync('docker',['compose','-f','infra/ci/compose.yml',...args],{cwd:new URL('../../../../',import.meta.url),stdio:'pipe'});};
const controlledWorker=()=>{
 assert.match(process.env.COMPOSE_PROJECT_NAME??'',/^solar-ci-[a-f0-9-]{36}$/);
 const files:string[]=JSON.parse(process.env.PLATFORM_CI_COMPOSE_FILES??'["infra/ci/compose.yml"]');assert.ok(files.length&&files.length<=8);
 for(const file of files)assert.match(file,/^infra\/ci\/[a-zA-Z0-9._-]+\.yml$/);
 return execFileSync('docker',['compose',...files.flatMap(file=>['-f',file]),'-f','infra/ci/history-worker.yml','up','-d','--no-deps','--force-recreate','--wait','--wait-timeout','120','worker'],{cwd:new URL('../../../../',import.meta.url),stdio:'pipe',env:{...process.env,HISTORY_CI_WORKER_ENABLED:'true'}});
};
const fixtureStorage=()=>{const port=process.env.PLATFORM_CI_STORAGE_PORT??'19000';assert.ok(['19000','19001'].includes(port));return new S3Client({endpoint:`http://127.0.0.1:${port}`,region:'us-east-1',forcePathStyle:true,maxAttempts:1,credentials:{accessKeyId:'solar-ci',secretAccessKey:'ci-storage-only-password'}});};
async function siteFixture(pool:Pool){
 const customer=randomUUID(),site=randomUUID(),gateway=randomUUID(),device=randomUUID();
 await pool.query("INSERT INTO customers(id,name,code,region) VALUES($1::uuid,'D1 customer',$1::text,'fixture')",[customer]);
 await pool.query("INSERT INTO sites(id,customer_id,name,capacity_mwp) VALUES($1,$2,'D1 archived site',1)",[site,customer]);
 await pool.query("INSERT INTO gateways(id,site_id,name,protocol,endpoint) VALUES($1::uuid,$2,$1::text,'mqtt','energy/'||$1::text||'/#')",[gateway,site]);
 await pool.query("INSERT INTO devices(id,gateway_id,site_id,name,device_type,model,serial_number) VALUES($1::uuid,$2,$3,'D1 meter','meter','fixture',$1::text)",[device,gateway,site]);
 return {customer,site,device};
}
async function actor(pool:Pool,customer:string){
 const id=randomUUID(),email=`d1-${id}@example.test`,password='D1-fixture-password-123!';
 const auth=new AuthService('readiness-test-access-secret-000000000000','readiness-test-refresh-secret-000000000000');
 await pool.query("INSERT INTO users(id,email,display_name,role,status,customer_id,password_hash) VALUES($1,$2,'D1 actor','operator','active',$3,$4)",[id,email,customer,auth.hashPassword(password)]);
 const response=await fetch(process.env.READINESS_API_URL+'/v1/auth/login',{method:'POST',headers:{Origin:process.env.READINESS_WEB_URL!,'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(response.status,200);
 return {id,headers:{Origin:process.env.READINESS_WEB_URL!,'Content-Type':'application/json',Authorization:`Bearer ${(await response.json()).accessToken}`}};
}
async function insertReading(pool:Pool,site:string,device:string,precision='100.123456789123456789',sourceTime='2025-01-01T01:00:00.123456Z'){
 await pool.query("INSERT INTO telemetry_raw(id,device_id,site_id,source_time,received_time,raw_payload,normalized_value,unit,quality,ingestion_id,total_energy_kwh) VALUES(gen_random_uuid(),$1,$2,$4::timestamptz,now(),'{\"precision\":12345678901234567890.123456789}', $3::numeric,'kWh','complete',gen_random_uuid()::text,$3::numeric)",[device,site,precision,sourceTime]);
}

test('verified archive generations preserve late readings and reject corrupted stored bytes',{timeout:90000},async()=>{
  assert.equal(process.env.READINESS_DATABASE_URL,'postgresql://solar:ci-only-password@127.0.0.1:15432/solar_readiness');
  const storagePort=process.env.PLATFORM_CI_STORAGE_PORT??'19000';assert.ok(['19000','19001'].includes(storagePort));
  const pool=new Pool({connectionString:process.env.READINESS_DATABASE_URL,max:2});
  const client=new S3Client({endpoint:`http://127.0.0.1:${storagePort}`,region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:'solar-ci',secretAccessKey:'ci-storage-only-password'}});
  const storage=new ArchiveObjectStore(client,'solar-readiness');
  const site=randomUUID(),customer=randomUUID(),gateway=randomUUID(),device=randomUUID();
  try{
    await pool.query("INSERT INTO customers(id,name,code,region) VALUES($1::uuid,'Archive customer',$1::text,'fixture')",[customer]);
    await pool.query("INSERT INTO sites(id,customer_id,name,capacity_mwp) VALUES($1,$2,'Archive site',1)",[site,customer]);
    await pool.query("INSERT INTO gateways(id,site_id,name,protocol,endpoint) VALUES($1::uuid,$2,$1::text,'mqtt','energy/'||$1::text||'/#')",[gateway,site]);
    await pool.query("INSERT INTO devices(id,gateway_id,site_id,name,device_type,model,serial_number) VALUES($1::uuid,$2,$3,'Archive meter','meter','fixture',$1::text)",[device,gateway,site]);
    const insert=()=>pool.query("INSERT INTO telemetry_raw(id,device_id,site_id,source_time,received_time,raw_payload,normalized_value,unit,quality,ingestion_id,total_energy_kwh) VALUES(gen_random_uuid(),$1,$2,'2025-01-01T01:00:00Z',now(),'{\"evidence\":true}',100,'kWh','complete',gen_random_uuid()::text,100)",[device,site]);
    await insert();const archive=new ArchiveTelemetryJob(pool,storage);
    const first=await archive.archive(site,'2025-01-01','2025-01-02');
    assert.equal(first.rows,1);assert.equal(first.generation,1);assert.ok(first.verifiedAt);
    const object=await client.send(new GetObjectCommand({Bucket:'solar-readiness',Key:first.objectKey}));
    const records=gunzipSync(await object.Body!.transformToByteArray()).toString().trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(records.length,1);assert.equal(records[0].reading.site_id,site);assert.equal(records[0].reading.raw_payload.evidence,true);
    await insert();const second=await archive.archive(site,'2025-01-01','2025-01-02');
    assert.equal(second.generation,2);assert.equal(second.rows,2);assert.notEqual(first.objectKey,second.objectKey);
    const restored=await new RestoreHistoryJob(pool,storage,storage).restore(site,'2025-01-01','2025-01-02',randomUUID(),AbortSignal.timeout(10000));
    assert.equal(restored.rowCount,2,'Two generations restore each immutable source identity once');
    const restoredObject=await client.send(new GetObjectCommand({Bucket:'solar-readiness',Key:restored.key}));
    const restoredRows=gunzipSync(await restoredObject.Body!.transformToByteArray()).toString().trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(new Set(restoredRows.map(row=>row.reading.id)).size,2);
    await assert.rejects(new RestoreHistoryJob(pool,storage,storage).restore(site,'2024-12-31','2025-01-02',randomUUID(),AbortSignal.timeout(10000)),/archive_coverage_missing/);
    assert.equal(Number((await pool.query('SELECT count(*) FROM telemetry_raw WHERE site_id=$1',[site])).rows[0].count),2,'Archiving never deletes live readings');
    await assert.rejects(pool.query('UPDATE telemetry_archives SET row_count=0 WHERE id=$1',[first.id]),/append-only/);
    const stored=(await pool.query('SELECT * FROM telemetry_archives WHERE id=$1',[first.id])).rows[0];
    await client.send(new PutObjectCommand({Bucket:'solar-readiness',Key:first.objectKey,Body:Buffer.alloc(Number(stored.bytes)),Metadata:{execution:stored.execution}}));
    await assert.rejects(storage.verify({key:stored.object_key,execution:stored.execution,bytes:Number(stored.bytes),checksum:stored.sha256},AbortSignal.timeout(5000)),/archive_mismatch/);
  }finally{await pool.end();client.destroy();}
});

test('retired history HTTP rejects restore requests without creating work',async()=>{
 const pool=new Pool({connectionString:process.env.READINESS_DATABASE_URL!});
 try {
  const site=await siteFixture(pool),user=await actor(pool,site.customer);
  const before=(await pool.query('SELECT count(*) FROM platform_jobs WHERE created_by=$1',[user.id])).rows[0].count;
  for(const [method,path] of [['GET','/v1/history/options'],['POST','/v1/history/restore']]){
   const response=await fetch(process.env.READINESS_API_URL+path,{method,headers:user.headers,...(method==='POST'?{body:JSON.stringify({siteId:site.site,from:'2025-01-01',to:'2025-01-02'})}:{})});assert.equal(response.status,403);
  }
  assert.equal((await pool.query('SELECT count(*) FROM platform_jobs WHERE created_by=$1',[user.id])).rows[0].count,before);
 }finally{await pool.end();}
});

test('archive child crashes reclaim the same verified generation; retired restores fail closed',{timeout:180000},async()=>{
 compose('stop','worker');const pool=new Pool({connectionString:process.env.READINESS_DATABASE_URL!,max:4}),s3=fixtureStorage();
 try{
  const site=await siteFixture(pool),user=await actor(pool,site.customer);await insertReading(pool,site.site,site.device);
  const worker=new HistoryJobsWorker(pool,s3,'solar-readiness');
  const make=async(kind:'archive'|'restore')=>{const id=randomUUID();await pool.query('INSERT INTO platform_jobs(id,kind,payload,scope,created_by,payload_hash) VALUES($1::uuid,$2,$3,$4,$5,$1::text)',[id,kind,{siteId:site.site,from:'2025-01-01',to:'2025-01-02',format:'jsonl.gz'},[site.customer],kind==='archive'?null:user.id]);return id;};
  const child=async(mode:string,kind:string)=>{const process=fork(new URL('./archive-child.mjs',import.meta.url),[],{execArgv:['--import','tsx'],env:{...globalThis.process.env,ARCHIVE_CHILD_MODE:mode,ARCHIVE_CHILD_KIND:kind},stdio:['ignore','pipe','pipe','ipc']});let errors='';process.stderr?.on('data',chunk=>{errors+=chunk;});const [code]=await once(process,'exit');assert.equal(code,mode==='crash-upload'?73:74,errors);};
  const first=await make('archive');await child('crash-upload','archive');
  const crashed=(await pool.query('SELECT * FROM platform_jobs WHERE id=$1',[first])).rows[0];assert.equal(crashed.status,'running');assert.ok(crashed.manifest.checksum);assert.equal(Number((await pool.query('SELECT count(*) FROM telemetry_archives WHERE id=$1',[crashed.manifest.id])).rows[0].count),0);
  await pool.query("UPDATE platform_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[first]);const recovered=await worker.store.claim('archive','D1-reclaim');await worker.execute(recovered,'D1-reclaim');
  const ready=(await pool.query('SELECT * FROM platform_jobs WHERE id=$1',[first])).rows[0];assert.equal(ready.status,'ready',ready.error_code);assert.equal(ready.object_key,crashed.manifest.key);
  const second=await make('archive');await child('crash-publish','archive');const published=(await pool.query('SELECT * FROM platform_jobs WHERE id=$1',[second])).rows[0];assert.equal(Number((await pool.query('SELECT count(*) FROM telemetry_archives WHERE id=$1',[published.manifest.id])).rows[0].count),1);
  await pool.query("UPDATE platform_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[second]);await worker.execute(await worker.store.claim('archive','D1-reclaim'),'D1-reclaim');assert.equal(Number((await pool.query('SELECT count(*) FROM telemetry_archives WHERE site_id=$1',[site.site])).rows[0].count),2,'Reclaim must not append another generation for the same publication');
  const restore=await make('restore'),claim=await worker.store.claim('restore','D1-retired');assert.equal(claim.id,restore);await worker.execute(claim,'D1-retired');
  const denied=(await pool.query('SELECT * FROM platform_jobs WHERE id=$1',[restore])).rows[0];assert.equal(denied.status,'failed');assert.equal(denied.error_code,'permission_revoked');assert.equal(denied.object_key,null);

 }finally{s3.destroy();await pool.end();}
});

test('retention retains a shared tenant chunk for missing objects, corrupt bytes and unpreserved financial evidence',{timeout:90000},async()=>{
 const pool=new Pool({connectionString:process.env.READINESS_DATABASE_URL!,max:2}),s3=fixtureStorage();
 try{
  const a=await siteFixture(pool),b=await siteFixture(pool);await insertReading(pool,a.site,a.device);await insertReading(pool,b.site,b.device);
  const tables=(await pool.query('SELECT DISTINCT tableoid::regclass::text AS chunk FROM telemetry_raw WHERE site_id=ANY($1::uuid[])',[[a.site,b.site]])).rows;assert.equal(tables.length,1,'Both sites actually share a Timescale chunk');
  const objects=new ArchiveObjectStore(s3,'solar-readiness'),manifest=await new ArchiveTelemetryJob(pool,objects).archive(a.site,'2025-01-01','2025-01-02');
  const guard=new ArchiveRetentionGuard(pool,objects),proof=await guard.assess('2025-01-01','2025-01-02',AbortSignal.timeout(10000));
  assert.equal(proof.deletedRows,0);assert.equal(proof.eligible,false);assert.equal(proof.proof.allTenantsCovered,false);assert.equal(proof.proof.allRowsArchived,null);assert.equal(proof.proof.financialEvidencePreserved,false);
  const catalog=(await pool.query('SELECT * FROM telemetry_archives WHERE id=$1',[manifest.id])).rows[0];
  await s3.send(new PutObjectCommand({Bucket:'solar-readiness',Key:manifest.objectKey,Body:Buffer.alloc(Number(catalog.bytes)),Metadata:{execution:catalog.execution}}));
  const corrupt=await guard.assess('2025-01-01','2025-01-02',AbortSignal.timeout(10000));assert.equal(corrupt.deletedRows,0);assert.equal(corrupt.proof.checksumsVerified,false);
  await s3.send(new (await import('@aws-sdk/client-s3')).DeleteObjectCommand({Bucket:'solar-readiness',Key:manifest.objectKey}));
  assert.equal((await guard.assess('2025-01-01','2025-01-02',AbortSignal.timeout(10000))).deletedRows,0);
  assert.equal(Number((await pool.query('SELECT count(*) FROM telemetry_raw WHERE site_id=ANY($1::uuid[])',[[a.site,b.site]])).rows[0].count),2);
 }finally{s3.destroy();await pool.end();}
});

test('overlapping windows restore the newest snapshot rather than lexicographic window order',{timeout:90000},async()=>{
 const pool=new Pool({connectionString:process.env.READINESS_DATABASE_URL!,max:2}),s3=fixtureStorage();
 try{
  const site=await siteFixture(pool);await insertReading(pool,site.site,site.device,'100','2025-01-02T01:00:00Z');
  const objects=new ArchiveObjectStore(s3,'solar-readiness'),archiver=new ArchiveTelemetryJob(pool,objects);
  await archiver.archive(site.site,'2025-01-02','2025-01-03');await pool.query("UPDATE telemetry_raw SET quality='reset' WHERE site_id=$1",[site.site]);
  await archiver.archive(site.site,'2025-01-01','2025-01-03');
  const restored=await new RestoreHistoryJob(pool,objects,objects).restore(site.site,'2025-01-01','2025-01-03',randomUUID(),AbortSignal.timeout(10000));
  const object=await s3.send(new GetObjectCommand({Bucket:'solar-readiness',Key:restored.key}));const lines=gunzipSync(await object.Body!.transformToByteArray()).toString().trim().split('\n');
  assert.equal(lines.length,1);assert.equal(JSON.parse(lines[0]).reading.quality,'reset');
 }finally{s3.destroy();await pool.end();}
});

test('enabled producer automatically queues old site-days and appends a generation after late correction',{timeout:90000},async()=>{
 compose('stop','worker');const pool=new Pool({connectionString:process.env.READINESS_DATABASE_URL!,max:4}),s3=fixtureStorage(),before=process.env.TELEMETRY_ARCHIVE_ENABLED,schedulerBefore=process.env.TELEMETRY_ARCHIVE_SCHEDULER_ENABLED;
 try{
  const site=await siteFixture(pool);await insertReading(pool,site.site,site.device,'100','2025-01-01T20:00:00Z');
  process.env.TELEMETRY_ARCHIVE_ENABLED='true';process.env.TELEMETRY_ARCHIVE_SCHEDULER_ENABLED='true';const producer=new ArchiveProducer(pool),worker=new HistoryJobsWorker(pool,s3,'solar-readiness');
  // Existing fixtures are also old. Drain only this owned stack, with a hard iteration budget.
  let generations=0;
  for(let n=0;n<40&&generations<1;n++){await producer.enqueueOne();const job=await worker.store.claim('archive','D1-producer');if(job)await worker.execute(job,'D1-producer');generations=Number((await pool.query('SELECT count(*) FROM telemetry_archives WHERE site_id=$1',[site.site])).rows[0].count);}
  assert.equal(generations,1);assert.equal(Number((await pool.query("SELECT count(*) FROM platform_jobs WHERE kind='archive' AND payload->>'siteId'=$1",[site.site])).rows[0].count),1);
  const catalog=(await pool.query('SELECT * FROM telemetry_archives WHERE site_id=$1',[site.site])).rows[0];assert.equal(Number(catalog.row_count),1,'After-17UTC reading is included in the next Bangkok day');assert.equal(catalog.range_from.toISOString(),'2025-01-01T17:00:00.000Z');
  await pool.query("UPDATE telemetry_raw SET quality='reset' WHERE site_id=$1",[site.site]);
  for(let n=0;n<40&&generations<2;n++){await producer.enqueueOne();const job=await worker.store.claim('archive','D1-producer');if(job)await worker.execute(job,'D1-producer');generations=Number((await pool.query('SELECT count(*) FROM telemetry_archives WHERE site_id=$1',[site.site])).rows[0].count);}
  assert.equal(generations,2);assert.equal(Number((await pool.query('SELECT count(*) FROM telemetry_raw WHERE site_id=$1',[site.site])).rows[0].count),1);
 }finally{if(before===undefined)delete process.env.TELEMETRY_ARCHIVE_ENABLED;else process.env.TELEMETRY_ARCHIVE_ENABLED=before;if(schedulerBefore===undefined)delete process.env.TELEMETRY_ARCHIVE_SCHEDULER_ENABLED;else process.env.TELEMETRY_ARCHIVE_SCHEDULER_ENABLED=schedulerBefore;s3.destroy();await pool.end();}
});
