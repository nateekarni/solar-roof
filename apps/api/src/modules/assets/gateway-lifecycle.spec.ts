import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { HttpException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import type { MqttIngestionService } from '../telemetry/mqtt-ingestion.service.js';
import { AssetsController } from './assets.controller.js';
import { TelemetryController } from '../telemetry/telemetry.controller.js';
import { PayloadReceptionSettings } from '../telemetry/payload-reception-settings.js';
import { acknowledgeGatewayConfiguration, lifecycleState, snapshotGatewayConfiguration, guardLegacyGatewayConfiguration } from './gateway-lifecycle.js';

test('configuration snapshots supply the application canonical hash required by migration 066', async () => {
 const queries: {sql:string;values:unknown[]}[]=[];
 const gateway={id:'11111111-1111-4111-8111-111111111111',version:2,endpoint:'energy/GW-001/#',pollingIntervalSeconds:10,alertRules:{voltageMin:200,voltageMax:250},gatewayId:'GW-001'};
 const client={query:async(sql:string,values:unknown[]=[])=>{
  queries.push({sql,values});
  if(sql.startsWith('SELECT site_id FROM gateways'))return {rows:[{site_id:'site'}]};
  if(sql.includes('FROM sites WHERE'))return {rows:[{id:'site'}]};
  if(sql.includes('FROM gateways WHERE'))return {rows:[gateway]};
  return {rows:[]};
 }} as unknown as PoolClient;
 const result=await snapshotGatewayConfiguration(client,gateway.id);
 const insert=queries.find(query=>query.sql.startsWith('INSERT INTO gateway_configuration_revisions'));
 assert.ok(insert);
 // This canonical UTF-8 fixture is independent of the production canonicalizer.
 const canonical='{"alertRules":{"voltageMax":250,"voltageMin":200},"devices":[],"endpoint":"energy/GW-001/#","gatewayId":"GW-001","id":"11111111-1111-4111-8111-111111111111","pollingIntervalSeconds":10,"receiveConfig":{},"receiveRevisionId":null,"version":3}';
 assert.equal(insert.values[4],createHash('sha256').update(canonical,'utf8').digest('hex'));
 assert.match(insert.sql,/\(id,gateway_id,version,config,config_hash\) VALUES\(\$1,\$2,\$3,\$4::jsonb,\$5\)/);
 assert.equal(insert.values[1],gateway.id);
 assert.equal(insert.values[2],3);
 assert.deepEqual(JSON.parse(String(insert.values[3])),JSON.parse(canonical));
 assert.equal(result.version,3);
 assert.deepEqual(result.config,JSON.parse(canonical));
 assert.deepEqual(queries.at(-1)?.values,[gateway.id,3]);
});
test('publish success does not claim hardware acknowledgement or application',()=>{
 assert.deepEqual(lifecycleState({desired:4,published:4,acknowledged:3,applied:2}),{desiredVersion:4,publishedVersion:4,acknowledgedVersion:3,appliedVersion:2,state:'awaiting-acknowledgement'});
});
test('acknowledged hardware is still awaiting application until the same revision is applied',()=>{
 assert.equal(lifecycleState({desired:4,published:4,acknowledged:4,applied:3}).state,'awaiting-application');
 assert.equal(lifecycleState({desired:4,published:4,acknowledged:4,applied:4}).state,'applied');
});

function mutationFixture(managed: boolean, archived = false) {
 const writes: string[] = [], committed: string[] = [], calls: string[] = [];
 let publications=0;
 const query=async(sql:string)=>{
  calls.push(sql);
  if(sql==='BEGIN')return {rows:[]};
  if(sql==='ROLLBACK'){writes.length=0;return {rows:[]};}
  if(sql==='COMMIT'){committed.push(...writes);return {rows:[]};}
  if(/^(INSERT|UPDATE)/.test(sql.trim())){writes.push(sql);return {rows:[{id:'device'}]};}
  if(sql.includes('FROM sites WHERE'))return {rows:archived&&sql.includes("status<>'archived'")?[]:[{id:'site',external_site_id:'S1',customer_id:'customer'}]};
  if(sql.includes('SELECT id FROM gateways WHERE external_gateway_id=$1'))return {rows:[]};
  if(sql.includes('FROM gateways g JOIN sites'))return {rows:[{id:'gateway',gatewayId:'gateway',name:'GW',site_id:'site',external_site_id:'S1',endpoint:'solar/v1/sites/S1/gateways/G1/devices/+/telemetry',externalSiteId:'S1',externalGatewayId:'G1',controlManaged:managed}]};
  if(sql.includes('FROM devices WHERE id::text')||sql.includes('SELECT id,gateway_id'))return {rows:[{id:'device',gateway_id:'gateway',site_id:'site'}]};
  if(sql.includes('FROM devices d WHERE d.id='))return {rows:[{id:'device',gateway_id:'gateway',site_id:'site',external_device_id:'M1',device_type:'meter',profile_device_type:'energy-meter',billing:false}]};
  if(sql.includes('SELECT * FROM gateways WHERE site_id='))return {rows:[{id:'gateway',site_id:'site',external_gateway_id:'G1',name:'GW',endpoint:'solar/v1/sites/S1/gateways/G1/devices/+/telemetry'}]};
  if(sql.includes('FROM gateways WHERE'))return {rows:[{id:'gateway',site_id:'site',name:'GW',version:1,endpoint:'solar/v1/sites/S1/gateways/G1/devices/+/telemetry',gatewayId:'G1',controlManaged:managed}]};
  if(sql.includes('AS "controlManaged"'))return {rows:[{controlManaged:managed}]};
  return {rows:[]};
 };
 const db={query,pool:{connect:async()=>({query,release(){}})},transaction:DatabaseService.prototype.transaction} as unknown as DatabaseService;
 const mqtt={refreshSubscriptions:async()=>{},publishHardwareConfig:async()=>{publications++;return false;}} as unknown as MqttIngestionService;
 return {db,committed,calls,controller:new AssetsController(db,mqtt),get publications(){return publications;}};
}

for(const status of ['online','offline'])test(`archived unmanaged site can restore status to ${status}`,async()=>{
 const f=mutationFixture(false,true);const result=await f.controller.updateSite('site',{status});
 assert.equal(result.success,true);assert.ok(f.committed.some(sql=>sql.startsWith('UPDATE sites')));
 assert.ok(f.committed.some(sql=>sql.startsWith('UPDATE gateways')));
});

test('archived managed restoration cannot smuggle a technical edit with site status',async()=>{
 const f=mutationFixture(true,true);
 await assert.rejects(f.controller.updateSite('site',{status:'online',pollingIntervalSeconds:30}),e=>e instanceof HttpException&&e.getStatus()===409);
 assert.equal(f.committed.length,0);
});

// Break caught: a legacy mutation must not replace an admin-approved control-plane
// snapshot or leave any device/profile/register write committed before rejection.
test('managed gateway refuses legacy cadence mutation before any device write',async()=>{
 const f=mutationFixture(true);
 await assert.rejects(f.controller.saveDeviceCadence('device',{expectedIntervalSeconds:30,pollGroups:{energy:30}}),
  e=>e instanceof HttpException&&e.getStatus()===409);
 assert.ok(!f.calls.some(sql=>sql.startsWith('UPDATE devices')));
 assert.deepEqual(f.committed,[]);assert.equal(f.calls.at(-1),'ROLLBACK');
 assert.ok(!f.calls.some(sql=>sql.startsWith('INSERT INTO gateway_configuration_revisions')));
});

test('managed gateway refuses legacy local profile replacement without persisting its new revision',async()=>{
 const f=mutationFixture(true);
 await assert.rejects(f.controller.upgradePayloadProfile('device',{localOverrideConfig:{id:'admin',version:'1.0.0',schemaVersion:'1.1',
  displayName:'Meter',deviceType:'energy-meter',pollGroups:['energy'],fields:[{tag:'energy.active.import.total',displayName:'Import',pollGroup:'energy',sourceUnit:'Wh',targetUnit:'kWh',conversion:'wh-to-kwh'}]}}),
  e=>e instanceof HttpException&&e.getStatus()===409);
 assert.ok(!f.calls.some(sql=>sql.startsWith('INSERT INTO payload_profile_revisions')));
 assert.ok(!f.calls.some(sql=>/FROM devices[\s\S]*FOR UPDATE/.test(sql)));
 assert.deepEqual(f.committed,[]);assert.equal(f.calls.at(-1),'ROLLBACK');
});

test('managed snapshot rejection also rolls back preceding register configuration writes',async()=>{
 const f=mutationFixture(true);
 await assert.rejects(f.db.transaction(async client=>{
  await client.query('UPDATE register_mapping_versions SET effective_to=now() WHERE device_id=$1',['device']);
  await snapshotGatewayConfiguration(client,'gateway');
 }),e=>e instanceof HttpException&&e.getStatus()===409);
 assert.deepEqual(f.committed,[]);assert.equal(f.calls.at(-1),'ROLLBACK');
});

test('legacy gateway still accepts cadence changes and creates a hashed desired revision',async()=>{
 const f=mutationFixture(false);
 const result=await f.controller.saveDeviceCadence('device',{expectedIntervalSeconds:30,pollGroups:{energy:30}});
 assert.equal(result.desiredVersion,2);
 assert.ok(f.committed.some(sql=>sql.startsWith('UPDATE devices')));
 assert.ok(f.committed.some(sql=>sql.startsWith('INSERT INTO gateway_configuration_revisions')));
 assert.equal(f.calls.at(-1),'COMMIT');
});

test('legacy hashless ACK cannot acknowledge or apply a control-plane config revision',async()=>{
 const writes:string[]=[];
 const query=async(sql:string)=>{
  if(/FROM gateways g JOIN sites/.test(sql))return {rows:/r\.config->>'messageType'\)? IS DISTINCT FROM 'config'/.test(sql)?[]:[{id:'gateway'}]};
  if(sql.startsWith('UPDATE'))writes.push(sql);
  return {rows:[]};
 };
 const db={transaction:async(work:(client:unknown)=>Promise<unknown>)=>work({query})} as unknown as DatabaseService;
 assert.equal(await acknowledgeGatewayConfiguration(db,'S1','G1',null,1,true),false);
 assert.deepEqual(writes,[]);
});

