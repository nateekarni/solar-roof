import { execFileSync } from 'node:child_process';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { randomUUID,createHash } from 'node:crypto';
import { assertIsolatedDatabase } from './fixtures.js';
import { AuthService } from '../../src/modules/identity/auth.service.js';

const compose=(...args:string[])=>{assert.match(process.env.COMPOSE_PROJECT_NAME??'',/^solar-ci-[a-f0-9-]{36}$/);return execFileSync('docker',['compose','-f','infra/ci/compose.yml',...args],{cwd:new URL('../../../../',import.meta.url),stdio:'pipe'});};
test('report POST durably queues a normalized request and enforces idempotency and quota',async()=>{
 const db=new Pool({connectionString:assertIsolatedDatabase(process.env.READINESS_DATABASE_URL!)});
 compose('stop','worker');
 const id=randomUUID(),email=`q4-${id}@example.test`,password='Q4-fixture-password-123!';
 const auth=new AuthService('readiness-test-access-secret-000000000000','readiness-test-refresh-secret-000000000000');
 try {
  await db.query("INSERT INTO users(id,email,display_name,role,status,password_hash) VALUES($1,$2,'Q4 actor','owner','active',$3)",[id,email,auth.hashPassword(password)]);
  const base=process.env.READINESS_API_URL!,origin=process.env.READINESS_WEB_URL!;
  const login=await fetch(base+'/v1/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  assert.equal(login.status,200);const {accessToken}=await login.json();
  const headers={Origin:origin,'Content-Type':'application/json',Authorization:`Bearer ${accessToken}`,'Idempotency-Key':randomUUID()};
  const body={type:'energy',dateFrom:'2026-01-01',dateTo:'2026-01-31',format:'CSV'};
  const post=(value:any,key=headers['Idempotency-Key'])=>fetch(base+'/v1/reports',{method:'POST',headers:{...headers,'Idempotency-Key':key},body:JSON.stringify(value)});
  const response=await post(body);assert.equal(response.status,202,await response.text());
  const again=await post({...body,format:'csv'});assert.equal(again.status,202);const queued=await again.json();assert.equal(queued.status,'queued');assert.ok(queued.jobId);
  const stored=(await db.query('SELECT * FROM platform_jobs WHERE id=$1',[queued.jobId])).rows[0];assert.equal(stored.created_by,id);assert.equal(stored.snapshot_at,null);assert.equal(stored.row_count,null);
  assert.equal((await post({...body,dateTo:'2026-01-30'})).status,409);
  assert.equal((await post(body,randomUUID())).status,429);
  const get=await fetch(base+`/v1/jobs/${queued.jobId}`,{headers});assert.equal(get.status,200);assert.equal((await get.json()).status,'queued');
 } finally {await db.end();}
});

test('worker exports more than 100000 filtered rows and neutralizes CSV formulas',async()=>{
 compose('stop','worker');
 const db=new Pool({connectionString:assertIsolatedDatabase(process.env.READINESS_DATABASE_URL!)});
 const school=randomUUID(),site=randomUUID(),gateway=randomUUID(),device=randomUUID();
 try {
  await db.query("INSERT INTO schools(id,name,code,region) VALUES($1::uuid,'Q4 school',$1::text,'fixture')",[school]);
  await db.query("INSERT INTO sites(id,school_id,name,capacity_mwp) VALUES($1,$2,'=Q4 formula',0.1)",[site,school]);
  await db.query("INSERT INTO gateways(id,site_id,name,protocol,endpoint) VALUES($1::uuid,$2,$1::text,'mqtt','energy/'||$1::text||'/#')",[gateway,site]);
  await db.query("INSERT INTO devices(id,gateway_id,site_id,name,device_type,model,serial_number) VALUES($1::uuid,$2,$3,'meter','meter','fixture',$1::text)",[device,gateway,site]);
  const user=await actor(db,'school_user',school);
  const fixture=await db.connect();try{await fixture.query('BEGIN');await fixture.query('SET LOCAL session_replication_role=replica');
  await fixture.query(`INSERT INTO telemetry_raw(id,device_id,site_id,source_time,received_time,raw_payload,normalized_value,unit,quality,ingestion_id,total_energy_kwh,semantic_field) SELECT gen_random_uuid(),$1,$2,'2026-01-01T00:00:00Z'::timestamptz+n*interval '1 second',now(),'{}',n,'kWh','complete',gen_random_uuid()::text,n,'total_energy' FROM generate_series(1,100005) n`,[device,site]);
  await fixture.query('COMMIT');}catch(error){await fixture.query('ROLLBACK');throw error;}finally{fixture.release();}
  const response=await fetch(process.env.READINESS_API_URL+'/v1/reports',{method:'POST',headers:user.headers,body:JSON.stringify({type:'energy',format:'csv',dateFrom:'2026-01-01',dateTo:'2026-01-03'})});assert.equal(response.status,202);const {jobId:job}=await response.json();
  compose('start','worker');
  let row:any;for(let i=0;i<30;i++){row=(await db.query('SELECT * FROM platform_jobs WHERE id=$1',[job])).rows[0];if(['ready','failed'].includes(row.status))break;await new Promise(r=>setTimeout(r,500));}
  assert.equal(row.status,'ready',JSON.stringify({status:row.status,error:row.error_code}));assert.equal(Number(row.row_count),100005);assert.ok(row.snapshot_at);assert.ok(row.object_key);assert.ok(row.manifest.checksum);
  const s3=storage();try{const object=await s3.send(new GetObjectCommand({Bucket:'solar-readiness',Key:row.object_key}));const bytes=await object.Body!.transformToByteArray();const text=Buffer.from(bytes).toString('utf8');assert.match(text,/"'=Q4 formula"/);assert.equal(text.trimEnd().split('\r\n').length,100006);assert.equal(createHash('sha256').update(bytes).digest('hex'),row.manifest.checksum);}finally{s3.destroy();}

 }finally{await db.end();}
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



async function actor(db:Pool,role='owner',school:string|null=null){
 const id=randomUUID(),email=`${id}@example.test`,password='Q4-test-password-123!';
 const auth=new AuthService('readiness-test-access-secret-000000000000','readiness-test-refresh-secret-000000000000');
 await db.query("INSERT INTO users(id,email,display_name,role,status,school_id,password_hash) VALUES($1,$2,'Q4 actor',$3,'active',$4,$5)",[id,email,role,school,auth.hashPassword(password)]);
 const res=await fetch(process.env.READINESS_API_URL+'/v1/auth/login',{method:'POST',headers:{Origin:process.env.READINESS_WEB_URL!,'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(res.status,200);
 const token=(await res.json()).accessToken;
 return {id,headers:{Authorization:`Bearer ${token}`,Origin:process.env.READINESS_WEB_URL!,'Content-Type':'application/json'}};
}

test('legacy downloads fail closed after school membership or audit permission changes',async()=>{
 const db=new Pool({connectionString:assertIsolatedDatabase(process.env.READINESS_DATABASE_URL!)});
 try {
  const user=await actor(db),id=randomUUID(),school=randomUUID();
  await db.query("INSERT INTO schools(id,name,code,region) VALUES($1::uuid,'Q4 legacy',$1::text,'fixture')",[school]);
  await db.query("INSERT INTO generated_reports(id,created_by,title,report_type,date_from,date_to,format,status,content,content_type) VALUES($1,$2,'legacy','audit','2026-01-01','2026-01-02','csv','ready',$3,'text/csv')",[id,user.id,Buffer.from('legacy file')]);
  const download=()=>fetch(process.env.READINESS_API_URL+`/v1/reports/${id}/download`,{headers:user.headers});
  assert.equal((await download()).status,200);
  await db.query("UPDATE users SET role='operator' WHERE id=$1",[user.id]);assert.equal((await download()).status,403);
  await db.query("UPDATE generated_reports SET report_type='energy' WHERE id=$1",[id]);assert.equal((await download()).status,200);
  await db.query('UPDATE users SET school_id=$2 WHERE id=$1',[user.id,school]);const denied=await download();assert.equal(denied.status,403);assert.equal((await denied.json()).code,'legacy_scope_unknown');
 }finally{await db.end();}
});

import {S3Client,HeadObjectCommand,GetObjectCommand,ListMultipartUploadsCommand} from '@aws-sdk/client-s3';
import {fork} from 'node:child_process';
import {once} from 'node:events';
const storagePort=process.env.PLATFORM_CI_STORAGE_PORT??'19000';
assert.ok(['19000','19001'].includes(storagePort),'Only an approved loopback fixture storage port is allowed');
const storage=()=>new S3Client({endpoint:`http://127.0.0.1:${storagePort}`,region:'us-east-1',forcePathStyle:true,maxAttempts:1,credentials:{accessKeyId:'solar-ci',secretAccessKey:'ci-storage-only-password'}});

test('crash after real S3 upload reuses snapshot and artifact; stale generation cannot overwrite winner',async()=>{
 compose('stop','worker');
 const db=new Pool({connectionString:assertIsolatedDatabase(process.env.READINESS_DATABASE_URL!)}),s3=storage();
 const {ReportExportJob}=await import('../../../worker/src/jobs/report-export.job.js');
 try {
  await db.query("UPDATE platform_jobs SET status='cancelled' WHERE status IN ('queued','running')");
  const user=await actor(db),other=await actor(db);
  const make=async()=>{const id=randomUUID();await db.query("INSERT INTO platform_jobs(id,kind,payload,created_by,payload_hash) VALUES($1,'report',$2,$3,'fixture')",[id,{type:'audit',dateFrom:'2026-01-01',dateTo:'2026-01-02'},user.id]);return id;};
  const id=await make();
  const child=fork(new URL('./reports-child.mjs',import.meta.url),[],{execArgv:['--import','tsx'],env:{...process.env,REPORT_CHILD_MODE:'crash'},stdio:['ignore','pipe','pipe','ipc']});
  const [code]=await once(child,'exit');assert.equal(code,73);
  const crashed=(await db.query('SELECT * FROM platform_jobs WHERE id=$1',[id])).rows[0];assert.equal(crashed.status,'running');assert.ok(crashed.manifest.checksum);
  const head=await s3.send(new HeadObjectCommand({Bucket:'solar-readiness',Key:crashed.manifest.key}));
  await db.query("UPDATE platform_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[id]);
  await new ReportExportJob(db,s3,'solar-readiness').runOnce();
  const ready=(await db.query('SELECT * FROM platform_jobs WHERE id=$1',[id])).rows[0];assert.equal(ready.status,'ready');assert.equal(ready.object_key,crashed.manifest.key);assert.equal(ready.snapshot_at.toISOString(),crashed.snapshot_at.toISOString());assert.equal((await s3.send(new HeadObjectCommand({Bucket:'solar-readiness',Key:ready.object_key}))).ETag,head.ETag);
  assert.equal(Number((await db.query('SELECT count(*) FROM notification_deliveries WHERE job_id=$1',[id])).rows[0].count),1);assert.equal(Number((await db.query('SELECT count(*) FROM job_outbox WHERE job_id=$1',[id])).rows[0].count),1);
  const get=(path:string,headers=user.headers)=>fetch(process.env.READINESS_API_URL+path,{headers});
  assert.equal((await get(`/v1/jobs/${id}/download`)).status,200);assert.equal((await get(`/v1/jobs/${id}`,other.headers)).status,403);
  await db.query("UPDATE users SET role='operator' WHERE id=$1",[user.id]);assert.equal((await get(`/v1/jobs/${id}/download`)).status,403);await db.query("UPDATE users SET role='owner' WHERE id=$1",[user.id]);
  const race=await make();const slow=fork(new URL('./reports-child.mjs',import.meta.url),[],{execArgv:['--import','tsx'],env:{...process.env,REPORT_CHILD_MODE:'delay'},stdio:['ignore','pipe','pipe','ipc']});
  const [message]=await once(slow,'message');assert.equal(message.event,'before-complete');
  const initialLease=(await db.query('SELECT lease_until FROM platform_jobs WHERE id=$1',[race])).rows[0].lease_until;
  await new Promise(resolve=>setTimeout(resolve,16000));
  assert.ok((await db.query('SELECT lease_until FROM platform_jobs WHERE id=$1',[race])).rows[0].lease_until>initialLease,'real child heartbeat renews the lease after 15 seconds');
  await db.query("UPDATE platform_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[race]);
  const raceStorage=storage(),raceSend=raceStorage.send.bind(raceStorage);let released=false;
  (raceStorage as any).send=async(command:any,options:any)=>{if(command.constructor.name==='AbortMultipartUploadCommand'&&command.input.Key===message.key&&!released){released=true;const done=once(slow,'exit');slow.send('release');assert.equal((await done)[0],0);}return raceSend(command,options);};
  try{await new ReportExportJob(db,raceStorage,'solar-readiness').runOnce();}finally{raceStorage.destroy();}
  assert.ok(released);assert.ok((await s3.send(new HeadObjectCommand({Bucket:'solar-readiness',Key:message.key}))).ETag,'old process completed a real orphan after the new owner observed 404');
  const winner=(await db.query('SELECT * FROM platform_jobs WHERE id=$1',[race])).rows[0];assert.equal(winner.status,'ready');assert.notEqual(winner.object_key,message.key);
  const final=(await db.query('SELECT * FROM platform_jobs WHERE id=$1',[race])).rows[0];assert.equal(final.object_key,winner.object_key);assert.equal(final.manifest.checksum,winner.manifest.checksum);
 }finally{s3.destroy();await db.end();}
});


import {createServer} from 'node:http';
test('storage 503 is durable, retries stop after four attempts, cancellation aborts multipart and hides partial files',async()=>{
 compose('stop','worker');const db=new Pool({connectionString:assertIsolatedDatabase(process.env.READINESS_DATABASE_URL!)}),s3=storage();
 const {ReportExportJob}=await import('../../../worker/src/jobs/report-export.job.js');
 const server=createServer((_req,res)=>{res.writeHead(503);res.end('unavailable');});server.listen(0,'127.0.0.1');await once(server,'listening');
 const broken=new S3Client({endpoint:`http://127.0.0.1:${(server.address() as any).port}`,region:'us-east-1',forcePathStyle:true,maxAttempts:1,credentials:{accessKeyId:'solar-ci',secretAccessKey:'ci-storage-only-password'}});
 try {
  await db.query("UPDATE platform_jobs SET status='cancelled' WHERE status IN ('queued','running')");
  const user=await actor(db);const post=(path:string)=>fetch(process.env.READINESS_API_URL+path,{method:'POST',headers:user.headers,body:'{}'});
  const id=randomUUID();await db.query("INSERT INTO platform_jobs(id,kind,payload,created_by,payload_hash) VALUES($1,'report',$2,$3,'fixture')",[id,{type:'audit',dateFrom:'2026-01-01',dateTo:'2026-01-02'},user.id]);
  for(let attempt=1;attempt<=4;attempt++){
   await new ReportExportJob(db,broken,'solar-readiness').runOnce();const row=(await db.query('SELECT * FROM platform_jobs WHERE id=$1',[id])).rows[0];assert.equal(row.status,'failed');assert.equal(row.attempt,attempt);assert.equal(row.object_key,null);
   const retry=await post(`/v1/jobs/${id}/retry`);assert.equal(retry.status,attempt===4?409:201);
   if(attempt<4){const queued=(await db.query('SELECT extract(epoch FROM available_at-now()) wait FROM platform_jobs WHERE id=$1',[id])).rows[0];assert.ok(Number(queued.wait)>=[9,59,299][attempt-1]!);await db.query('UPDATE platform_jobs SET available_at=now() WHERE id=$1',[id]);}
  }
  const cancelled=randomUUID();await db.query("INSERT INTO platform_jobs(id,kind,payload,created_by,payload_hash) VALUES($1,'report',$2,$3,'fixture')",[cancelled,{type:'audit',dateFrom:'2026-01-01',dateTo:'2026-01-02'},user.id]);
  const send=s3.send.bind(s3);let cancelledAtPart=false;
  (s3 as any).send=async(command:any,options:any)=>{const result=await send(command,options);if(command.constructor.name==='UploadPartCommand'){cancelledAtPart=true;assert.equal((await post(`/v1/jobs/${cancelled}/cancel`)).status,201);}return result;};
  await new ReportExportJob(db,s3,'solar-readiness').runOnce();assert.ok(cancelledAtPart);
  const final=(await db.query('SELECT * FROM platform_jobs WHERE id=$1',[cancelled])).rows[0];assert.equal(final.status,'cancelled');assert.equal(final.object_key,null);
  const download=await fetch(process.env.READINESS_API_URL+`/v1/jobs/${cancelled}/download`,{headers:user.headers});assert.equal(download.status,409);
  assert.equal((await s3.send(new ListMultipartUploadsCommand({Bucket:'solar-readiness',Prefix:`reports/${cancelled}/`}))).Uploads?.length??0,0);
  const revoked=randomUUID();await db.query("INSERT INTO platform_jobs(id,kind,payload,created_by,payload_hash) VALUES($1,'report',$2,$3,'fixture')",[revoked,{type:'audit',dateFrom:'2026-01-01',dateTo:'2026-01-02'},user.id]);
  await db.query("UPDATE users SET role='operator' WHERE id=$1",[user.id]);await new ReportExportJob(db,s3,'solar-readiness').runOnce();
  assert.equal((await db.query('SELECT error_code FROM platform_jobs WHERE id=$1',[revoked])).rows[0].error_code,'permission_revoked');await db.query("UPDATE users SET role='owner' WHERE id=$1",[user.id]);
  const list=await fetch(process.env.READINESS_API_URL+'/v1/jobs?limit=1',{headers:user.headers});assert.equal(list.status,200);const first=await list.json();assert.equal(first.items.length,1);assert.ok(first.nextCursor);
  const second=await (await fetch(process.env.READINESS_API_URL+`/v1/jobs?limit=1&cursor=${first.nextCursor}`,{headers:user.headers})).json();assert.equal(second.items.length,1);assert.notEqual(second.items[0].id,first.items[0].id);
 }finally{s3.destroy();broken.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));await db.end();}
});


test('queue global quota and microsecond pagination do not leak or skip jobs',async()=>{
 compose('stop','worker');const db=new Pool({connectionString:assertIsolatedDatabase(process.env.READINESS_DATABASE_URL!)});
 try{
  await db.query("UPDATE platform_jobs SET status='cancelled' WHERE status IN ('queued','running')");
  const user=await actor(db),ids=[randomUUID(),randomUUID(),randomUUID()];
  for(let i=0;i<3;i++)await db.query("INSERT INTO platform_jobs(id,kind,status,payload,created_by,payload_hash,created_at) VALUES($1,'report','failed','{}',$2,'fixture','2026-01-01T00:00:00Z'::timestamptz+$3*interval '0.0001 second')",[ids[i],user.id,i+1]);
  const found:string[]=[];let cursor:string|null=null;do{const result=await fetch(process.env.READINESS_API_URL+'/v1/jobs?limit=1'+(cursor?`&cursor=${cursor}`:''),{headers:user.headers});assert.equal(result.status,200);const page=await result.json();found.push(...page.items.map((j:any)=>j.id));cursor=page.nextCursor;}while(cursor);
  assert.deepEqual(found,[...ids].reverse());
  const malformed=Buffer.from(JSON.stringify(['2026-01-01','-'.repeat(36)])).toString('base64url');assert.equal((await fetch(process.env.READINESS_API_URL+`/v1/jobs?cursor=${malformed}`,{headers:user.headers})).status,400);
  await db.query("INSERT INTO platform_jobs(id,kind,payload,payload_hash) SELECT gen_random_uuid(),'report','{}','quota-fixture' FROM generate_series(1,1000)");
  const full=await fetch(process.env.READINESS_API_URL+'/v1/reports',{method:'POST',headers:user.headers,body:JSON.stringify({type:'energy',dateFrom:'2026-01-01',dateTo:'2026-01-02'})});assert.equal(full.status,429);
  await db.query("DELETE FROM platform_jobs WHERE payload_hash='quota-fixture'");
 }finally{await db.end();}
});

test('I1 ready download rejects absent or mismatched manifest and same-length S3 tampering',async()=>{
 compose('stop','worker');const db=new Pool({connectionString:assertIsolatedDatabase(process.env.READINESS_DATABASE_URL!)}),s3=storage();
 try{
  await db.query("UPDATE platform_jobs SET status='cancelled' WHERE status IN ('queued','running')");const user=await actor(db),id=randomUUID();
  await db.query("INSERT INTO platform_jobs(id,kind,payload,created_by,payload_hash) VALUES($1,'report',$2,$3,'integrity')",[id,{type:'audit',dateFrom:'2026-01-01',dateTo:'2026-01-02'},user.id]);
  const {ReportExportJob}=await import('../../../worker/src/jobs/report-export.job.js');await new ReportExportJob(db,s3,'solar-readiness').runOnce();
  const ready=(await db.query('SELECT * FROM platform_jobs WHERE id=$1',[id])).rows[0];assert.equal(ready.status,'ready');
  const download=()=>fetch(process.env.READINESS_API_URL+`/v1/jobs/${id}/download`,{headers:user.headers});assert.equal((await download()).status,200);
  await db.query('UPDATE platform_jobs SET manifest=NULL WHERE id=$1',[id]);assert.equal((await download()).status,409,'missing manifest cannot publish a file');
  await db.query('UPDATE platform_jobs SET manifest=$2 WHERE id=$1',[id,{...ready.manifest,key:'reports/wrong.csv'}]);assert.equal((await download()).status,409);
  await db.query('UPDATE platform_jobs SET manifest=$2 WHERE id=$1',[id,ready.manifest]);
  const {PutObjectCommand}=await import('@aws-sdk/client-s3');await s3.send(new PutObjectCommand({Bucket:'solar-readiness',Key:ready.object_key,Body:Buffer.alloc(ready.manifest.bytes,88),Metadata:{execution:ready.manifest.execution}}));
  const changed=await download();assert.equal(changed.status,409,'same-length replacement with copied execution metadata is not the verified object');assert.match(changed.headers.get('content-type')!,/json/);
 }finally{s3.destroy();await db.end();}
});

test('I1 reclaim hashes actual S3 bytes before making a crashed report ready',async()=>{
 compose('stop','worker');const db=new Pool({connectionString:assertIsolatedDatabase(process.env.READINESS_DATABASE_URL!)}),s3=storage();
 try{
  await db.query("UPDATE platform_jobs SET status='cancelled' WHERE status IN ('queued','running')");const user=await actor(db),id=randomUUID();
  await db.query("INSERT INTO platform_jobs(id,kind,payload,created_by,payload_hash) VALUES($1,'report',$2,$3,'integrity')",[id,{type:'audit',dateFrom:'2026-01-01',dateTo:'2026-01-02'},user.id]);
  const child=fork(new URL('./reports-child.mjs',import.meta.url),[],{execArgv:['--import','tsx'],env:{...process.env,REPORT_CHILD_MODE:'crash'},stdio:['ignore','pipe','pipe','ipc']});assert.equal((await once(child,'exit'))[0],73);
  const crashed=(await db.query('SELECT * FROM platform_jobs WHERE id=$1',[id])).rows[0];
  const {PutObjectCommand}=await import('@aws-sdk/client-s3');await s3.send(new PutObjectCommand({Bucket:'solar-readiness',Key:crashed.manifest.key,Body:Buffer.alloc(crashed.manifest.bytes,88),Metadata:{execution:crashed.manifest.execution}}));
  await db.query("UPDATE platform_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[id]);const {ReportExportJob}=await import('../../../worker/src/jobs/report-export.job.js');await new ReportExportJob(db,s3,'solar-readiness').runOnce();
  const failed=(await db.query('SELECT * FROM platform_jobs WHERE id=$1',[id])).rows[0];assert.equal(failed.status,'failed');assert.equal(failed.error_code,'artifact_mismatch');assert.equal(failed.object_key,null);
 }finally{s3.destroy();await db.end();}
});


test('I2 blackholed multipart cleanup settles reclaim and shutdown within its own deadline',async()=>{
 compose('stop','worker');const db=new Pool({connectionString:assertIsolatedDatabase(process.env.READINESS_DATABASE_URL!)}),s3=storage();
 const server=createServer((req,res)=>{if(req.method==='DELETE')return;res.writeHead(503);res.end('unavailable');});server.listen(0,'127.0.0.1');await once(server,'listening');
 const children:ReturnType<typeof fork>[]=[];
 try{
  await db.query("UPDATE platform_jobs SET status='cancelled' WHERE status IN ('queued','running')");const user=await actor(db);
  for(const mode of ['blackhole-reclaim','blackhole-shutdown']){
   const id=randomUUID(),execution=randomUUID(),key=`reports/${id}/${execution}.csv`;
   const {CreateMultipartUploadCommand}=await import('@aws-sdk/client-s3');
   const uploaded=await s3.send(new CreateMultipartUploadCommand({Bucket:'solar-readiness',Key:key,Metadata:{execution}}));
   await db.query("INSERT INTO platform_jobs(id,kind,payload,created_by,payload_hash,manifest) VALUES($1,'report',$2,$3,'cleanup',$4)",[id,{type:'audit',dateFrom:'2026-01-01',dateTo:'2026-01-02'},user.id,mode==='blackhole-reclaim'?{execution,key,uploadId:uploaded.UploadId}:null]);
   const endpoint=`http://127.0.0.1:${(server.address() as any).port}`;
   let observedAbort!:()=>void;const abortRequest=new Promise<void>(resolve=>{observedAbort=resolve;});const observe=(req:any)=>{if(req.method==='DELETE')observedAbort();};server.on('request',observe);
   const child=fork(new URL('./reports-child.mjs',import.meta.url),[],{execArgv:['--import','tsx'],env:{...process.env,REPORT_CHILD_MODE:mode,REPORT_BLACKHOLE_ENDPOINT:endpoint},stdio:['ignore','pipe','pipe','ipc']});children.push(child);
   const start=Date.now();const exit=new Promise<{timedOut:boolean;code:number|null}>(resolve=>{const timer=setTimeout(()=>resolve({timedOut:true,code:null}),8000);child.once('exit',code=>{clearTimeout(timer);resolve({timedOut:false,code});});});
   if(mode==='blackhole-shutdown'){await abortRequest;child.send('shutdown');}
   const result=await exit;server.off('request',observe);if(result.timedOut){child.kill('SIGKILL');await once(child,'exit');}
   assert.equal(result.timedOut,false,`${mode} remained blocked in AbortMultipartUpload beyond 8 seconds`);assert.equal(result.code,0);assert.ok(Date.now()-start<8000);
   const job=(await db.query('SELECT * FROM platform_jobs WHERE id=$1',[id])).rows[0];assert.equal(job.status,mode==='blackhole-reclaim'?'ready':'failed');assert.equal(job.worker_id,null);assert.equal(job.lease_until,null);
  }
 }finally{for(const child of children)if(child.exitCode===null&&!child.killed)child.kill('SIGKILL');server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));s3.destroy();await db.end();}
});

test('I1 fresh multipart completion verifies stored bytes before publishing ready',async()=>{
 compose('stop','worker');const db=new Pool({connectionString:assertIsolatedDatabase(process.env.READINESS_DATABASE_URL!)}),s3=storage();
 try{
  await db.query("UPDATE platform_jobs SET status='cancelled' WHERE status IN ('queued','running')");const user={id:randomUUID()},id=randomUUID();
  await db.query("INSERT INTO users(id,email,display_name,role,status) VALUES($1::uuid,$1::text||'@example.test','Fresh integrity actor','owner','active')",[user.id]);
  await db.query("INSERT INTO platform_jobs(id,kind,payload,created_by,payload_hash) VALUES($1,'report',$2,$3,'fresh-integrity')",[id,{type:'audit',dateFrom:'2026-01-01',dateTo:'2026-01-02'},user.id]);
  const realSend=s3.send.bind(s3);let tampered=false;
  (s3 as any).send=async(command:any,options:any)=>{const result=await realSend(command,options);if(command.constructor.name==='CompleteMultipartUploadCommand'){
   const object=await realSend(new HeadObjectCommand({Bucket:'solar-readiness',Key:command.input.Key}));const {PutObjectCommand}=await import('@aws-sdk/client-s3');
   await realSend(new PutObjectCommand({Bucket:'solar-readiness',Key:command.input.Key,Body:Buffer.alloc(object.ContentLength!,88),Metadata:object.Metadata}));tampered=true;
  }return result;};
  const {ReportExportJob}=await import('../../../worker/src/jobs/report-export.job.js');await new ReportExportJob(db,s3,'solar-readiness').runOnce();assert.ok(tampered);
  const failed=(await db.query('SELECT * FROM platform_jobs WHERE id=$1',[id])).rows[0];assert.equal(failed.status,'failed');assert.equal(failed.error_code,'artifact_mismatch');assert.equal(failed.object_key,null);
 }finally{s3.destroy();await db.end();}
});
