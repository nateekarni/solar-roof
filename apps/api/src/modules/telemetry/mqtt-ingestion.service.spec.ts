import assert from "node:assert/strict";
import test from "node:test";
import { MqttIngestionService,requiredSubscriptions } from "./mqtt-ingestion.service.js";
import { DatabaseService } from "../../database/database.service.js";
import { GatewayControlMessageHandler } from '../gateway-control/gateway-control-message-handler.js';
import { GatewayConfigurationService } from '../gateway-control/gateway-configuration.service.js';

function fixture(options: { unknown?: boolean; fail?: boolean; mappings?: object[]; commit?: () => Promise<void> } = {}) {
  const writes: unknown[][] = []; const sent: string[] = []; const seen = new Set<string>();const calls:string[]=[];
  const query = async (sql: string, values: unknown[] = []) => {
    calls.push(sql);
    if(sql.startsWith('SELECT id FROM sites WHERE'))return {rows:[{id:'site'}]};
    if(sql.startsWith('SELECT site_id FROM gateways')||sql.startsWith('SELECT * FROM gateways WHERE'))return {rows:[{id:'gw',site_id:'site',protocol:'mqtt',mqtt_broker_id:null,endpoint:'energy/GW-1/#'}]};
    if (sql === 'COMMIT') await options.commit?.();
    if (sql.includes('FROM register_mapping_versions')) return { rows: options.mappings ?? [] };
    if (sql.includes('FROM devices d') || sql.includes('FROM gateways g')) return { rows: options.unknown ? [] : [{ siteId: 'site', gatewayId: 'gw', gatewayName: 'GW-1', deviceId: 'dev', endpoint: 'energy/GW-1/#' }] };
    if (sql.includes('FROM telemetry_raw tr')) {
      const latest = [...writes].sort((a,b) => new Date(String(b[3])).getTime() - new Date(String(a[3])).getTime())[0];
      return { rows: latest ? [{ siteId: 'site', device_id: 'dev', gatewayName: 'GW-1', source_time: latest[3], received_time: latest[4], active_power_w: latest[12], quality: latest[8] }] : [] };
    }
    if (sql.includes('INSERT INTO telemetry_raw')) {
      if (options.fail) throw new Error('database unavailable');
      const key = String(values[9]);
      if (seen.has(key)) return { rows: [], rowCount: 0 };
      seen.add(key); writes.push(values); return { rows: [{ id: 'raw' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  };
  const db = { query, pool: { connect: async () => ({ query, release() {} }) }, transaction:DatabaseService.prototype.transaction } as unknown as DatabaseService;
  const service = new MqttIngestionService(db, db as import("./ingestion-database.service.js").IngestionDatabaseService);
  Object.assign(service, { client: { connected: true, publish(topic: string) { sent.push(topic); }, end() {} } });
  return { service, writes, sent,calls };
}
const payload = (metrics: object, timestamp = '2026-09-30T01:00:00Z') => JSON.stringify({ deviceId: 'dev', gateway: 'GW-1', timestamp, metrics });

test('required MQTT subscriptions use telemetry for discovery and omit register',()=>{
  assert.ok(requiredSubscriptions.includes('solar/v1/sites/+/gateways/+/devices/+/telemetry'));
  assert.equal(requiredSubscriptions.some(topic=>topic.endsWith('/register')),false);
});

test('control namespace routes once before suffix exclusion or telemetry parsing',async context=>{
 const f=fixture();const inputs:any[]=[];
 context.mock.method(GatewayControlMessageHandler.prototype,'handle',async(input:any)=>{inputs.push(input);return {accepted:false};});
 for(const kind of ['register','configUpdate','configStatus','status','config','unknown'])await f.service.handleIncomingMessage(`solar/v1/gateways/GW/${kind}`,'invalid JSON',undefined,'remote');
 assert.equal(inputs.length,6);assert.ok(inputs.every(input=>input.brokerId==='remote'&&input.payload==='invalid JSON'));
 assert.equal(f.calls.length,0);assert.equal(f.sent.length,0);
});

test('site-scoped configAck and standard hardware publishing are disabled by default',async()=>{
 const f=fixture();await f.service.handleIncomingMessage('solar/v1/sites/S/gateways/G/configAck',JSON.stringify({siteId:'S',gatewayId:'G',status:'applied',configurationVersion:1}));
 assert.equal(f.calls.length,0);
 const db={query:async()=>({rows:[{brokerId:null,endpoint:'solar/v1/sites/S/gateways/G/devices/+/telemetry',externalSiteId:'S',externalGatewayId:'G'}]})};
 const service=new MqttIngestionService(db as any,db as any);const sent:string[]=[];
 Object.assign(service,{client:{connected:true,publish(topic:string,_body:string,_options:any,done:Function){sent.push(topic);done();}}});
 assert.equal(await service.publishHardwareConfig('Gateway',{}),false);assert.equal(sent.length,0);
});

for(const mode of ['success','offline','missing','failed'] as const)test(`retained config ${mode} uses trusted broker and marks only completed publication`,async context=>{
 const f=fixture();const published:any[]=[],marked:any[]=[];
 assert.equal(typeof f.service.publishGatewayConfig,'function');
 const config={schemaVersion:'1.1',messageType:'config',messageId:'cfg',gatewayId:'EXT-GW',siteId:'EXT-S',configVersion:3,configHash:'a'.repeat(64),issuedAt:'2026-10-19T01:00:00Z',approvedBy:'admin',devices:[]};
 context.mock.method(GatewayConfigurationService.prototype,'desiredForPublish',async(id:string,version:number)=>{assert.equal(id,'internal');assert.equal(version,3);return {brokerId:'persisted-broker',payload:config} as any;});
 context.mock.method(GatewayConfigurationService.prototype,'beginPublication',async()=> 'attempt');
 context.mock.method(GatewayConfigurationService.prototype,'recordPublished',async(...args:any[])=>{marked.push(args);return {delivery:args[2]?'published':'pending'};});
 let complete:Function|undefined;
 const client={connected:mode!=='offline',publish(topic:string,body:string,options:any,callback:Function){published.push({topic,body:JSON.parse(body),options});complete=callback;}};
 if(mode!=='missing')(Reflect.get(f.service,'remote') as Map<string,unknown>).set('persisted-broker',{client});
 assert.equal(typeof f.service.publishGatewayConfig,'function');
 const pending=f.service.publishGatewayConfig('internal',3);await new Promise(r=>setImmediate(r));assert.equal(marked.length,0);
 if(mode==='success'||mode==='failed')complete?.(mode==='failed'?Error('private credentials'):undefined);
 assert.deepEqual(await pending,{delivery:mode==='success'?'published':'pending'});
 assert.equal(f.sent.length,0);assert.equal(marked.length,mode==='success'||mode==='failed'?1:0);
 if(mode==='success'){assert.deepEqual(published,[{topic:'solar/v1/gateways/EXT-GW/config',body:config,options:{qos:1,retain:true}}]);assert.deepEqual(marked,[['internal','attempt',true]]);}
 if(mode==='failed')assert.deepEqual(marked,[['internal','attempt',false]]);
});

test('missing publish completion times out pending without published bookkeeping',async context=>{
 context.mock.timers.enable({apis:['setTimeout']});const f=fixture();let marked=0,outcome:unknown;
 context.mock.method(GatewayConfigurationService.prototype,'desiredForPublish',async()=>({brokerId:null,payload:{gatewayId:'GW',configHash:'a'.repeat(64)}} as any));
 context.mock.method(GatewayConfigurationService.prototype,'beginPublication',async()=> 'attempt');
 context.mock.method(GatewayConfigurationService.prototype,'recordPublished',async()=>{marked++;return {delivery:'published' as const};});
 Object.assign(f.service,{client:{connected:true,publish(){}}});
 void f.service.publishGatewayConfig('internal',1).then(result=>{outcome=result;});await new Promise(r=>setImmediate(r));
 context.mock.timers.tick(5000);await new Promise(r=>setImmediate(r));
 assert.deepEqual(outcome,{delivery:'pending'});assert.equal(marked,0);
});

test('shutdown cancels config deadline waits without certifying or resending uncertain packets',async context=>{
 context.mock.timers.enable({apis:['setTimeout']});const f=fixture();let marked=0,sends=0;
 context.mock.method(GatewayConfigurationService.prototype,'desiredForPublish',async()=>({brokerId:null,epoch:'0',payload:{gatewayId:'GW',configHash:'a'.repeat(64)}} as any));
 context.mock.method(GatewayConfigurationService.prototype,'beginPublication',async()=> 'attempt');
 context.mock.method(GatewayConfigurationService.prototype,'recordPublished',async()=>{marked++;return {delivery:'published' as const};});
 Object.assign(f.service,{client:{connected:true,publish(){sends++;},end(){}}});
 const pending=f.service.publishGatewayConfig('internal',1);await new Promise(r=>setImmediate(r));
 await f.service.onModuleDestroy();assert.deepEqual(await pending,{delivery:'pending'});
 assert.equal(Reflect.get(f.service,'cancelConfigWaits').size,0);
 context.mock.timers.tick(10000);await new Promise(r=>setImmediate(r));assert.equal(marked,0);assert.equal(sends,1);
});

test('selected remote broker publishes configuration even when system default broker is disabled',async()=>{
 const sent:string[]=[];
 const db={query:async()=>({rows:[{brokerId:'remote',endpoint:'solar/v1/sites/SITE/gateways/GW/devices/+/telemetry',externalSiteId:'SITE',externalGatewayId:'GW'}]})} as unknown as DatabaseService;
 const service=new MqttIngestionService(db,db as any);
 Object.assign(service,{legacyConfigEnabled:true});
 const remote=Reflect.get(service,'remote') as Map<string,unknown>;
 remote.set('remote',{client:{connected:true,publish(topic:string,_data:string,_options:unknown,callback:(err?:Error)=>void){sent.push(topic);callback();}}});
 assert.equal(await service.publishHardwareConfig('Gateway',{configurationVersion:1}),true);
 assert.deepEqual(sent,['solar/v1/sites/SITE/gateways/GW/config']);
});

test('response and config publications never enter ingestion', async () => {
  const f = fixture();
  await f.service.handleIncomingMessage('energy/GW-1/response', payload({ activePower: 1200 }));
  await f.service.handleIncomingMessage('energy/GW-1/config', payload({ activePower: 1200 }));
  assert.equal(f.writes.length, 0); assert.equal(f.sent.length, 0);
});

test('legacy register ingestion references site and gateway before raw trigger can lock a device',async()=>{
 const f=fixture();await f.service.handleIncomingMessage('energy/GW-1/telemetry',payload({totalEnergy:100}));
 const site=f.calls.findIndex(sql=>sql.includes('FROM sites WHERE')&&sql.includes('FOR KEY SHARE'));
 const gateway=f.calls.findIndex(sql=>sql.includes('FROM gateways WHERE')&&sql.includes('FOR KEY SHARE'));
 const raw=f.calls.findIndex(sql=>sql.includes('INSERT INTO telemetry_raw'));
 assert.ok(site>=0&&gateway>site&&raw>gateway);
 assert.equal(f.writes.length,1);
});

test('legacy telemetry ACK stays on its receiving broker client',async()=>{
 const f=fixture(),remote:string[]=[];const client={connected:true,publish(topic:string){remote.push(topic);}};
 await f.service.handleIncomingMessage('energy/GW-1/telemetry',payload({totalEnergy:100}),client as any);
 assert.deepEqual(remote,['energy/GW-1/response']);assert.deepEqual(f.sent,[]);
});

test('deadline ordering suppresses application ACK for COMMIT completion before the overdue timer callback', async context => {
  let now = 0; context.mock.method(performance, 'now', () => now);
  let release!: () => void, committing = false;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const f = fixture({ commit: async () => { committing = true; await blocked; } });
  const limiter = Reflect.get(f.service, 'limiter') as import('./ingestion-limiter.js').IngestionLimiter;
  limiter.submit('GW-1', 100, () => f.service.handleIncomingMessage('energy/GW-1/telemetry', payload({ activePower: 1200 })));
  while (!committing) await new Promise(resolve => setImmediate(resolve));
  const destroying = f.service.onModuleDestroy();
  now = 10000; release(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.sent.length, 0, 'an overdue timer cannot permit a late success ACK');
  await destroying;
});
test('unknown devices are rejected without an ACK or volatile readings', async () => {
  const f = fixture({ unknown: true });
  await f.service.handleIncomingMessage('energy/GW-1/telemetry', payload({ activePower: 1200 }));
  assert.equal(f.writes.length, 0); assert.equal(f.sent.length, 0);
});
test('W and kW fields normalize without NaN and missing values stay absent', async () => {
  for (const metrics of [{ activePower: 1200 }, { active_power: 1200 }, { activePowerKw: 1.2 }]) {
    const f = fixture(); await f.service.handleIncomingMessage('energy/GW-1/telemetry', payload(metrics));
    assert.equal(f.writes[0]?.[12], 1200); assert.equal(f.writes[0]?.[10], null);
  }
});
test('failed persistence never ACKs', async () => {
  const f = fixture({ fail: true });
  await f.service.handleIncomingMessage('energy/GW-1/telemetry', payload({ activePower: 1200 })).catch(() => {});
  assert.equal(f.sent.length, 0);
});
test('identical replay persists one sample and late data cannot replace latest', async () => {
  const f = fixture(); const message = payload({ activePower: 1200 });
  await f.service.handleIncomingMessage('energy/GW-1/telemetry', message);
  await f.service.handleIncomingMessage('energy/GW-1/telemetry', message);
  assert.equal(f.writes.length, 1);
  await f.service.handleIncomingMessage('energy/GW-1/telemetry', payload({ activePower: 100 }, '2026-09-29T01:00:00Z'));
  const latest = await f.service.getLatestTelemetry('site');
  assert.equal(latest?.metrics.activePower, 1200);
  assert.equal(latest?.status, 'offline');
});

test('freshness includes 120 seconds and expires immediately afterwards', async () => {
  const { isFresh, telemetryTopicMatches } = await import('./mqtt-ingestion.service.js');
  assert.equal(isFresh('2026-09-30T00:00:00Z', Date.parse('2026-09-30T00:02:00Z')), true);
  assert.equal(isFresh('2026-09-30T00:00:00Z', Date.parse('2026-09-30T00:02:00.001Z')), false);
  assert.equal(isFresh('2026-09-30T00:03:00Z', Date.parse('2026-09-30T00:02:00Z')), false);
  assert.equal(telemetryTopicMatches('/GW-1/#', '/GW-1/meter/telemetry'), true);
  assert.equal(telemetryTopicMatches('/GW-1/#', '/GW-10/meter/telemetry'), false);
});
test('a known device on another gateway topic is rejected', async () => {
  const f = fixture();
  await f.service.handleIncomingMessage('energy/GW-2/telemetry', payload({ activePower: 1200 }));
  assert.equal(f.writes.length, 0); assert.equal(f.sent.length, 0);
});
test('timestamp-free and nonnumeric samples are never acknowledged', async () => {
  const f = fixture();
  await assert.rejects(f.service.handleIncomingMessage('energy/GW-1/telemetry', JSON.stringify({ deviceId: 'dev', metrics: { activePower: 1200 } })));
  await assert.rejects(f.service.handleIncomingMessage('energy/GW-1/telemetry', payload({ activePower: 'bad' })));
  assert.equal(f.writes.length, 0); assert.equal(f.sent.length, 0);
});

test('raw register byte order is honored rather than silently decoded backwards', async () => {
  const f = fixture({ mappings: [{ id: 'mapping', semanticField: 'voltage', registerAddress: 'R2', registerCount: 1, byteOrder: 'little_endian', wordOrder: 'little_word_first', dataType: 'uint16', scale: 0.01, unit: 'V' }] });
  await f.service.handleIncomingMessage('energy/GW-1/telemetry', JSON.stringify({ deviceId: 'dev', timestamp: '2026-09-30T01:00:00Z', registers: { R2: 10586 } }));
  assert.equal(f.writes[0]?.[10], 230.81);
});