function identityFixture() {
 const gateways:{id:string;site_id:string;external_gateway_id:string;retired_at?:string}[]=[{id:'00000000-0000-4000-8000-000000000001',site_id:'occupied',external_gateway_id:'TAKEN'}];
 const locks=new Map<string,Promise<void>>(),calls:{sql:string;values:unknown[]}[]=[];
 const connect=async()=>{
  const pending:typeof gateways=[];const unlocks:(()=>void)[]=[];
  const query=async(sql:string,values:unknown[]=[])=>{
   calls.push({sql,values});
   if(sql==='BEGIN')return {rows:[]};
   if(sql==='COMMIT'){gateways.push(...pending);unlocks.splice(0).forEach(unlock=>unlock());return {rows:[]};}
   if(sql==='ROLLBACK'){pending.length=0;unlocks.splice(0).forEach(unlock=>unlock());return {rows:[]};}
   if(sql.includes('pg_advisory_xact_lock')){
    const key=String(values[0]),prior=locks.get(key)??Promise.resolve();let release!:()=>void;
    const held=new Promise<void>(resolve=>{release=resolve;});locks.set(key,prior.then(()=>held));
    await prior;unlocks.push(release);return {rows:[]};
   }
   if(/SELECT id FROM gateways WHERE external_gateway_id=\$1/.test(sql))return {rows:[...gateways,...pending].filter(g=>g.external_gateway_id===values[0]&&g.id!==values[1]&&(!sql.includes('retired_at IS NULL')||!g.retired_at))};
   if(sql.includes('SELECT * FROM gateways WHERE site_id='))return {rows:gateways.filter(g=>g.site_id===values[0])};
   if(sql.startsWith('SELECT site_id FROM gateways'))return {rows:[...gateways,...pending].filter(g=>g.id===values[0]).length?
     [...gateways,...pending].filter(g=>g.id===values[0]):values[0]==='old'?[{id:'old',site_id:'site-a'}]:[]};
   if(sql.includes('SELECT id FROM sites WHERE'))return {rows:[{id:values[0]}]};
   if(sql.includes('SELECT * FROM gateways WHERE id='))return {rows:[...gateways,...pending].filter(g=>g.id===values[0]).length?
     [...gateways,...pending].filter(g=>g.id===values[0]):values[0]==='old'?[{id:'old',site_id:'site-a'}]:[]};
   if(sql.includes('SELECT g.site_id,s.external_site_id'))return {rows:[{site_id:'site-a',external_site_id:'SITE-A'}]};
   if(sql.includes('SELECT id,external_site_id FROM sites'))return {rows:[{id:values[0],external_site_id:'SITE-'+values[0]}]};
   if(sql.includes('INSERT INTO gateways(')){
    const row={id:String(values[0]),site_id:String(values[1]),external_gateway_id:String(values[4])};pending.push(row);
    return {rows:[{...row,name:values[2]}]};
   }
   if(sql.includes('FROM gateways WHERE id='))return {rows:[{id:values[0],version:0,controlManaged:false}]};
   if(sql.includes('INSERT INTO sites')||sql.includes('INSERT INTO customers'))return {rows:[{id:values[0]}]};
   return {rows:[]};
  };
  return {query,release(){}};
 };
 const db={pool:{connect},query:async(sql:string,values:unknown[]=[])=>{const c=await connect();return c.query(sql,values);},transaction:DatabaseService.prototype.transaction} as unknown as DatabaseService;
 const mqtt={refreshSubscriptions:async()=>{},publishHardwareConfig:async()=>false} as unknown as MqttIngestionService;
 return {controller:new AssetsController(db,mqtt),gateways,calls};
}

