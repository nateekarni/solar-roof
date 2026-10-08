import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';


test('daily energy uses increments and preserves unknown/reset quality', async () => {

  const { deriveIncrement } = await import('../../../../packages/domain/src/energy-increments.js');
  assert.deepEqual(deriveIncrement({at:'2026-01-01T00:00:00Z',kwh:100},{at:'2026-01-01T00:01:00Z',kwh:125}), {kwh:25,quality:'complete'});
  assert.deepEqual(deriveIncrement({at:'2026-01-01T00:00:00Z',kwh:125},{at:'2026-01-01T00:01:00Z',kwh:2}), {kwh:null,quality:'reset'});
  assert.deepEqual(deriveIncrement(null,{at:'2026-01-01T00:01:00Z',kwh:2}), {kwh:null,quality:'missing'});
  assert.deepEqual(deriveIncrement({at:'2026-01-01T00:01:00Z',kwh:100},{at:'2026-01-01T00:01:00Z',kwh:125}), {kwh:null,quality:'missing'});
});
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { assertIsolatedDatabase } from './fixtures.js';
import { execFileSync } from 'node:child_process';
import mqtt from 'mqtt';

test('late readings replace both days, duplicates stay idempotent, resets unknown, and tenant coverage fails closed', async () => {

  const db = new Pool({connectionString:assertIsolatedDatabase(process.env.READINESS_DATABASE_URL!)});
  assert.match(process.env.COMPOSE_PROJECT_NAME??'',/^solar-ci-[a-f0-9-]{36}$/);
  const compose=(...args:string[])=>execFileSync('docker',['compose','-f','infra/ci/compose.yml',...args],{cwd:new URL('../../../../',import.meta.url),stdio:'pipe'});
  compose('stop','worker');
  const { RefreshEnergySummaryJob } = await import('../../../worker/src/jobs/refresh-energy-summary.job.js');
  const { EnergyReadService } = await import('../../src/modules/dashboard/energy-read.service.js');
  const job = new RefreshEnergySummaryJob(db);
  const reader = new EnergyReadService({query: db.query.bind(db)} as any);
  const sites:string[]=[], devices:string[]=[], schools:string[]=[], gateways:string[]=[];
  try {
    assert.ok((await db.query("SELECT name FROM schema_migrations WHERE name='infra/migrations/020_energy_read_models.sql'")).rows.length,'Migration registry must apply read models');
    for(let i=0;i<2;i++) {
      const school=randomUUID(),site=randomUUID(),device=randomUUID(),gateway=randomUUID();
      schools.push(school);sites.push(site);devices.push(device);gateways.push(gateway);
      await db.query("INSERT INTO schools(id,name,code,region) VALUES($1::uuid,'Q3 fixture',$1::text,'fixture')",[school]);
      await db.query("INSERT INTO sites(id,school_id,name,capacity_mwp) VALUES($1,$2,'Q3 fixture',0.1)",[site,school]);
      await db.query("INSERT INTO gateways(id,site_id,name,protocol,endpoint) VALUES($1::uuid,$2,$1::text,'mqtt','energy/'||$1::text||'/#')",[gateway,site]);
      await db.query("INSERT INTO devices(id,gateway_id,site_id,name,device_type,model,serial_number) VALUES($1::uuid,$2,$3,'Q3 meter','meter','fixture',$1::text)",[device,gateway,site]);
      await db.query('INSERT INTO billing_meters(id,site_id,device_id) VALUES($1,$2,$3)',[randomUUID(),site,device]);
    }
    const put=async (at:string,kwh:number,i=0,key=randomUUID())=>db.query(`INSERT INTO telemetry_raw(id,device_id,site_id,source_time,received_time,raw_payload,normalized_value,unit,quality,ingestion_id,total_energy_kwh) VALUES($1,$2,$3,$4,now(),'{}',$5,'kWh','complete',$6,$5) ON CONFLICT(ingestion_id,source_time) DO NOTHING`,[randomUUID(),devices[i],sites[i],at,kwh,key]);
    await put('2026-01-01T17:00:00Z',100);
    const duplicate=randomUUID();await put('2026-01-02T17:00:00Z',125,0,duplicate);await put('2026-01-02T17:00:00Z',125,0,duplicate);
    await put('2026-01-03T17:00:00Z',150);
    await put('2026-01-01T17:00:00Z',500,1);await put('2026-01-02T17:00:00Z',599,1);
    assert.equal((await reader.daily([sites[0]!],'2026-01-02','2026-01-03'))[0]!.quality,'preparing');
    while(await job.runBatch(10)) {}
    assert.deepEqual((await reader.daily([sites[0]!],'2026-01-02','2026-01-03')).map(r=>[r.siteId,r.day,r.kwh,r.quality]),[[sites[0],'2026-01-02',25,'complete'],[sites[0],'2026-01-03',25,'complete']]);
    const stored=await db.query('SELECT sample_count FROM energy_daily WHERE device_id=$1 AND day=$2',[devices[0],'2026-01-02']);assert.equal(stored.rows[0].sample_count,1);
    await db.query('UPDATE telemetry_raw SET total_energy_kwh=130 WHERE device_id=$1 AND source_time=$2',[devices[0],'2026-01-02T17:00:00Z']);
    assert.deepEqual((await db.query('SELECT day::text FROM energy_dirty_days WHERE device_id=$1 ORDER BY day',[devices[0]])).rows.map(r=>r.day),['2026-01-02','2026-01-03','2026-01-04']);
    assert.equal((await reader.daily([sites[0]!],'2026-01-02','2026-01-03'))[0]!.quality,'preparing');
    while(await job.runBatch(10)) {}
    assert.deepEqual((await reader.daily([sites[0]!],'2026-01-02','2026-01-03')).map(r=>r.kwh),[30,20]);
    await put('2026-01-03T05:00:00Z',2);while(await job.runBatch(10)) {}
    assert.equal((await reader.daily([sites[0]!],'2026-01-03','2026-01-03'))[0]!.quality,'reset');
    assert.equal((await reader.daily([sites[0]!],'2026-01-03','2026-01-03'))[0]!.kwh,null);
    assert.equal((await reader.daily([sites[0]!],'2026-01-04','2026-01-04'))[0]!.quality,'missing');
    assert.equal((await reader.daily([sites[0]!],'2026-01-02','2026-01-02'))[0]!.kwh,30);
    assert.equal((await reader.daily([sites[1]!],'2026-01-02','2026-01-02'))[0]!.kwh,99);
    assert.equal((await reader.daily([],'2026-01-02','2026-01-02')).length,0);
    // Correction at an already measured timestamp invalidates and notifies without touching issued snapshots.
    await db.query('UPDATE telemetry_raw SET total_energy_kwh=135 WHERE device_id=$1 AND source_time=$2',[devices[0],'2026-01-02T17:00:00Z']);
    assert.ok(Number((await db.query("SELECT count(*) FROM energy_financial_impact_notices WHERE device_id=$1 AND reason='raw_correction'",[devices[0]])).rows[0].count)>=1);
    while(await job.runBatch(10)) {}
    assert.deepEqual((await reader.daily([sites[0]!],'2026-01-02','2026-01-02')).map(r=>r.kwh),[35]);
    const localDay=new Date(Date.now()+7*3600000).toISOString().slice(0,10);
    await put(localDay+'T00:00:00+07:00',1000);await put(new Date().toISOString(),1025);
    while(await job.runBatch(10)) {}
    const current=(await reader.daily([sites[0]!],localDay,localDay))[0]!;
    assert.equal(current.quality,'partial');assert.equal(current.kwh,25);assert.ok(current.watermark);
    // A bounded day cannot silently return a truncated total or pretend missing sensor data.
    await put('2026-01-09T17:00:00Z',0);await put('2026-01-10T17:00:00Z',5000);
    await db.query(`INSERT INTO telemetry_raw(id,device_id,site_id,source_time,received_time,raw_payload,normalized_value,unit,quality,ingestion_id,total_energy_kwh)
      SELECT gen_random_uuid(),$1,$2,timestamptz '2026-01-09 17:00:00Z'+n*interval '1 second',now(),'{}',n,'kWh','complete',gen_random_uuid()::text,n FROM generate_series(1,4097) n`,[devices[0],sites[0]]);
    while(await job.runBatch(10)) {}
    const over=(await reader.daily([sites[0]!],'2026-01-10','2026-01-10'))[0]!;
    assert.equal(over.kwh,null);assert.equal(over.reason,'sample_limit');
    // Organization generation and owner billing-meter energy have separate contracts.
    // HTTP authorization must still use the current persisted organization scope.
    const user=randomUUID(),owner=randomUUID(),email=`q3-${user}@example.test`,ownerEmail=`q3-owner-${owner}@example.test`,password='Q3-fixture-password-123!';
    const { AuthService }=await import('../../src/modules/identity/auth.service.js');
    const auth=new AuthService('readiness-test-access-secret-000000000000','readiness-test-refresh-secret-000000000000');
    await db.query("INSERT INTO users(id,email,display_name,role,status,password_hash,school_id) VALUES($1,$2,'Q3 actor','school_user','active',$3,$4)",[user,email,auth.hashPassword(password),schools[0]]);
    await db.query("INSERT INTO users(id,email,display_name,role,status,password_hash) VALUES($1,$2,'Q3 owner','owner','active',$3)",[owner,ownerEmail,auth.hashPassword(password)]);
    try {
      const base=process.env.READINESS_API_URL!,origin=process.env.READINESS_WEB_URL!;
      const login=async(actorEmail:string)=>{
        const response=await fetch(base+'/v1/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:actorEmail,password})});
        assert.equal(response.status,200);return (await response.json()).accessToken as string;
      };
      const token=await login(email),ownerToken=await login(ownerEmail);
      const get=(path:string)=>fetch(base+path,{headers:{Authorization:`Bearer ${token}`}});
      const getOwner=(path:string)=>fetch(base+path,{headers:{Authorization:`Bearer ${ownerToken}`}});
      const missing={value:null,quality:'missing',watermark:null,reason:'solar_logger_unavailable_or_ambiguous',reasons:['solar_logger_unavailable_or_ambiguous']};
      const summary=await get('/v1/dashboard/summary?start_date=2026-01-02&end_date=2026-01-02');
      assert.equal(summary.status,200);const json=await summary.json();
      assert.deepEqual(json.sites.map((s:any)=>s.id),[sites[0]]);assert.equal(json.stats.periodKwh,null);assert.equal(json.sites[0].productionKwh,null);
      assert.deepEqual(json.production,[{date:'2026-01-02',...missing}]);assert.deepEqual(json.rankings,[]);
      const production=await get('/v1/dashboard/production?start_date=2026-01-02&end_date=2026-01-02');
      assert.equal(production.status,200);assert.deepEqual(await production.json(),[{label:'2026-01-02',unit:'kWh',...missing}]);
      const meterSummary=await getOwner(`/v1/dashboard/summary?site_id=${sites[0]}&start_date=2026-01-02&end_date=2026-01-02`);
      assert.equal(meterSummary.status,200);const meterJson=await meterSummary.json();
      assert.deepEqual(meterJson.sites.map((s:any)=>s.id),[sites[0]]);assert.equal(meterJson.stats.periodKwh,35);assert.equal(meterJson.energyReadModel.enabled,true);
      const meterProduction=await getOwner(`/v1/dashboard/production?site_id=${sites[0]}&start_date=2026-01-02&end_date=2026-01-02`);
      assert.equal(meterProduction.status,200);const measured=await meterProduction.json();
      assert.equal(measured[0].value,35);assert.equal(measured[0].quality,'complete');assert.ok(measured[0].watermark);
      const limited=await getOwner(`/v1/dashboard/production?site_id=${sites[0]}&start_date=2026-01-10&end_date=2026-01-10`);
      assert.equal(limited.status,200);const unavailable=await limited.json();assert.equal(unavailable[0].value,null);assert.equal(unavailable[0].reason,'sample_limit');
      assert.equal((await get(`/v1/dashboard/summary?site_id=${sites[1]}&start_date=2026-01-02&end_date=2026-01-02`)).status,403);
      assert.equal((await get(`/v1/dashboard/compare?metric=periodKwh&site_ids=${sites[1]}&start_date=2026-01-02&end_date=2026-01-02`)).status,403);
      await db.query('UPDATE users SET school_id=$1 WHERE id=$2',[schools[1],user]);
      const changed=await get('/v1/dashboard/summary?start_date=2026-01-02&end_date=2026-01-02');
      assert.equal(changed.status,200);const other=await changed.json();
      assert.equal(other.stats.periodKwh,null);assert.deepEqual(other.sites.map((s:any)=>s.id),[sites[1]]);assert.deepEqual(other.production,[{date:'2026-01-02',...missing}]);
      assert.equal((await get(`/v1/dashboard/summary?site_id=${sites[0]}&start_date=2026-01-02&end_date=2026-01-02`)).status,403);
      const otherMeter=await getOwner(`/v1/dashboard/summary?site_id=${sites[1]}&start_date=2026-01-02&end_date=2026-01-02`);
      assert.equal(otherMeter.status,200);const otherMeasured=await otherMeter.json();
      assert.equal(otherMeasured.stats.periodKwh,99);assert.deepEqual(otherMeasured.sites.map((s:any)=>s.id),[sites[1]]);
    } finally {await db.query('DELETE FROM auth_sessions WHERE user_id=ANY($1::uuid[])',[[user,owner]]);await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[[user,owner]]);}
    // Checkpoint survives a new worker instance; coverage is gated until refresh.
    const checkpoint='q3-'+randomUUID();let queued=0,result;
    do {result=await job.backfill(checkpoint,'2026-01-02','2026-01-05',3);queued+=result.queued;}while(!result.complete);
    assert.equal(queued,8);assert.deepEqual(await new RefreshEnergySummaryJob(db).backfill(checkpoint,'2026-01-02','2026-01-05',3),{queued:0,complete:true});
    assert.equal((await reader.daily([sites[0]!],'2026-01-02','2026-01-02'))[0]!.quality,'preparing');
    while(await job.runBatch(10)) {}
    assert.equal((await reader.daily([sites[0]!],'2026-01-05','2026-01-05'))[0]!.quality,'missing');
    await assert.rejects(job.backfill(checkpoint,'2026-01-02','2026-01-06',3),/range mismatch/);
    await db.query('DELETE FROM energy_backfill_checkpoints WHERE name=$1',[checkpoint]);
    // Prospective mapping publication uses the real interface and leaves measured history unchanged.
    const {TelemetryController}=await import('../../src/modules/telemetry/telemetry.controller.js');
    const controller=new TelemetryController({pool:db} as any,{} as any);
    const mapping=(await controller.saveDeviceRegisterMapping(devices[0]!,{semanticField:'total_energy',registerAddress:'0',dataType:'uint16',scale:1,unit:'kWh'})).id;
    assert.ok((await db.query('SELECT 1 FROM energy_dirty_days WHERE device_id=$1 AND day=$2',[devices[0],localDay])).rows.length);
    assert.ok((await db.query("SELECT 1 FROM energy_financial_impact_notices WHERE device_id=$1 AND reason='mapping_change'",[devices[0]])).rows.length);
    await db.query('DELETE FROM register_mapping_versions WHERE id=$1',[mapping]);
    while(await job.runBatch(10)) {}
    // Late sample after a long gap must invalidate the actual successor day as well.
    await put('2026-02-01T17:00:00Z',6000);await put('2026-02-06T17:00:00Z',6010);while(await job.runBatch(10)) {}
    await put('2026-02-02T05:00:00Z',6005);
    assert.ok((await db.query("SELECT 1 FROM energy_financial_impact_notices WHERE device_id=$1 AND reason='late_sample'",[devices[0]])).rows.length);
    assert.ok((await db.query("SELECT 1 FROM energy_dirty_days WHERE device_id=$1 AND day='2026-02-07'",[devices[0]])).rows.length);
    while(await job.runBatch(10)) {}
    // Rollback proves raw+dirty writes are one transaction, not eventual best effort.
    const tx=await db.connect();try{await tx.query('BEGIN');await tx.query(`INSERT INTO telemetry_raw(id,device_id,site_id,source_time,received_time,raw_payload,quality,ingestion_id,total_energy_kwh)
      VALUES(gen_random_uuid(),$1,$2,'2026-03-01',now(),'{}','complete','q3-rollback',6500)`,[devices[0],sites[0]]);await tx.query('ROLLBACK');}finally{tx.release();}
    assert.equal((await db.query("SELECT count(*) FROM telemetry_raw WHERE ingestion_id='q3-rollback'")).rows[0].count,'0');
    assert.equal((await db.query("SELECT count(*) FROM energy_dirty_days WHERE device_id=$1 AND day='2026-03-01'",[devices[0]])).rows[0].count,'0');
    // Both candidate indexes support actual latest/baseline query workloads.
    await db.query('ANALYZE telemetry_raw');
    const plans=[];for(const [sql,params] of [
      ['SELECT * FROM telemetry_raw WHERE site_id=$1 ORDER BY source_time DESC LIMIT 1',[sites[0]]],
      ["SELECT * FROM telemetry_raw WHERE device_id=$1 AND source_time<='2026-01-02T17:00Z' ORDER BY source_time DESC LIMIT 1",[devices[0]]],
    ] as const)plans.push((await db.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+sql,[...params])).rows[0]['QUERY PLAN']);
    const measured=[];const bench=await db.connect();
    try {
      for(const candidate of [false,true]) {
        await bench.query('BEGIN');
        if(!candidate){await bench.query('DROP INDEX telemetry_raw_site_time_idx');await bench.query('DROP INDEX telemetry_raw_device_time_idx');}
        const result=await bench.query(`EXPLAIN (ANALYZE,BUFFERS,WAL,FORMAT JSON) INSERT INTO telemetry_raw(id,device_id,site_id,source_time,received_time,raw_payload,quality,ingestion_id,total_energy_kwh)
          SELECT gen_random_uuid(),$1,$2,timestamptz '2026-04-01'+n*interval '1 minute',now(),'{}','complete',gen_random_uuid()::text,n FROM generate_series(1,200) n`,[devices[0],sites[0]]);
        measured.push({candidateIndexes:candidate,rows:200,plan:result.rows[0]['QUERY PLAN']});await bench.query('ROLLBACK');
      }
    }finally{await bench.query('ROLLBACK');bench.release();}
    const {mkdir,writeFile}=await import('node:fs/promises');await mkdir('../../test/artifacts',{recursive:true});
    const fixtureRawRows=Number((await db.query('SELECT count(*) FROM telemetry_raw WHERE device_id=ANY($1::uuid[])',[devices])).rows[0].count);
    await writeFile('../../test/artifacts/q3-plans-'+randomUUID()+'.json',JSON.stringify({rawFixtureRows:fixtureRawRows,plans,writeCost:measured,limitation:'Small isolated fixture; no production capacity or 2-second claim.'},null,2));
    // The deployed worker owns this claim, and an abrupt kill must retain dirty work.
    const until=async(check:()=>Promise<boolean>,timeout=15000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await new Promise(r=>setTimeout(r,50));}assert.fail('Timed out waiting for Q3 owned worker/ACK');};
    compose('restart','api');await until(async()=>{try{return(await fetch(process.env.READINESS_API_URL!+'/ready')).ok;}catch{return false;}});
    await put(new Date().toISOString(),1026);
    const blocked=await db.connect();const transport=mqtt.connect('mqtt://127.0.0.1:18883');
    const acknowledgments:any[]=[];transport.on('message',(_topic,body)=>acknowledgments.push(JSON.parse(body.toString())));
    try {
      await blocked.query('BEGIN');await blocked.query('LOCK TABLE energy_daily IN SHARE MODE');
      compose('start','worker');
      assert.match(compose('exec','-T','worker','cat','/proc/1/cmdline').toString(),/^node\0/);
      await until(async()=>Number((await db.query("SELECT count(*) FROM pg_stat_activity WHERE application_name='solar-worker-energy' AND wait_event_type='Lock'")).rows[0].count)>0);
      await until(async()=>transport.connected);
      await new Promise<void>((resolve,reject)=>transport.subscribe(`energy/${gateways[0]}/response`,{qos:1},e=>e?reject(e):resolve()));
      const payload=JSON.stringify({deviceId:devices[0],gateway:gateways[0],sourceTime:new Date().toISOString(),ingestionId:'q3-worker-lock',metrics:{totalEnergy:1027}});
      const started=performance.now();await new Promise<void>((resolve,reject)=>transport.publish(`energy/${gateways[0]}/telemetry`,payload,{qos:1},e=>e?reject(e):resolve()));
      await until(async()=>Number((await db.query("SELECT count(*) FROM pg_stat_activity WHERE application_name='solar-api-ingestion' AND wait_event_type='Lock'")).rows[0].count)>0);
      assert.equal(acknowledgments.length,0,'No ACK before dirty-day lock allows COMMIT');
      compose('kill','-s','SIGKILL','worker');await blocked.query('ROLLBACK');
      await until(async()=>acknowledgments.length===1);
      const ackMs=performance.now()-started;
      assert.equal(acknowledgments[0].duplicate,false);
      assert.equal((await db.query("SELECT count(*) FROM telemetry_raw WHERE device_id=$1 AND raw_payload->>'ingestionId'='q3-worker-lock'",[devices[0]])).rows[0].count,'1');
      assert.ok((await db.query('SELECT 1 FROM energy_dirty_days WHERE device_id=$1 AND day=$2',[devices[0],localDay])).rows.length,'Killed worker transaction rolls back its claim');
      compose('start','worker');await until(async()=>Number((await db.query('SELECT count(*) FROM energy_dirty_days WHERE device_id=$1',[devices[0]])).rows[0].count)===0);
      assert.equal((await reader.daily([sites[0]!],localDay,localDay))[0]!.kwh,27);
      await new Promise<void>((resolve,reject)=>transport.publish(`energy/${gateways[0]}/telemetry`,payload,{qos:1},e=>e?reject(e):resolve()));
      await until(async()=>acknowledgments.length===2);assert.equal(acknowledgments[1].duplicate,true);
      const openStarted=performance.now();
      const openPayload=JSON.stringify({deviceId:devices[0],gateway:gateways[0],sourceTime:new Date().toISOString(),ingestionId:'q3-worker-open',metrics:{totalEnergy:1028}});
      await new Promise<void>((resolve,reject)=>transport.publish(`energy/${gateways[0]}/telemetry`,openPayload,{qos:1},e=>e?reject(e):resolve()));
      await until(async()=>acknowledgments.length===3);const openAckMs=performance.now()-openStarted;
      assert.equal(acknowledgments[2].duplicate,false);
      await until(async()=>Number((await db.query('SELECT count(*) FROM energy_dirty_days WHERE device_id=$1',[devices[0]])).rows[0].count)===0);
      assert.equal((await reader.daily([sites[0]!],localDay,localDay))[0]!.kwh,28);
      await writeFile('../../test/artifacts/q3-worker-ack-'+randomUUID()+'.json',JSON.stringify({blockedAckMs:ackMs,unblockedAckMs:openAckMs,workerKillRetainedDirty:true,restartedWorkerPartialKwh:27,retryDuplicate:true,limitation:'Artificial lock proves transaction/ACK ordering and recovery; one unblocked ACK is not a throughput or latency SLO claim.'},null,2));
    } finally {await blocked.query('ROLLBACK');blocked.release();transport.end(true);compose('stop','worker');}

  } finally {
    await db.query('DELETE FROM telemetry_raw WHERE device_id=ANY($1::uuid[])',[devices]);
    await db.query('DELETE FROM telemetry_archive_dirty WHERE site_id=ANY($1::uuid[])',[sites]);
    await db.query('DELETE FROM telemetry_archive_scan WHERE site_id=ANY($1::uuid[])',[sites]);
    await db.query('DELETE FROM telemetry_aggregate WHERE device_id=ANY($1::uuid[])',[devices]);
    await db.query('DELETE FROM billing_meters WHERE device_id=ANY($1::uuid[])',[devices]);
    await db.query('DELETE FROM devices WHERE id=ANY($1::uuid[])',[devices]);
    await db.query('DELETE FROM gateways WHERE id=ANY($1::uuid[])',[gateways]);
    await db.query('DELETE FROM sites WHERE id=ANY($1::uuid[])',[sites]);
    await db.query('DELETE FROM schools WHERE id=ANY($1::uuid[])',[schools]);await db.end();
  }
});






