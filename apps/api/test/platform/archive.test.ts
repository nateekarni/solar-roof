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
 const school=randomUUID(),site=randomUUID(),gateway=randomUUID(),device=randomUUID();
 await pool.query("INSERT INTO schools(id,name,code,region) VALUES($1::uuid,'D1 school',$1::text,'fixture')",[school]);
 await pool.query("INSERT INTO sites(id,school_id,name,capacity_mwp) VALUES($1,$2,'D1 archived site',1)",[site,school]);
 await pool.query("INSERT INTO gateways(id,site_id,name,protocol,endpoint) VALUES($1::uuid,$2,$1::text,'mqtt','energy/'||$1::text||'/#')",[gateway,site]);
 await pool.query("INSERT INTO devices(id,gateway_id,site_id,name,device_type,model,serial_number) VALUES($1::uuid,$2,$3,'D1 meter','meter','fixture',$1::text)",[device,gateway,site]);
 return {school,site,device};
}
async function actor(pool:Pool,school:string){
 const id=randomUUID(),email=`d1-${id}@example.test`,password='D1-fixture-password-123!';
 const auth=new AuthService('readiness-test-access-secret-000000000000','readiness-test-refresh-secret-000000000000');
 await pool.query("INSERT INTO users(id,email,display_name,role,status,school_id,password_hash) VALUES($1,$2,'D1 actor','school_user','active',$3,$4)",[id,email,school,auth.hashPassword(password)]);
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
  const site=randomUUID(),school=randomUUID(),gateway=randomUUID(),device=randomUUID();
  try{
    await pool.query("INSERT INTO schools(id,name,code,region) VALUES($1::uuid,'Archive school',$1::text,'fixture')",[school]);
    await pool.query("INSERT INTO sites(id,school_id,name,capacity_mwp) VALUES($1,$2,'Archive site',1)",[site,school]);
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

test('history HTTP is scoped and idempotent, shares export quota, and downloads verified JSONL with preserved numeric evidence',{timeout:90000},async()=>{
 compose('stop','worker');const pool=new Pool({connectionString:process.env.READINESS_DATABASE_URL!,max:4}),s3=fixtureStorage();
 try{
  const first=await siteFixture(pool),second=await siteFixture(pool),user=await actor(pool,first.school),other=await actor(pool,second.school);
  await insertReading(pool,first.site,first.device);
  const mapping=randomUUID();await pool.query("INSERT INTO register_mapping_versions(id,device_id,semantic_field,register_address,data_type,byte_order,scale,unit,effective_from) VALUES($1,$2,'voltage','0','uint16','big_endian',1.12345678,'V','2024-01-01')",[mapping,first.device]);
  await pool.query('UPDATE telemetry_raw SET mapping_version_id=$2,mapping_version_ids=ARRAY[$2::uuid] WHERE site_id=$1',[first.site,mapping]);
  const objects=new ArchiveObjectStore(s3,'solar-readiness');
  await new ArchiveTelemetryJob(pool,objects).archive(first.site,'2025-01-01','2025-01-02');
  const key=randomUUID(),body={siteId:first.site,from:'2025-01-01',to:'2025-01-02'};
  const post=(value=body,identity=key,headers=user.headers)=>fetch(process.env.READINESS_API_URL+'/v1/history/restore',{method:'POST',headers:{...headers,'Idempotency-Key':identity},body:JSON.stringify(value)});
  assert.equal((await post({...body,to:'2025-02-03'},randomUUID())).status,400);
  assert.equal((await post(body,randomUUID(),other.headers)).status,403);
  const response=await post();assert.equal(response.status,202,await response.clone().text());const queued=await response.json();
  const repeated=await post();assert.equal(repeated.status,202);assert.equal((await repeated.json()).jobId,queued.jobId);
  assert.equal((await post({...body,to:'2025-01-03'})).status,409);assert.equal((await post(body,randomUUID())).status,429);
  const report=await fetch(process.env.READINESS_API_URL+'/v1/reports',{method:'POST',headers:{...user.headers,'Idempotency-Key':randomUUID()},body:JSON.stringify({type:'energy',format:'csv',dateFrom:'2025-01-01',dateTo:'2025-01-02'})});assert.equal(report.status,429,'Restore consumes the same per-user export quota');
  const status=()=>fetch(process.env.READINESS_API_URL+`/v1/jobs/${queued.jobId}`,{headers:user.headers});
  const record=await (await status()).json();assert.deepEqual(record.history,{...body,format:'jsonl.gz'});assert.equal(record.rowCount,null);
  assert.equal((await fetch(process.env.READINESS_API_URL+`/v1/jobs/${queued.jobId}`,{headers:other.headers})).status,403);
  const worker=new HistoryJobsWorker(pool,s3,'solar-readiness'),job=await worker.store.claim('restore','D1-http');assert.equal(job.id,queued.jobId);await worker.execute(job,'D1-http');
  const stored=(await pool.query('SELECT * FROM platform_jobs WHERE id=$1',[queued.jobId])).rows[0];assert.equal(stored.status,'ready',stored.error_code);assert.equal(Number(stored.row_count),1);
  const downloaded=await fetch(process.env.READINESS_API_URL+`/v1/jobs/${queued.jobId}/download`,{headers:user.headers});assert.equal(downloaded.status,200);assert.match(downloaded.headers.get('content-type')! ,/application\/gzip/);assert.match(downloaded.headers.get('content-disposition')!,/history-.*\.jsonl\.gz/);
  const bytes=Buffer.from(await downloaded.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),stored.manifest.checksum);
  const content=gunzipSync(bytes).toString();assert.match(content,/100\.12345679/);assert.match(content,/12345678901234567890\.123456789/);assert.match(content,/01:00:00\.123456/);assert.ok(content.includes(mapping));assert.match(content,/1\.12345678/);
  assert.equal(Number((await pool.query('SELECT count(*) FROM telemetry_raw WHERE site_id=$1',[first.site])).rows[0].count),1);
  const reassigned=randomUUID();await pool.query("INSERT INTO schools(id,name,code,region) VALUES($1::uuid,'D1 reassigned',$1::text,'fixture')",[reassigned]);
  await pool.query('UPDATE sites SET school_id=$2 WHERE id=$1',[first.site,reassigned]);assert.equal((await status()).status,403,'Current site ownership is checked on status and download');
  assert.equal((await fetch(process.env.READINESS_API_URL+`/v1/jobs/${queued.jobId}/download`,{headers:user.headers})).status,403);
 }finally{s3.destroy();await pool.end();}
});

test('actual child crashes after upload/publication reclaim the same verified generation; restore crash and revocation stay fenced',{timeout:180000},async()=>{
 compose('stop','worker');const pool=new Pool({connectionString:process.env.READINESS_DATABASE_URL!,max:4}),s3=fixtureStorage();
 try{
  const site=await siteFixture(pool),user=await actor(pool,site.school);await insertReading(pool,site.site,site.device);
  const worker=new HistoryJobsWorker(pool,s3,'solar-readiness');
  const make=async(kind:'archive'|'restore')=>{const id=randomUUID();await pool.query('INSERT INTO platform_jobs(id,kind,payload,scope,created_by,payload_hash) VALUES($1::uuid,$2,$3,$4,$5,$1::text)',[id,kind,{siteId:site.site,from:'2025-01-01',to:'2025-01-02',format:'jsonl.gz'},[site.school],kind==='archive'?null:user.id]);return id;};
  const child=async(mode:string,kind:string)=>{const process=fork(new URL('./archive-child.mjs',import.meta.url),[],{execArgv:['--import','tsx'],env:{...globalThis.process.env,ARCHIVE_CHILD_MODE:mode,ARCHIVE_CHILD_KIND:kind},stdio:['ignore','pipe','pipe','ipc']});let errors='';process.stderr?.on('data',chunk=>{errors+=chunk;});const [code]=await once(process,'exit');assert.equal(code,mode==='crash-upload'?73:74,errors);};
  const first=await make('archive');await child('crash-upload','archive');
  const crashed=(await pool.query('SELECT * FROM platform_jobs WHERE id=$1',[first])).rows[0];assert.equal(crashed.status,'running');assert.ok(crashed.manifest.checksum);assert.equal(Number((await pool.query('SELECT count(*) FROM telemetry_archives WHERE id=$1',[crashed.manifest.id])).rows[0].count),0);
  await pool.query("UPDATE platform_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[first]);const recovered=await worker.store.claim('archive','D1-reclaim');await worker.execute(recovered,'D1-reclaim');
  const ready=(await pool.query('SELECT * FROM platform_jobs WHERE id=$1',[first])).rows[0];assert.equal(ready.status,'ready',ready.error_code);assert.equal(ready.object_key,crashed.manifest.key);
  const second=await make('archive');await child('crash-publish','archive');const published=(await pool.query('SELECT * FROM platform_jobs WHERE id=$1',[second])).rows[0];assert.equal(Number((await pool.query('SELECT count(*) FROM telemetry_archives WHERE id=$1',[published.manifest.id])).rows[0].count),1);
  await pool.query("UPDATE platform_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[second]);await worker.execute(await worker.store.claim('archive','D1-reclaim'),'D1-reclaim');assert.equal(Number((await pool.query('SELECT count(*) FROM telemetry_archives WHERE site_id=$1',[site.site])).rows[0].count),2,'Reclaim must not append another generation for the same publication');
  const restore=await make('restore');await child('crash-upload','restore');const restoreCrash=(await pool.query('SELECT * FROM platform_jobs WHERE id=$1',[restore])).rows[0];
  await pool.query("UPDATE platform_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[restore]);await worker.execute(await worker.store.claim('restore','D1-reclaim'),'D1-reclaim');const restored=(await pool.query('SELECT * FROM platform_jobs WHERE id=$1',[restore])).rows[0];assert.equal(restored.status,'ready',restored.error_code);assert.equal(restored.object_key,restoreCrash.manifest.key);assert.equal(Number(restored.row_count),1);
  assert.equal(Number((await pool.query('SELECT count(*) FROM notification_deliveries WHERE job_id=$1',[restore])).rows[0].count),1);
  const revoked=await make('restore'),claim=await worker.store.claim('restore','D1-revoked');assert.equal(claim.id,revoked);await pool.query("UPDATE users SET status='inactive' WHERE id=$1",[user.id]);await worker.execute(claim,'D1-revoked');assert.equal((await pool.query('SELECT error_code FROM platform_jobs WHERE id=$1',[revoked])).rows[0].error_code,'permission_revoked');
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

test('slow real storage renews the lease, caps all history workers and rechecks revoked permission before publication',{timeout:90000},async()=>{
 compose('stop','worker');const pool=new Pool({connectionString:process.env.READINESS_DATABASE_URL!,max:4}),s3=fixtureStorage();let slow:ReturnType<typeof fork>|undefined;
 try{
  const site=await siteFixture(pool),user=await actor(pool,site.school);await insertReading(pool,site.site,site.device);
  await new ArchiveTelemetryJob(pool,new ArchiveObjectStore(s3,'solar-readiness')).archive(site.site,'2025-01-01','2025-01-02');
  const id=randomUUID();await pool.query("INSERT INTO platform_jobs(id,kind,payload,scope,created_by,payload_hash) VALUES($1,'restore',$2,$3,$4,'D1-slow')",[id,{siteId:site.site,from:'2025-01-01',to:'2025-01-02',format:'jsonl.gz'},[site.school],user.id]);
  slow=fork(new URL('./archive-child.mjs',import.meta.url),[],{execArgv:['--import','tsx'],env:{...process.env,ARCHIVE_CHILD_MODE:'slow',ARCHIVE_CHILD_KIND:'restore'},stdio:['ignore','pipe','pipe','ipc']});
  let errors='';slow.stderr?.on('data',chunk=>{errors+=chunk;});const [message]=await once(slow,'message');assert.equal(message.event,'before-complete');
  const lease=(await pool.query('SELECT lease_until FROM platform_jobs WHERE id=$1',[id])).rows[0].lease_until;
  await new Promise(resolve=>setTimeout(resolve,16000));assert.ok((await pool.query('SELECT lease_until FROM platform_jobs WHERE id=$1',[id])).rows[0].lease_until>lease);
  const competing=randomUUID();await pool.query("INSERT INTO platform_jobs(id,kind,payload,scope,payload_hash) VALUES($1,'archive',$2,$3,'D1-competing')",[competing,{siteId:site.site,from:'2025-01-01',to:'2025-01-02'},[site.school]]);
  assert.equal(await new HistoryJobsWorker(pool,s3,'solar-readiness').store.claim('archive','D1-competitor'),null,'One history execution across kinds/workers');
  await pool.query("UPDATE platform_jobs SET status='cancelled' WHERE id=$1",[competing]);await pool.query("UPDATE users SET status='inactive' WHERE id=$1",[user.id]);
  const done=once(slow,'exit');slow.send('release');assert.equal((await done)[0],0,errors);
  const failed=(await pool.query('SELECT * FROM platform_jobs WHERE id=$1',[id])).rows[0];assert.equal(failed.status,'failed');assert.equal(failed.error_code,'permission_revoked');assert.equal(failed.object_key,null);
 }finally{if(slow&&slow.exitCode===null)slow.kill('SIGKILL');s3.destroy();await pool.end();}
});

test('actual worker PID1 SIGKILL retains the restore lease and restart completes the same durable request',{timeout:90000},async()=>{
 compose('stop','worker');const pool=new Pool({connectionString:process.env.READINESS_DATABASE_URL!,max:4}),s3=fixtureStorage();let paused=false;
 try{
  const site=await siteFixture(pool),user=await actor(pool,site.school);await insertReading(pool,site.site,site.device);
  await new ArchiveTelemetryJob(pool,new ArchiveObjectStore(s3,'solar-readiness')).archive(site.site,'2025-01-01','2025-01-02');
  controlledWorker();compose('stop','worker');
  const id=randomUUID();await pool.query("INSERT INTO platform_jobs(id,kind,payload,scope,created_by,payload_hash) VALUES($1,'restore',$2,$3,$4,'D1-restart')",[id,{siteId:site.site,from:'2025-01-01',to:'2025-01-02',format:'jsonl.gz'},[site.school],user.id]);
  compose('pause','storage');paused=true;execFileSync('docker',['start',compose('ps','--all','-q','worker').toString().trim()],{stdio:'pipe'});
  let row:any;for(let n=0;n<50;n++){row=(await pool.query('SELECT * FROM platform_jobs WHERE id=$1',[id])).rows[0];if(row.status==='running')break;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.equal(row.status,'running');assert.ok(row.worker_id);assert.match(compose('exec','-T','worker','node','-e',"process.stdout.write(require('fs').readFileSync('/proc/1/cmdline','utf8'))").toString(),/^node\u0000/);
  compose('kill','-s','SIGKILL','worker');const killed=(await pool.query('SELECT * FROM platform_jobs WHERE id=$1',[id])).rows[0];assert.equal(killed.status,'running');assert.equal(killed.worker_id,row.worker_id);
  compose('unpause','storage');paused=false;await pool.query("UPDATE platform_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[id]);
  execFileSync('docker',['start',compose('ps','--all','-q','worker').toString().trim()],{stdio:'pipe'});for(let n=0;n<100;n++){row=(await pool.query('SELECT * FROM platform_jobs WHERE id=$1',[id])).rows[0];if(['ready','failed'].includes(row.status))break;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.equal(row.status,'ready',row.error_code);assert.equal(Number(row.row_count),1);assert.ok(row.manifest.checksum);assert.equal(Number((await pool.query('SELECT count(*) FROM telemetry_raw WHERE site_id=$1',[site.site])).rows[0].count),1);
  assert.equal(Number((await pool.query('SELECT count(*) FROM notification_deliveries WHERE job_id=$1',[id])).rows[0].count),1);
 }finally{if(paused)compose('unpause','storage');compose('stop','worker');s3.destroy();await pool.end();}
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