// Break caught: creating the same MQTT username on a different legacy site must
// conflict before new gateway/device records or retirement can be committed.
for(const path of ['configure','replace','create'] as const){
 test(`legacy ${path} rejects a globally occupied external gateway identity`,async()=>{
  const f=identityFixture();
  const operation=path==='configure'?f.controller.configureGateway('site-a',{name:'Different',externalGatewayId:'TAKEN'}):
   path==='replace'?f.controller.replaceGateway('old',{name:'Different',externalGatewayId:'TAKEN'}):
   f.controller.createSite({name:'New Site',customerName:'Customer',gatewayName:'Different',deviceSerial:'SERIAL',externalGatewayId:'TAKEN'});
  await assert.rejects(operation,e=>e instanceof HttpException&&e.getStatus()===409);
  assert.equal(f.gateways.length,1);assert.equal(f.calls.at(-1)?.sql,'ROLLBACK');
  assert.ok(!f.calls.some(c=>c.sql.startsWith('INSERT INTO devices')));
 });
}

test('parallel legacy gateway configuration reserves one external identity across two sites',async()=>{
 const f=identityFixture();
 const results=await Promise.allSettled([
  f.controller.configureGateway('site-a',{name:'First',externalGatewayId:'NEW'}),
  f.controller.configureGateway('site-b',{name:'Second',externalGatewayId:'NEW'}),
 ]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const rejected=results.find(r=>r.status==='rejected');assert.ok(rejected?.status==='rejected');
 assert.ok(rejected.reason instanceof HttpException&&rejected.reason.getStatus()===409);
 assert.equal(f.gateways.filter(g=>g.external_gateway_id==='NEW').length,1);
 const keys=f.calls.filter(c=>c.sql.includes('pg_advisory_xact_lock')).map(c=>c.values[0]);
 assert.deepEqual(keys,['gateway-identity:NEW','gateway-identity:NEW']);
});

test('legacy creation cannot recycle a retired external identity from credential history',async()=>{
 const f=identityFixture();f.gateways[0]!.retired_at='2026-10-18T00:00:00Z';
 await assert.rejects(f.controller.createSite({name:'New Site',customerName:'Customer',gatewayName:'New',deviceSerial:'SERIAL',externalGatewayId:'TAKEN'}),
  e=>e instanceof HttpException&&e.getStatus()===409);
 assert.equal(f.gateways.length,1);assert.equal(f.calls.at(-1)?.sql,'ROLLBACK');
});

for(const edit of [{mqttBrokerId:'broker'},{endpoint:'other'},{protocol:'mqtt'},{pollingIntervalSeconds:30},
 {deviceModel:'Other'},{deviceSerial:'Other'},{deviceId:'other'},{slaveId:3},{payloadProfileRevisionId:'other'},
 {registers:[]},{externalDeviceId:'other'},{localOverrideConfig:{}},{alertRules:{voltageMin:200}}]){
 test(`managed updateSite rejects technical changes ${JSON.stringify(edit)} without side effects`,async()=>{
  const f=mutationFixture(true);
  await assert.rejects(f.controller.updateSite('site',{name:'Business name',...edit}),e=>e instanceof HttpException&&e.getStatus()===409);
  assert.deepEqual(f.committed,[]);assert.equal(f.calls.at(-1),'ROLLBACK');assert.equal(f.publications,0);
 });
}

test('managed updateSite permits independent business metadata and site status without device edits',async()=>{
 const f=mutationFixture(true);await f.controller.updateSite('site',{name:'Business name',capacityMwp:1,status:'offline'});
 assert.ok(f.committed.some(sql=>sql.startsWith('UPDATE sites')));
 assert.ok(!f.committed.some(sql=>/UPDATE gateways|UPDATE devices/.test(sql)));assert.equal(f.publications,0);
});

test('managed configureHardware rejects inside its transaction before database or broker mutation',async()=>{
 const f=mutationFixture(true);
 await assert.rejects(f.controller.configureHardware('GW',{pollingIntervalSeconds:30,registers:[]}),e=>e instanceof HttpException&&e.getStatus()===409);
 assert.deepEqual(f.committed,[]);assert.equal(f.calls.at(-1),'ROLLBACK');assert.equal(f.publications,0);
});

test('legacy updateSite and configureHardware preserve technical updates and publication',async()=>{
 const f=mutationFixture(false);await f.controller.updateSite('site',{pollingIntervalSeconds:30});
 await f.controller.configureHardware('GW',{pollingIntervalSeconds:45});
 assert.ok(f.committed.filter(sql=>/UPDATE gateways/.test(sql)).length>=2);assert.equal(f.publications,2);
});

test('managed replacement cannot retire a gateway and move its devices outside onboarding approval',async()=>{
 const f=mutationFixture(true);
 await assert.rejects(f.controller.replaceGateway('gateway',{name:'Replacement',externalGatewayId:'NEW'}),e=>e instanceof HttpException&&e.getStatus()===409);
 assert.deepEqual(f.committed,[]);assert.equal(f.publications,0);assert.equal(f.calls.at(-1),'ROLLBACK');
});

const localProfile={id:'admin',version:'1.0.0',schemaVersion:'1.1',displayName:'Meter',deviceType:'energy-meter',pollGroups:['energy'],
 fields:[{tag:'energy.active.import.total',displayName:'Import',pollGroup:'energy',sourceUnit:'Wh',targetUnit:'kWh',conversion:'wh-to-kwh'}]};
for(const route of ['publish','configure','add','import','register save','register delete','reception'] as const){
 test(`managed ${route} rejects before device locks or technical writes`,async()=>{
  const f=mutationFixture(true),telemetry=new TelemetryController(f.db,{} as MqttIngestionService);
  const operation=route==='publish'?f.controller.publishGatewayConfiguration('gateway',{baseVersion:1}):
   route==='configure'?f.controller.configureGateway('site',{name:'GW'}):
   route==='add'?f.controller.addDevice('site',{name:'Meter',model:'Model',serialNumber:'REAL',externalDeviceId:'M2',localOverrideConfig:localProfile}):
   route==='import'?f.controller.importPayloadConfiguration('site',{baseVersion:0,devices:[],config:{}}):
   route==='register save'?telemetry.saveDeviceRegisterMapping('device',{semanticField:'voltage',registerAddress:'1',dataType:'uint16',scale:1,unit:'V'}):
   route==='register delete'?telemetry.deleteDeviceRegisterMapping('device','mapping'):
   new PayloadReceptionSettings(f.db).save('site',{baseVersion:0,config:{}});
  await assert.rejects(operation,e=>e instanceof HttpException&&e.getStatus()===409);
  assert.ok(!f.calls.some(sql=>/^(INSERT|UPDATE|DELETE)/.test(sql.trim())),'technical mutation before managed rejection');
  assert.ok(!f.calls.some(sql=>/FROM devices[\s\S]*FOR (UPDATE|SHARE)/.test(sql)),'device lock before managed rejection');
  assert.equal(f.calls.at(-1),'ROLLBACK');assert.equal(f.publications,0);
 });
}

test('dashboard source selection checks site before gateway/device locks while retaining managed support',async()=>{
 const device='11111111-1111-4111-8111-111111111111';
 for(const archived of [true,false]){
  const calls:string[]=[];
  const query=async(sql:string)=>{
   calls.push(sql);
   if(sql.includes('FROM sites WHERE'))return {rows:archived?[]:[{id:'site'}]};
   if(sql.includes('FROM gateways'))return {rows:[{id:'gateway',site_id:'site',controlManaged:true}]};
   if(sql.includes('FROM devices d'))return {rows:[{config:{fields:[{tag:'solar.total_yield',targetUnit:'kWh'}]}}]};
   return {rows:[]};
  };
  const db={query,transaction:async(work:(client:{query:typeof query})=>Promise<unknown>)=>work({query})} as unknown as DatabaseService;
  const operation=new AssetsController(db,{} as MqttIngestionService).setGatewayDashboardSources('gateway',{
   impactConfirmed:true,sources:{energy:{deviceId:device,tag:'solar.total_yield'}}},{user:{id:'actor'}});
  if(archived){await assert.rejects(operation,e=>e instanceof HttpException&&e.getStatus()===404);assert.ok(!calls.some(sql=>/FOR UPDATE|FOR SHARE OF d|^INSERT/.test(sql)));}
  else{await operation;const site=calls.findIndex(sql=>sql.includes('FOR KEY SHARE'));
   assert.ok(site>=0&&site<calls.findIndex(sql=>sql.includes('FOR UPDATE')));assert.ok(calls.some(sql=>sql.startsWith('INSERT INTO gateway_dashboard_sources')));}
 }
});

for(const changed of ['archived','moved','retired','wrong expected site'] as const)test(`shared early guard rejects ${changed} without technical writes`,async()=>{
 const query=async(sql:string,values:unknown[]=[])=>{
  if(sql.startsWith('SELECT site_id'))return {rows:[{site_id:'original'}]};
  if(sql.includes('FROM sites WHERE'))return {rows:changed==='archived'?[]:[{id:'original'}]};
  if(sql.startsWith('SELECT * FROM gateways'))return {rows:changed==='moved'&&sql.includes('site_id=$2')&&values[1]==='original'||
   changed==='retired'&&sql.includes('retired_at IS NULL')?[]:[{id:'gateway',site_id:changed==='moved'?'other':'original'}]};
  assert.ok(!/^(INSERT|UPDATE|DELETE)/.test(sql));return {rows:[{controlManaged:false}]};
 };
 await assert.rejects(guardLegacyGatewayConfiguration({query} as unknown as PoolClient,'gateway',changed==='wrong expected site'?'other':'original'),
  e=>e instanceof HttpException&&e.getStatus()===404);
});

test('early guard rereads newly committed managed history after gateway lock instead of trusting a pre-lock snapshot',async()=>{
 let locked=false;
 const query=async(sql:string)=>{
  if(sql.startsWith('SELECT site_id'))return {rows:[{site_id:'site'}]};
  if(sql.includes('FROM sites WHERE'))return {rows:[{id:'site'}]};
  if(sql.startsWith('SELECT * FROM gateways')){locked=true;return {rows:[{id:'gateway',site_id:'site',controlManaged:false}]};}
  if(sql.includes('gateway_configuration_revisions'))return {rows:[{controlManaged:locked}]};
  throw Error('Unexpected mutation');
 };
 await assert.rejects(guardLegacyGatewayConfiguration({query} as unknown as PoolClient,'gateway'),e=>e instanceof HttpException&&e.getStatus()===409);
});