// Q3 fix round 1: deployment rendering and real-database regression cases.
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
test('[Q3 fix1] staging renders the worker scheduling flag with safe default',()=>{
  const yaml=readFileSync('../../infra/docker/docker-compose.staging.yml','utf8');
  const environment={...process.env} as Record<string,string>;
  for(const match of yaml.matchAll(/\$\{([A-Z_]+):\?[^}]*\}/g))environment[match[1]!]=match[1]!.endsWith('_IMAGE')?'fixture:unused':'fixture-unused';
  environment.DATABASE_URL='postgresql://solar:fixture@127.0.0.1:15432/solar_readiness';
  mkdirSync('../../test/artifacts',{recursive:true});
  const envPath=`../../test/artifacts/q3-${randomUUID()}.env`;writeFileSync(envPath,'# isolated config fixture\n');
  const render=()=>JSON.parse(execFileSync('docker',['compose','--env-file',envPath,'-f','../../infra/docker/docker-compose.staging.yml','config','--format','json'],{env:environment,stdio:['ignore','pipe','pipe']}).toString());
  try {
    delete environment.ENERGY_SUMMARY_WORKER_ENABLED;
    assert.equal(render().services.worker.environment.ENERGY_SUMMARY_WORKER_ENABLED,'false');
    environment.ENERGY_SUMMARY_WORKER_ENABLED='true';
    assert.equal(render().services.worker.environment.ENERGY_SUMMARY_WORKER_ENABLED,'true');
  } finally {unlinkSync(envPath);}
});

