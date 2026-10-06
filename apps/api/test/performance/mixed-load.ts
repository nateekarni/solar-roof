import 'reflect-metadata';
import assert from 'node:assert/strict';
import {hostname,cpus,totalmem} from 'node:os';
import {execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import mqtt from 'mqtt';
import {profileConfig,assertTargetHost,evaluateCapacity,summary,DuplicateAckBarrier} from './capacity-policy';
import {verifyDockerExecution} from './docker-identity';
import {assertPageBudget} from './page-budget';
import {ownedPool,seedHistory} from './seed-history';
import {OperationsService} from '../../src/modules/dashboard/operations.service';
import type {DatabaseService} from '../../src/database/database.service';
// Browser dependency belongs to the web workspace.
// @ts-expect-error Plain ESM harness has no TypeScript declarations.
import {measurePages} from '../../../web/test/platform/page-latency.mjs';

const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const execute=promisify(execFile);
const profile=profileConfig(process.env.CAPACITY_PROFILE??'smoke',Number(process.env.CAPACITY_HISTORY_DAYS??90));
const api=process.env.READINESS_API_URL!,web=process.env.READINESS_WEB_URL!;
assert.equal(api,'http://127.0.0.1:13001');assert.equal(web,'http://localhost:13000');
const compose=(...args:string[])=>execFileSync('docker',['compose','-f','infra/ci/compose.yml',...args],{encoding:'utf8'});
const db=ownedPool();
let client: ReturnType<typeof mqtt.connect>|undefined;
let timer: ReturnType<typeof setInterval>|undefined;
const artifact:Record<string,unknown>={revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),profile,releaseGate:'fail',startedAt:new Date().toISOString()};
await mkdir('test/artifacts',{recursive:true});
try {
  artifact.docker=verifyDockerExecution(profile.name);
  const disk=compose('exec','-T','postgres','df','-Pk','/var/lib/postgresql/data');
  const availableDiskBytes=Number(disk.trim().split('\n').at(-1)!.trim().split(/\s+/)[3])*1024;
  assertTargetHost({profile:profile.name,hostname:hostname(),approvedHost:process.env.CAPACITY_APPROVED_HOST,dedicated:process.env.CAPACITY_DEDICATED==='true',availableDiskBytes,ciEvent:process.env.GITHUB_EVENT_NAME});
  const containerIds=compose('ps','-q').trim().split(/\s+/).filter(Boolean);
  const containers=JSON.parse(execFileSync('docker',['inspect',...containerIds],{encoding:'utf8'}));
  artifact.hardware={hostname:hostname(),cpus:cpus().length,memoryBytes:totalmem(),availableDiskBytes,disk,containers:containers.map((c:any)=>({service:c.Config.Labels['com.docker.compose.service'],image:c.Image,memoryLimit:c.HostConfig.Memory,nanoCpus:c.HostConfig.NanoCpus}))};
  console.log(`[capacity] phase=seed profile=${profile.name} historyRows=${profile.historyRows} users=${profile.users}`);
  const fixture=await seedHistory(db,profile);artifact.rows=fixture.historyRows;artifact.fixture={seedTriggers:fixture.seedTriggers,roleDistribution:fixture.roleDistribution};
  compose('restart','api');
  for(let i=0;;i++){try{if((await fetch(api+'/ready')).ok && (await fetch(api+'/ready/mqtt')).ok)break;}catch{} assert.ok(i<120,'API and MQTT readiness after seed');await pause(500);}
  const tokens:string[]=[];
  for(const user of fixture.users) {
    // Respect real per-IP authentication limits; setup is outside measured workload.
    if(tokens.length)await pause(6500);
    const response=await fetch(api+'/v1/auth/login',{method:'POST',headers:{Origin:web,'Content-Type':'application/json'},body:JSON.stringify({email:user.email,password:user.password})});
    assert.equal(response.status,200,'Real fixture login');tokens.push((await response.json()).accessToken);
  }
  const headers=(i:number)=>({Origin:web,'Content-Type':'application/json',Authorization:`Bearer ${tokens[i]}`});
  const observations:unknown[]=[];
  const reportIds:string[]=[],exportActivity:{at:number;running:number}[]=[];
  const wal:Record<string,any>={};
  async function walSnapshot(phase:string){wal[phase]={at:new Date().toISOString(),...(await db.query('SELECT pg_current_wal_lsn()::text AS lsn,wal_bytes::text,stats_reset FROM pg_stat_wal')).rows[0]};}
  let sampling=false;
  timer=setInterval(()=>{if(sampling)return;sampling=true;void (async()=>{
    const locks=(await db.query("SELECT wait_event_type,wait_event,count(*)::int n FROM pg_stat_activity WHERE datname=current_database() GROUP BY 1,2")).rows;
    if(reportIds.length===2)exportActivity.push({at:performance.now(),running:Number((await db.query("SELECT count(*) n FROM platform_jobs WHERE id=ANY($1::uuid[]) AND status='running'",[reportIds])).rows[0].n)});
    const memory=(await execute('docker',['stats','--no-stream','--format','{{json .}}',...containerIds],{encoding:'utf8'})).stdout.trim().split('\n').map(s=>JSON.parse(s));
    observations.push({at:new Date().toISOString(),locks,memory});
  })().catch(error=>observations.push({error:String(error)})).finally(()=>{sampling=false;});},5000);
  client=mqtt.connect('mqtt://127.0.0.1:18883',{reconnectPeriod:100});
  await new Promise<void>((resolve,reject)=>{client!.once('connect',()=>resolve());client!.once('error',reject);});
  const sent=new Map<string,{device:string;source:string;payload:string;topic:string;at:number}>(),acked=new Set<string>(),ackLatency:number[]=[];
  let duplicateBarrier:DuplicateAckBarrier|undefined;
  client.on('message',(_topic,bytes)=>{try{const ack=JSON.parse(bytes.toString());const item=sent.get(ack.ingestionId);if(item&&ack.status==='acknowledged'){acked.add(ack.ingestionId);duplicateBarrier?.acknowledge(ack.ingestionId,ack.duplicate===true);ackLatency.push(performance.now()-item.at);}}catch{}});
  await new Promise<void>((resolve,reject)=>client!.subscribe([...new Set(fixture.devices.map(d=>`energy/${d.gateway}/response`))],{qos:1},error=>error?reject(error):resolve()));
  let sequence=0,publishErrors=0;
  async function send() {
    const device=fixture.devices[sequence++%fixture.devices.length],id=randomUUID(),source=new Date().toISOString();
    const payload=JSON.stringify({deviceId:device.id,gateway:device.gateway,sourceTime:source,ingestionId:id,metrics:{activePower:1200,totalEnergy:150000+sequence}}),topic=`energy/${device.gateway}/telemetry`;
    sent.set(id,{device:device.id,source,payload,topic,at:performance.now()});
    await new Promise<void>(resolve=>client!.publish(topic,payload,{qos:1},error=>{if(error)publishErrors++;resolve();}));
  }
  async function paced(rate:number,seconds:number) {
    const count=Math.floor(rate*seconds/60),started=performance.now();
    for(let i=0;i<count;i++){await pause(Math.max(0,started+i*60000/rate-performance.now()));await send();}
    await pause(Math.max(0,started+seconds*1000-performance.now()));return count;
  }
  async function report(i:number) {
    const response=await fetch(api+'/v1/reports',{method:'POST',headers:{...headers(i),'Idempotency-Key':randomUUID()},body:JSON.stringify({type:'energy',format:'csv',dateFrom:new Date(Date.now()-89*86400000).toISOString().slice(0,10),dateTo:new Date().toISOString().slice(0,10)})});
    assert.equal(response.status,202,'Report accepted by server');const {jobId}=await response.json();reportIds.push(jobId);
    const started=performance.now();
    while(performance.now()-started<1200000){const r=await fetch(api+`/v1/jobs/${jobId}`,{headers:headers(i)});assert.equal(r.status,200);const job=await r.json();if(job.status==='ready')return {jobId,ms:performance.now()-started};assert.ok(!['failed','cancelled'].includes(job.status),`Report ${job.status}`);await pause(1000);}
    throw new Error('Report ready timeout');
  }
  const started=performance.now();
  console.log(`[capacity] phase=steady duration=${profile.steadySeconds}s; browser pages and two reports start concurrently`);
  await walSnapshot('beforeSteady');
  const reportWork=Promise.allSettled([report(0),report(1)]);
  const pageWork=Promise.allSettled([measurePages(tokens)]);
  const steadyStart=performance.now();const steadySent=await paced(profile.steadyPerMinute,profile.steadySeconds);const steadySeconds=(performance.now()-steadyStart)/1000;
  await walSnapshot('afterSteady');
  const burstStart=performance.now();
  console.log(`[capacity] phase=burst messages=${profile.burst}`);
  const burstPageWork=Promise.allSettled([measurePages(tokens)]);
  await Promise.all(Array.from({length:profile.burst},()=>send()));
  const burstSeconds=(performance.now()-burstStart)/1000;
  await walSnapshot('afterBurst');
  console.log(`[capacity] phase=replay duration=${profile.replaySeconds}s`);
  const replayStart=performance.now();const replaySent=await paced(profile.replayPerMinute,profile.replaySeconds);const replaySeconds=(performance.now()-replayStart)/1000;
  const replayEnd=performance.now();await walSnapshot('afterReplay');
  for(let i=0;i<60&&acked.size<sent.size;i++)await pause(1000);
  assert.equal(acked.size,sent.size,'Initial application commit ACK barrier before duplicate round');
  // Wait for explicit duplicate commit ACKs, never broker callbacks or the initial ACK set.
  const duplicateEntries=[...sent].slice(0,profile.burst);
  duplicateBarrier=new DuplicateAckBarrier(duplicateEntries.map(([id])=>id));
  for(const [,item] of duplicateEntries)await new Promise<void>(resolve=>client!.publish(item.topic,item.payload,{qos:1},error=>{if(error)publishErrors++;resolve();}));
  for(let i=0;i<60&&!duplicateBarrier.complete;i++)await pause(1000);
  artifact.duplicateRound={requested:duplicateEntries.length,missingApplicationAcks:duplicateBarrier.missing};
  assert.equal(duplicateBarrier.missing,0,'Duplicate application commit ACK barrier before persisted-row verification');
  await walSnapshot('afterDuplicate');
  const boundaries=Object.keys(wal),walDeltas=[];
  for(let i=1;i<boundaries.length;i++){
    const from=wal[boundaries[i-1]],to=wal[boundaries[i]];
    const resetUnchanged=String(from.stats_reset)===String(to.stats_reset);
    walDeltas.push({from:boundaries[i-1],to:boundaries[i],resetUnchanged,lsnBytes:(await db.query('SELECT pg_wal_lsn_diff($1::pg_lsn,$2::pg_lsn)::text AS bytes',[to.lsn,from.lsn])).rows[0].bytes,statBytes:resetUnchanged?(BigInt(to.wal_bytes)-BigInt(from.wal_bytes)).toString():null});
  }
  artifact.wal={snapshots:wal,deltas:walDeltas,scope:'Whole database with real triggers and concurrent workers/exports; not isolated per-ingestion overhead. pg_stat_wal reporting can lag; reset identity retained.'};
  artifact.exportActivity=exportActivity;
  const pageResults=[...await pageWork,...await burstPageWork];
  const pages=pageResults.flatMap((r:any,i:number)=>r.status==='fulfilled'?r.value.map((p:any)=>({...p,phase:i===0?'steady':'burst/replay'})):[{ms:30000,error:String(r.reason),phase:i===0?'steady':'burst/replay'}]),reports=await reportWork;
  let persisted=0,ackedButMissing=0,unexpectedDuplicateRows=0;
  const entries=[...sent];
  for(let offset=0;offset<entries.length;offset+=1000){
    const batch=entries.slice(offset,offset+1000).map(([id,item])=>({id,ingestion_id:`${item.device}:${createHash('sha256').update(id).digest('hex')}`,source_time:item.source}));
    const counts=await db.query(`SELECT x.id,count(t.id)::int n FROM jsonb_to_recordset($1::jsonb) AS x(id text,ingestion_id text,source_time timestamptz) LEFT JOIN telemetry_raw t ON t.ingestion_id=x.ingestion_id AND t.source_time=x.source_time GROUP BY x.id`,[JSON.stringify(batch)]);
    for(const row of counts.rows){if(row.n)persisted++;if(acked.has(row.id)&&!row.n)ackedButMissing++;unexpectedDuplicateRows+=Math.max(0,row.n-1);}
  }
  const plans:unknown[]=[];
  const service=new OperationsService({query:async(sql:string,params:unknown[])=>{
    const plan=await db.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+sql,params);plans.push({sql,plan:plan.rows});return db.query(sql,params);
  }} as unknown as DatabaseService);
  for(const resource of ['billing','audit'])await service.list(resource,{id:fixture.users[0].id,role:'admin'});
  const errors=publishErrors+pages.filter((p:any)=>p.error).length+reports.filter(r=>r.status==='rejected').length;
  console.log(`[capacity] phase=validation samples=${pages.length} maxReadyMs=${summary(pages.map((p:any)=>p.ms)).max} errors=${errors}`);
  const evidence={profile,historyRows:fixture.historyRows,users:tokens.length,steadySent,steadySeconds,burstSent:profile.burst,burstSeconds,replaySent,replaySeconds,exportsReady:reports.filter(r=>r.status==='fulfilled').length,exportPeakOverlap:exportActivity.some(sample=>sample.at>=burstStart&&sample.at<=replayEnd&&sample.running===2),ackedButMissing,unexpectedDuplicateRows,unacked:sent.size-acked.size,errors,pageSamples:pages.map((p:any)=>p.ms),coldAndWarm:false,queryPlans:plans.length===2,hardwareProof:true};
  artifact.actualRatesPerMinute={steady:steadySent/steadySeconds*60,replay:replaySent/replaySeconds*60};
  Object.assign(artifact,evaluateCapacity(evidence),{scenario:evidence,...summary(evidence.pageSamples),pages,reports,acked:acked.size,persisted,duplicates:unexpectedDuplicateRows,ackedButMissing,errors,ackLatency:summary(ackLatency),peakMemory:observations,plans,durationMs:performance.now()-started,database:(await db.query('SELECT pg_database_size(current_database()) bytes')).rows[0],cacheLimitation:'Browser fresh/warm contexts measured; database/OS cold cache is NOT established. Target gate stays failed.'});
  assert.equal(ackedButMissing,0);assert.equal(unexpectedDuplicateRows,0);assert.equal(evidence.unacked,0);assert.equal(errors,0);
  assertPageBudget(pages);
  if(profile.name==='target')assert.equal(artifact.releaseGate,'pass','Incomplete evidence cannot pass target gate');
} catch(error) {artifact.error=String(error);artifact.releaseGate='fail';console.error('Mixed workload validation failed:',String(error));process.exitCode=1;}
finally {if(timer)clearInterval(timer);client?.end(true);await db.end();artifact.finishedAt=new Date().toISOString();await writeFile('test/artifacts/platform-capacity.json',JSON.stringify(artifact,null,2));}
