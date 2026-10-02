import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomUUID,randomBytes,scryptSync,createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {backupArtifacts,restoreArtifacts,assertArtifactCoverage} from './recovery-artifacts.mjs';
const require=createRequire(new URL('../../apps/api/package.json',import.meta.url));
const {Pool}=require('pg');
const mqtt=require('mqtt');
const {S3Client,CreateBucketCommand,PutObjectCommand,ListObjectsV2Command,DeleteObjectCommand}=require('@aws-sdk/client-s3');
const resultPath='test/artifacts/recovery-result.json';
assert.match(process.env.RECOVERY_COMPOSE_PROJECT||'',/^solar-ci-[a-f0-9-]+$/);
assert.equal(process.env.READINESS_DATABASE_URL,'postgresql://solar:ci-only-password@127.0.0.1:15432/solar_readiness');
const args=['compose','-p',process.env.RECOVERY_COMPOSE_PROJECT,'-f','infra/ci/compose.yml','-f','infra/ci/recovery-compose.yml'];
function compose(command,{input,allowFailure=false,timeout=240000}={}){const r=spawnSync('docker',[...args,...command],{encoding:'utf8',env:process.env,input,timeout,maxBuffer:8*1024*1024});if(!allowFailure&&r.status!==0)throw Error(`Compose ${command[0]} failed (${r.status}): ${r.stderr}\n${r.stdout}`);return r;}
function sql(service,query){return compose(['exec','-T',service,'psql','-U','solar','-d','solar_readiness','-At','-v','ON_ERROR_STOP=1','-c',query]).stdout.trim();}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){for(let i=0;i<150;i++){if(await check())return;await delay(100);}throw Error('Timed out waiting for recovery boundary');}
// Fixture-only fault: stop the scheduler's real backup, never the sampler or database.
async function proveSamplerDuringLongBackup(){
 const tag=randomUUID(),state=`/tmp/d2-backup-${tag}`,watcher=String.raw`
import json, os, signal, time
from pathlib import Path
base=Path("${state}")
def identity(pid):
 try:
  fields=Path('/proc/%s/stat'%pid).read_text().split()
  return fields[21], fields[2], int(fields[3])
 except (OSError,IndexError): return None
pid=None; token=None; paused=False
seen_schedulers=set(); seen_candidates=set(); exe_denied=0; signal_denied=0
try:
 deadline=time.monotonic()+95
 while time.monotonic()<deadline:
  schedulers=[]
  for proc in Path('/proc').iterdir():
   if not proc.name.isdigit(): continue
   try:
    args=(proc/'cmdline').read_bytes().split(b'\0')
    if b'/opt/solar-backup/backup-scheduler.sh' in args: schedulers.append(int(proc.name));seen_schedulers.add(int(proc.name))
   except OSError: pass
  for proc in Path('/proc').iterdir():
   if not proc.name.isdigit(): continue
   try:
    current=identity(int(proc.name));args=(proc/'cmdline').read_bytes().split(b'\0')
    if not current or current[2] not in schedulers or b'backup' not in args: continue
    seen_candidates.add(int(proc.name))
    try: executable=(proc/'exe').resolve(strict=True).name
    except PermissionError: exe_denied+=1;continue
    if executable!='pgbackrest': continue
    pid=int(proc.name);token=current[0]
    try: os.kill(pid,signal.SIGSTOP)
    except PermissionError: signal_denied+=1;continue
    paused=True;break
   except (OSError,ProcessLookupError): pass
  if paused: break
  time.sleep(.01)
 if not paused: raise RuntimeError('scheduler backup process not observed: schedulers=%d candidates=%d exe_denied=%d signal_denied=%d uid=%d'%(len(seen_schedulers),len(seen_candidates),exe_denied,signal_denied,os.getuid()))
 base.with_suffix('.paused').write_text(json.dumps({'pid':pid,'startToken':token,'stoppedAt':time.time()}))
 # Independent watchdog guarantees resumption even if the host fixture process dies.
 until=time.monotonic()+240
 while time.monotonic()<until and not base.with_suffix('.resume').exists(): time.sleep(.1)
except Exception as error:
 base.with_suffix('.error').write_text(type(error).__name__+': '+str(error))
finally:
 if paused:
  current=identity(pid)
  if current and current[0]==token: os.kill(pid,signal.SIGCONT)
 base.with_suffix('.done').write_text('resumed')
`;
 // Initial successful scheduler iteration must have published its marker before requesting another.
 await until(()=>compose(['exec','-T','postgres','test','-f','/var/lib/solar-backup/last-day'],{allowFailure:true}).status===0);
 const initial=JSON.parse(compose(['exec','-T','postgres','cat','/var/lib/solar-backup/status.json']).stdout);
 // Match pgBackRest's UID so /proc/exe inspection and signals need no CAP_SYS_PTRACE.
 compose(['exec','-d','postgres','su-exec','postgres','python3','-c',watcher]);
 let paused,observations=[];
 try{
  compose(['exec','-T','postgres','rm','/var/lib/solar-backup/last-day']);
  for(let n=0;n<100;n++){
   const failure=compose(['exec','-T','postgres','cat',state+'.error'],{allowFailure:true});if(failure.status===0)throw Error(failure.stdout);
   const found=compose(['exec','-T','postgres','cat',state+'.paused'],{allowFailure:true});if(found.status===0){paused=JSON.parse(found.stdout);break;}await delay(1000);
  }
  assert.ok(paused,'Observed actual scheduler-owned pgBackRest backup');
  const start=Date.now();
  while(Date.now()-start<190000){
   await delay(Math.min(30000,190000-(Date.now()-start)));
   const sample=JSON.parse(compose(['exec','-T','postgres','cat','/var/lib/solar-backup/status.json']).stdout);
   const processState=compose(['exec','-T','postgres','python3','-c',`from pathlib import Path; s=Path('/proc/${paused.pid}/stat').read_text().split(); assert s[21]=='${paused.startToken}' and s[2]=='T'`]);
   assert.equal(processState.status,0);assert.ok(Date.now()/1000-sample.observedAt<180,'Sampler remains fresh during stopped backup');
   assert.ok(Number.isSafeInteger(sample.pendingWalCount)&&sample.pendingWalCount>=0,'WAL observations continue while backup is paused');
   assert.ok(typeof sample.rawDiskUsedPercent==='number'&&sample.rawDiskUsedPercent>=0&&sample.rawDiskUsedPercent<=100,'Disk observations remain available');
   compose(['exec','-T','postgres','/opt/solar-backup/entrypoint.sh','health']);
   observations.push({observedAt:sample.observedAt,heartbeat:sample.schedulerHeartbeatAt});
   console.log(`Controlled backup paused ${Math.round((Date.now()-start)/1000)}s; status freshness and health verified`);
  }
  assert.ok(observations.at(-1).observedAt>paused.stoppedAt+120);assert.ok(observations.at(-1).heartbeat>initial.schedulerHeartbeatAt+120);
  return {pausedSeconds:(Date.now()-start)/1000,observations:observations.length,statusAdvanced:true};
 }finally{
  compose(['exec','-T','postgres','touch',state+'.resume'],{allowFailure:true});
  // Wait for the watchdog to acknowledge SIGCONT before any further backup/PITR operations.
  await until(()=>compose(['exec','-T','postgres','test','-f',state+'.done'],{allowFailure:true}).status===0);
 }
}
async function mqttSession(gateway){const client=mqtt.connect('mqtt://127.0.0.1:18883',{reconnectPeriod:100}),acks=[];client.on('message',(_,bytes)=>acks.push(JSON.parse(bytes)));await until(()=>client.connected);await new Promise((resolve,reject)=>client.subscribe(`energy/${gateway}/response`,{qos:1},e=>e?reject(e):resolve()));return {client,acks,publish:body=>new Promise((resolve,reject)=>client.publish(`energy/${gateway}/telemetry`,body,{qos:1},e=>e?reject(e):resolve()))};}
const base='http://127.0.0.1:13001',origin='http://localhost:13000';
const s3=new S3Client({endpoint:`http://127.0.0.1:${process.env.PLATFORM_CI_STORAGE_PORT}`,region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:'solar-ci',secretAccessKey:'ci-storage-only-password'}});
let db;
writeFileSync(resultPath,JSON.stringify({status:'running',profile:'fixture',productionRecoveryVerified:false}));
try {
 compose(['up','-d','--wait','storage','repository-proxy']);
 await s3.send(new CreateBucketCommand({Bucket:'solar-backups'}));
 await s3.send(new CreateBucketCommand({Bucket:'restored-documents'}));
 await s3.send(new CreateBucketCommand({Bucket:'stale-documents'}));
 compose(['up','-d','--wait','--wait-timeout','240','api','worker']);
 db=new Pool({connectionString:process.env.READINESS_DATABASE_URL});
 const school=randomUUID(),other=randomUUID(),site=randomUUID(),foreignSite=randomUUID(),document=randomUUID(),foreignDoc=randomUUID();
 await db.query("INSERT INTO schools(id,name,code,region) VALUES($1::uuid,'D2 School',$1::text,'fixture'),($2::uuid,'D2 Other',$2::text,'fixture')",[school,other]);
 await db.query("INSERT INTO sites(id,school_id,name,capacity_mwp) VALUES($1,$2,'D2 Site',0.1),($3,$4,'D2 Foreign',0.1)",[site,school,foreignSite,other]);
 const password='D2-recovery-password-123!',salt=randomBytes(16).toString('hex'),hash=`scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`;
 const roles=['owner','admin','operator','accountant','school_user'];
 const users=[];
 for(const role of roles){const id=randomUUID(),email=`d2-${id}@example.test`;users.push({role,email});await db.query("INSERT INTO users(id,email,display_name,role,status,password_hash,school_id) VALUES($1,$2,'D2 Actor',$3,'active',$4,$5)",[id,email,role,hash,school]);}
 // Synthetic original bytes are fixture-only, never published as a real issued artifact.
 const original=Buffer.from('%PDF-1.4\nD2 isolated original-byte preservation fixture\n%%EOF\n');
 await s3.send(new PutObjectCommand({Bucket:'solar-readiness',Key:'original/d2-fixture.pdf',Body:original}));
 await s3.send(new PutObjectCommand({Bucket:'solar-readiness',Key:'original/foreign.pdf',Body:original}));
 await db.query("INSERT INTO documents(id,site_id,document_type,document_number,status,amount,file_key) VALUES($1::uuid,$2,'invoice',$1::text,'issued',10,'original/d2-fixture.pdf'),($3::uuid,$4,'invoice',$3::text,'issued',20,'original/foreign.pdf')",[document,site,foreignDoc,foreignSite]);
  const gateway=randomUUID(),device=randomUUID();
 await db.query("INSERT INTO gateways(id,site_id,name,protocol,endpoint) VALUES($1::uuid,$2,$1::text,'mqtt',$3)",[gateway,site,`energy/${gateway}/#`]);
 await db.query("INSERT INTO devices(id,gateway_id,site_id,name,device_type,model,serial_number) VALUES($1::uuid,$2,$3,'D2 meter','meter','fixture',$1::text)",[device,gateway,site]);
 compose(['restart','api']);await until(async()=>{try{return(await fetch(base+'/ready')).ok;}catch{return false;}});
 const payload=JSON.stringify({deviceId:device,gateway,sourceTime:new Date().toISOString(),ingestionId:'d2-before-outage',metrics:{activePower:1200}});
 const live=await mqttSession(gateway);try{await live.publish(payload);await until(()=>live.acks.length===1);}finally{live.client.end(true);}
 await db.query('CREATE TABLE recovery_markers(name text PRIMARY KEY, committed_at timestamptz NOT NULL DEFAULT clock_timestamp())');
 const config=Buffer.from(JSON.stringify({version:1,fixture:true,image:process.env.RECOVERY_IMAGE||'solar-postgres-backup:ci',credentialReferences:['fixture-only-not-production']}));
 const artifactKey='ci-artifact-encryption-separate-from-db-and-backup';
 const staleSaved=await backupArtifacts({source:s3,repository:s3,sourceBucket:'solar-readiness',repositoryBucket:'solar-backups',key:artifactKey,config,generation:randomUUID()});
 const lateOriginal=Buffer.from('late original fixture after artifact checkpoint'),lateDocument=randomUUID();
 await s3.send(new PutObjectCommand({Bucket:'solar-readiness',Key:'original/created-after-checkpoint.pdf',Body:lateOriginal}));
 await db.query("INSERT INTO documents(id,site_id,document_type,document_number,status,amount,file_key) VALUES($1::uuid,$2,'invoice',$1::text,'issued',1,'original/created-after-checkpoint.pdf')",[lateDocument,site]);
 const saved=await backupArtifacts({source:s3,repository:s3,sourceBucket:'solar-readiness',repositoryBucket:'solar-backups',key:artifactKey,config,generation:randomUUID()});
 // Wait for initial scheduler backup; then take a full backup after fixture metadata exists.
 let info;
 for(let i=0;i<90;i++){const r=compose(['exec','-T','postgres','su-exec','postgres','pgbackrest','--stanza=solar','--output=json','info']);info=JSON.parse(r.stdout);if(info[0]?.backup?.length)break;await delay(1000);}
 assert.ok(info[0]?.backup?.length,'Initial managed backup completes');
 const backupStatus=JSON.parse(compose(['exec','-T','postgres','cat','/var/lib/solar-backup/status.json']).stdout);
 assert.equal(backupStatus.configurationFingerprintVersion,1);assert.match(backupStatus.configurationFingerprint,/^[a-f0-9]{64}$/);assert.ok(Date.now()/1000-backupStatus.observedAt<180);

 const longBackupSampler=await proveSamplerDuringLongBackup();
 for(let n=0;n<90;n++){if(compose(['exec','-T','postgres','test','-f','/var/lib/solar-backup/last-day'],{allowFailure:true}).status===0)break;assert.ok(n<89,'Resumed scheduler backup completes');await delay(1000);}
 compose(['exec','-T','postgres','su-exec','postgres','pgbackrest','--stanza=solar','--type=full','backup']);
 info=JSON.parse(compose(['exec','-T','postgres','su-exec','postgres','pgbackrest','--stanza=solar','--output=json','info']).stdout);
 const backup=info[0].backup.at(-1),backupId=backup.label;
 await db.query("INSERT INTO recovery_markers(name) VALUES('before')");
 const latestRestoredCommitTime=(await db.query("SELECT committed_at FROM recovery_markers WHERE name='before'")).rows[0].committed_at.toISOString();
 await delay(1100);
 const targetTime=(await db.query('SELECT clock_timestamp() AS t')).rows[0].t.toISOString();
 await delay(1100);
 await db.query("INSERT INTO recovery_markers(name) VALUES('after')");
 const requiredWal=(await db.query('SELECT pg_walfile_name(pg_current_wal_lsn()) AS wal')).rows[0].wal;
 await db.query('SELECT pg_switch_wal()');
 compose(['exec','-T','postgres','su-exec','postgres','pgbackrest','--stanza=solar','check']);
 await db.end();db=null;
 const outageDeclaredAt=new Date();
 compose(['stop','api','worker','postgres']);
 process.env.RESTORE_TARGET_TIME=targetTime;process.env.RESTORE_BACKUP_ID=backupId;
 compose(['--profile','restore','up','-d','--wait','--wait-timeout','180','restore-db']);
 assert.equal(sql('restore-db',"SELECT count(*) FROM recovery_markers WHERE name='before'"),'1');
 assert.equal(sql('restore-db',"SELECT count(*) FROM recovery_markers WHERE name='after'"),'0');console.log('PITR: before marker restored; after marker excluded');
 await assert.rejects(restoreArtifacts({destination:s3,repository:s3,destinationBucket:'restored-documents',repositoryBucket:'solar-backups',key:'incorrect-key-must-never-decrypt',manifestKey:saved.manifestKey}));
 const restored=await restoreArtifacts({destination:s3,repository:s3,destinationBucket:'restored-documents',repositoryBucket:'solar-backups',key:artifactKey,manifestKey:saved.manifestKey});
 const requiredKeys=sql('restore-db',"SELECT file_key FROM documents WHERE file_key IS NOT NULL ORDER BY file_key").split('\n');
 const requiredObjects=requiredKeys.map(key=>({key,sha256:createHash('sha256').update(key==='original/created-after-checkpoint.pdf'?lateOriginal:original).digest('hex')}));
 const stale=await restoreArtifacts({destination:s3,repository:s3,destinationBucket:'stale-documents',repositoryBucket:'solar-backups',key:artifactKey,manifestKey:staleSaved.manifestKey});
 assert.throws(()=>assertArtifactCoverage(stale.manifest,requiredObjects,createHash('sha256').update(config).digest('hex')),/coverage missing/);
 assertArtifactCoverage(restored.manifest,requiredObjects,createHash('sha256').update(config).digest('hex'));
 assert.deepEqual(restored.config,config);assert.equal(restored.manifest.objects.find(o=>o.key==='original/d2-fixture.pdf').sha256,createHash('sha256').update(original).digest('hex'));
 process.env.RECOVERY_DATABASE_HOST='restore-db';process.env.RECOVERY_STORAGE_BUCKET='restored-documents';
 compose(['up','-d','--no-deps','--force-recreate','--wait','--wait-timeout','120','api']);
 for(const actor of users){const login=await fetch(base+'/v1/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:actor.email,password})});assert.equal(login.status,200,actor.role+' restored login');const token=(await login.json()).accessToken;const get=p=>fetch(base+p,{headers:{Authorization:`Bearer ${token}`}});assert.equal((await get('/v1/operations/documents/'+document)).status,200);assert.equal((await get('/v1/operations/documents/'+foreignDoc)).status,actor.role==='owner'?200:404);assert.equal((await get('/v1/dashboard/summary')).status,200);}
  // Count persisted telemetry before replay: replay cannot mask loss in RPO.
 assert.equal(sql('restore-db',`SELECT count(*) FROM telemetry_raw WHERE device_id='${device}'`),'1');
 const replay=await mqttSession(gateway);
 try {await replay.publish(payload);await until(()=>replay.acks.length===1);assert.equal(replay.acks[0].duplicate,true);compose(['restart','mqtt']);await delay(100);compose(['up','-d','--no-deps','--wait','--wait-timeout','60','mqtt']);await until(()=>replay.client.connected);await new Promise((resolve,reject)=>replay.client.subscribe(`energy/${gateway}/response`,{qos:1},e=>e?reject(e):resolve()));await until(async()=>{try{return(await fetch(base+'/ready')).ok;}catch{return false;}});await replay.publish(payload);await until(()=>replay.acks.length===2);assert.equal(replay.acks[1].duplicate,true);assert.equal(sql('restore-db',`SELECT count(*) FROM telemetry_raw WHERE device_id='${device}'`),'1');}finally{replay.client.end(true);}
 const usableAt=new Date();
 const nonempty=compose(['exec','-T','restore-db','/opt/solar-backup/restore.sh'],{allowFailure:true});assert.notEqual(nonempty.status,0);assert.match(nonempty.stderr,/nonempty/);
 const inaccessible=compose(['exec','-T','-e','PGBACKREST_REPO1_S3_ENDPOINT=127.0.0.1','-e','PGBACKREST_REPO1_STORAGE_PORT=1','-e','PGBACKREST_IO_TIMEOUT=2','restore-db','su-exec','postgres','pgbackrest','--stanza=solar','--output=json','info'],{allowFailure:true,timeout:15000});assert.ok(inaccessible.status!==0||JSON.parse(inaccessible.stdout)[0].status.code!==0,'Inaccessible repository cannot report valid recovery chain');
 // Remove exactly the required fixture WAL object, then prove a fresh restore cannot reach target.
 const walObjects=await s3.send(new ListObjectsV2Command({Bucket:'solar-backups',Prefix:'recovery-fixture/archive/solar/'}));
 const segment=walObjects.Contents.find(o=>o.Key.split('/').at(-1).startsWith(requiredWal+'-'));assert.ok(segment,'Required WAL was archived');
 await s3.send(new DeleteObjectCommand({Bucket:'solar-backups',Key:segment.Key}));
 const missing=compose(['--profile','negative','up','-d','--wait','--wait-timeout','50','restore-negative'],{allowFailure:true,timeout:70000});assert.notEqual(missing.status,0,'Missing required WAL must fail target recovery');
 assert.notEqual(compose(['exec','-T','restore-negative','pg_isready','-U','solar','-d','solar_readiness'],{allowFailure:true}).status,0);
 const result={status:'passed',profile:'fixture',revision:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),runtimeImages:Object.fromEntries([process.env.RECOVERY_API_IMAGE||'solar-api:ci',process.env.RECOVERY_WORKER_IMAGE||'solar-worker:ci',process.env.RECOVERY_IMAGE||'solar-postgres-backup:ci'].map(image=>[image,spawnSync('docker',['image','inspect',image,'--format','{{.Id}}'],{encoding:'utf8'}).stdout.trim()])),backupId,targetTime,latestRestoredCommitTime,rpoSeconds:(outageDeclaredAt-new Date(latestRestoredCommitTime))/1000,rtoSeconds:(usableAt-outageDeclaredAt)/1000,outageDeclaredAt:outageDeclaredAt.toISOString(),usableAt:usableAt.toISOString(),beforeMarkerRestored:true,afterMarkerRestored:false,artifactChecksPassed:true,staleArtifactCheckpointRejected:true,backupStatusFingerprintVerified:true,longBackupSampler,configChecksPassed:true,rolesVerified:roles,nonemptyRestoreRejected:true,inaccessibleRepositoryRejected:true,missingWalRejected:true,postgresMajor:Number(sql('restore-db','SHOW server_version_num').slice(0,2)),timescaleVersion:sql('restore-db',"SELECT extversion FROM pg_extension WHERE extname='timescaledb'"),backupBytes:backup.info.repository.size,backupDurationSeconds:backup.timestamp.stop-backup.timestamp.start,effectiveBackupBytesPerSecond:backup.info.repository.size/Math.max(1,backup.timestamp.stop-backup.timestamp.start),retainedChain:info[0].backup.map(b=>b.label),productionRecoveryVerified:false,independentHostDrill:'pending',mqttReplayVerification:'passed-fixture',rawChecksPassed:true};
 assert.ok(result.rpoSeconds<=900);assert.ok(result.rtoSeconds<=14400);
 writeFileSync(resultPath,JSON.stringify(result,null,2));console.log('PASS isolated physical PITR, original object/config, login/scope/dashboard and refusal checks; target-host drill remains pending');
} catch(error){writeFileSync(resultPath,JSON.stringify({status:'failed',profile:'fixture',productionRecoveryVerified:false,error:String(error.message)},null,2));throw error;}finally{if(db)await db.end();s3.destroy();}