async function withFix1Fixture(count:number,run:(fixture:{db:Pool;sites:string[];devices:string[];mappings:string[][]})=>Promise<void>) {
  const db=new Pool({connectionString:assertIsolatedDatabase(process.env.READINESS_DATABASE_URL!)});
  const compose=(...args:string[])=>execFileSync('docker',['compose','-f','infra/ci/compose.yml',...args],{cwd:new URL('../../../../',import.meta.url),stdio:'pipe'});
  assert.match(process.env.COMPOSE_PROJECT_NAME??'',/^solar-ci-[a-f0-9-]{36}$/);compose('stop','worker');
  const schools:string[]=[],sites:string[]=[],gateways:string[]=[],devices:string[]=[],mappings:string[][]=[];
  try {
    for(let i=0;i<count;i++) {
      const school=randomUUID(),site=randomUUID(),gateway=randomUUID(),device=randomUUID();schools.push(school);sites.push(site);gateways.push(gateway);devices.push(device);
      await db.query("INSERT INTO schools(id,name,code,region) VALUES($1::uuid,'Q3 fix1',$1::text,'fixture')",[school]);
      await db.query("INSERT INTO sites(id,school_id,name,capacity_mwp) VALUES($1,$2,'Q3 fix1',0.1)",[site,school]);
      await db.query("INSERT INTO gateways(id,site_id,name,protocol,endpoint) VALUES($1::uuid,$2,$1::text,'mqtt','energy/'||$1::text||'/#')",[gateway,site]);
      await db.query("INSERT INTO devices(id,gateway_id,site_id,name,device_type,model,serial_number) VALUES($1::uuid,$2,$3,'Q3 fix1 meter','meter','fixture',$1::text)",[device,gateway,site]);
      await db.query('INSERT INTO billing_meters(id,site_id,device_id) VALUES($1,$2,$3)',[randomUUID(),site,device]);
      const mapping=[randomUUID(),randomUUID()];mappings.push(mapping);
      for(const id of mapping)await db.query("INSERT INTO register_mapping_versions(id,device_id,semantic_field,register_address,data_type,byte_order,scale,unit,effective_from,effective_to) VALUES($1,$2,'total_energy','0','uint16','big_endian',1,'kWh','2026-01-01','2026-06-01')",[id,device]);
    }
    await run({db,sites,devices,mappings});
  }finally{
    await db.query('DELETE FROM telemetry_raw WHERE device_id=ANY($1::uuid[])',[devices]);
    await db.query('DELETE FROM telemetry_archive_dirty WHERE site_id=ANY($1::uuid[])',[sites]);
    await db.query('DELETE FROM telemetry_archive_scan WHERE site_id=ANY($1::uuid[])',[sites]);
    await db.query('DELETE FROM telemetry_aggregate WHERE device_id=ANY($1::uuid[])',[devices]);
    await db.query('DELETE FROM billing_meters WHERE device_id=ANY($1::uuid[])',[devices]);
    await db.query('DELETE FROM register_mapping_versions WHERE device_id=ANY($1::uuid[])',[devices]);
    await db.query('DELETE FROM devices WHERE id=ANY($1::uuid[])',[devices]);await db.query('DELETE FROM gateways WHERE id=ANY($1::uuid[])',[gateways]);
    await db.query('DELETE FROM sites WHERE id=ANY($1::uuid[])',[sites]);await db.query('DELETE FROM schools WHERE id=ANY($1::uuid[])',[schools]);await db.end();
  }
}

test('[Q3 fix1] multi-site metadata has stable severity and retains every unknown reason',async()=>withFix1Fixture(2,async({db,sites,devices})=>{
  const {EnergyReadService}=await import('../../src/modules/dashboard/energy-read.service.js');
  const {DashboardService}=await import('../../src/modules/dashboard/dashboard.service.js');
  const {DashboardController}=await import('../../src/modules/dashboard/dashboard.controller.js');
  const adapter={query:db.query.bind(db)} as any;
  const controller=new DashboardController(new DashboardService(adapter,new EnergyReadService(adapter)));
  const old=process.env.ENERGY_READ_MODEL_ENABLED;process.env.ENERGY_READ_MODEL_ENABLED='true';
  const day=new Date(Date.now()+7*3600000).toISOString().slice(0,10);
  const order=sites.map((site,i)=>({site,device:devices[i]!})).sort((a,b)=>a.site.localeCompare(b.site));
  try {
    for(const reverse of [false,true])for(const situation of ['reset','preparing','reasons'] as const) {
      await db.query('DELETE FROM energy_dirty_days WHERE device_id=ANY($1::uuid[])',[devices]);
      for(let i=0;i<2;i++) {
        const unknown=i===(reverse?1:0);const quality=unknown?(situation==='reset'?'reset':'missing'):(situation==='reasons'?'missing':'partial');
        const reason=unknown?(situation==='reset'?'reset':'sample_limit'):(situation==='reasons'?'boundary_missing':null);
        await db.query(`INSERT INTO energy_daily(device_id,site_id,day,sample_count,kwh,quality,reason,version,closing_at) VALUES($1,$2,$3,1,$4,$5,$6,1,now())
          ON CONFLICT(device_id,day) DO UPDATE SET kwh=EXCLUDED.kwh,quality=EXCLUDED.quality,reason=EXCLUDED.reason`,[order[i]!.device,order[i]!.site,day,quality==='partial'?7:null,quality,reason]);
        if(unknown&&situation==='preparing')await db.query('INSERT INTO energy_dirty_days(device_id,day) VALUES($1,$2)',[order[i]!.device,day]);
      }
      const result=await controller.getProduction({user:{role:'owner',assignedSiteIds:sites}},{start_date:day,end_date:day});
      assert.equal(result[0]!.value,null);
      assert.equal(result[0]!.quality,situation==='reasons'?'missing':situation,`stable severity ${situation}, reverse=${reverse}`);
      const expected=situation==='reasons'?['boundary_missing','sample_limit']:[situation==='reset'?'reset':'sample_limit'];
      assert.deepEqual((result[0] as any).reasons,expected,`all reasons ${situation}, reverse=${reverse}`);
      assert.equal(result[0]!.reason,expected.join(','));
    }
  }finally{if(old===undefined)delete process.env.ENERGY_READ_MODEL_ENABLED;else process.env.ENERGY_READ_MODEL_ENABLED=old;}
}));

test('[Q3 fix1] midnight and sample evidence reject mapping NULL conflicts and invalid duplicate quality',async(t)=>{
  for(const location of ['opening','sample'] as const)for(const conflict of ['mapping','null_mapping','invalid_quality'] as const)await t.test(location+' '+conflict,async()=>withFix1Fixture(1,async({db,devices,sites,mappings})=>{
    const {RefreshEnergySummaryJob}=await import('../../../worker/src/jobs/refresh-energy-summary.job.js');
    const {EnergyReadService}=await import('../../src/modules/dashboard/energy-read.service.js');
    const put=async(at:string,kwh:number,mapping:string|null,quality='complete')=>db.query(`INSERT INTO telemetry_raw(id,device_id,site_id,source_time,received_time,raw_payload,quality,ingestion_id,total_energy_kwh,mapping_version_id)
      VALUES(gen_random_uuid(),$1,$2,$3,clock_timestamp(),'{}',$4,gen_random_uuid()::text,$5,$6)`,[devices[0],sites[0],at,quality,kwh,mapping]);
    const a=mappings[0]![0]!,b=mappings[0]![1]!;
    const good=conflict==='mapping'?b:a;
    await put('2026-01-20T17:00:00Z',100,location==='opening'?(conflict==='mapping'?a:conflict==='null_mapping'?null:good):good,location==='opening'&&conflict==='invalid_quality'?'invalid':'complete');
    if(location==='opening')await put('2026-01-20T17:00:00Z',100,good);
    if(location==='sample') {await put('2026-01-21T05:00:00Z',110,conflict==='mapping'?a:conflict==='null_mapping'?null:good,conflict==='invalid_quality'?'invalid':'complete');await put('2026-01-21T05:00:00Z',110,good);}
    await put('2026-01-21T17:00:00Z',125,good);
    const job=new RefreshEnergySummaryJob(db);while(await job.runBatch(64)){}
    const actual=(await new EnergyReadService({query:db.query.bind(db)} as any).daily([sites[0]!],'2026-01-21','2026-01-21'))[0]!;
    assert.equal(actual.quality,'missing',location+' '+conflict);assert.equal(actual.kwh,null,location+' '+conflict);
  }));
});

test('[Q3 fix1] mapping-only raw correction atomically dirties and creates pending notice',async()=>withFix1Fixture(1,async({db,devices,sites,mappings})=>{
  const {RefreshEnergySummaryJob}=await import('../../../worker/src/jobs/refresh-energy-summary.job.js');
  const {EnergyReadService}=await import('../../src/modules/dashboard/energy-read.service.js');
  const job=new RefreshEnergySummaryJob(db),reader=new EnergyReadService({query:db.query.bind(db)} as any);
  for(const [at,kwh] of [['2026-01-20T17:00:00Z',100],['2026-01-21T17:00:00Z',125]] as const)await db.query(`INSERT INTO telemetry_raw(id,device_id,site_id,source_time,received_time,raw_payload,quality,ingestion_id,total_energy_kwh,mapping_version_id)
    VALUES(gen_random_uuid(),$1,$2,$3,now(),'{}','complete',gen_random_uuid()::text,$4,$5)`,[devices[0],sites[0],at,kwh,mappings[0]![0]]);
  while(await job.runBatch(64)){}
  assert.equal((await reader.daily([sites[0]!],'2026-01-21','2026-01-21'))[0]!.kwh,25);
  await db.query('UPDATE telemetry_raw SET mapping_version_id=$1 WHERE device_id=$2 AND source_time=$3',[mappings[0]![1],devices[0],'2026-01-21T17:00:00Z']);
  assert.equal((await reader.daily([sites[0]!],'2026-01-21','2026-01-21'))[0]!.quality,'preparing');
  const notices=await db.query("SELECT status FROM energy_financial_impact_notices WHERE device_id=$1 AND day='2026-01-21' AND reason='raw_correction'",[devices[0]]);
  assert.equal(notices.rows[0]?.status,'pending');
  while(await job.runBatch(64)){}
  const actual=(await reader.daily([sites[0]!],'2026-01-21','2026-01-21'))[0]!;assert.equal(actual.kwh,null);assert.equal(actual.quality,'missing');
}));
