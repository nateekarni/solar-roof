import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetsController } from './assets.controller.js';
import { DEFAULT_PAYLOAD_PROFILES } from '../telemetry/payload-profile.js';
function fixture(config=DEFAULT_PAYLOAD_PROFILES[0]) {const writes:{sql:string;values:any[]}[]=[];const query=async(sql:string,values:any[]=[])=>{writes.push({sql,values});if(sql.includes('INSERT INTO schools'))return {rows:[{id:values[0]}]};if(sql.includes('FROM payload_profile_revisions')&&!sql.includes('FOR UPDATE'))return {rows:[{id:'r',config}]};if(sql.includes('FROM gateways'))return {rows:[{id:'g',externalSiteId:'SITE',externalGatewayId:'GW'}]};if(sql.includes('FROM devices')&&sql.includes('FOR UPDATE'))return {rows:[{id:'d',device_type:'meter',billing:true}]};return {rows:[]};};const db={query,pool:{connect:async()=>({query,release(){}})}};return {c:new AssetsController(db as any,{refreshSubscriptions:async()=>{},publishHardwareConfig:async()=>false} as any),writes};}
test('logger addition uses logger type and explicit revision without billing assignment',async()=>{const f=fixture(DEFAULT_PAYLOAD_PROFILES[1]);await f.c.addDevice('s',{name:'logger',model:'SmartLogger',serialNumber:'L1',externalDeviceId:'LOGGER',payloadProfileRevisionId:'r'});assert.ok(f.writes.some(w=>w.sql.includes('INSERT INTO devices')&&w.values.includes('logger')));assert.ok(f.writes.some(w=>w.sql.includes('payload_profile_revision_id')));assert.ok(!f.writes.some(w=>w.sql.includes('INSERT INTO billing_meters')));});
test('billing meter cannot explicitly upgrade to logger profile',async()=>{const f=fixture(DEFAULT_PAYLOAD_PROFILES[1]);await assert.rejects(f.c.upgradePayloadProfile('d',{payloadProfileRevisionId:'r'}),/billing/i);});

test('standard gateway rejects an unusable legacy device attachment',async()=>{const f=fixture();await assert.rejects(f.c.addDevice('s',{name:'legacy',model:'old',serialNumber:'old'}),/payload|standard/i);});

test('simple site provisioning stores no implicit alert thresholds or hardware configuration request',async()=>{
 const f=fixture();
 const result=await f.c.createSite({name:'Simple site',schoolName:'School',capacityMwp:0.5,gatewayName:'GW-SIMPLE',deviceSerial:'SIMPLE-001',protocol:'mqtt',externalSiteId:'SITE-SIMPLE',externalGatewayId:'GW-SIMPLE',externalDeviceId:'METER-SIMPLE',payloadProfileRevisionId:'r'});
 const gateway=f.writes.find(w=>w.sql.includes('INSERT INTO gateways'));
 assert.ok(gateway);
 assert.ok(gateway.values.includes('{}'));
 assert.equal(result.configDelivery,'not_requested');
});

test('site provisioning preserves a manually narrowed payload subscription',async()=>{
 const f=fixture();
 const endpoint='solar/v1/sites/SITE-SIMPLE/gateways/GW-SIMPLE/devices/METER-SIMPLE/telemetry';
 await f.c.createSite({name:'Simple site',schoolName:'School',capacityMwp:0.5,gatewayName:'GW-SIMPLE',deviceSerial:'SIMPLE-001',protocol:'mqtt',externalSiteId:'SITE-SIMPLE',externalGatewayId:'GW-SIMPLE',externalDeviceId:'METER-SIMPLE',payloadProfileRevisionId:'r',endpoint});
 assert.ok(f.writes.find(w=>w.sql.includes('INSERT INTO gateways'))?.values.includes(endpoint));
});

test('site provisioning rejects a subscription for another gateway',async()=>{
 const f=fixture();
 await assert.rejects(f.c.createSite({name:'Simple site',schoolName:'School',capacityMwp:0.5,gatewayName:'GW-SIMPLE',deviceSerial:'SIMPLE-001',protocol:'mqtt',externalSiteId:'SITE-SIMPLE',externalGatewayId:'GW-SIMPLE',externalDeviceId:'METER-SIMPLE',payloadProfileRevisionId:'r',endpoint:'solar/v1/sites/SITE-SIMPLE/gateways/OTHER/devices/+/telemetry'}),/Topic/);
});

test('creation stores reception settings and additional devices in one transaction',async()=>{
 const f=fixture();
 await f.c.createSite({name:'Configured site',schoolName:'School',capacityMwp:0.5,gatewayName:'GW',deviceSerial:'S1',payloadProfileRevisionId:'r',externalSiteId:'SITE',externalGatewayId:'GW',externalDeviceId:'METER',additionalDevices:[{name:'Second meter',model:'PM2230',serialNumber:'S2',externalDeviceId:'METER2',payloadProfileRevisionId:'r'}],receiveConfig:{messagesPath:'payloads',deviceAliases:[{source:'SOURCE2',target:'METER2'}]}});
 const inserts=f.writes.filter(w=>w.sql.includes('INSERT INTO devices'));
 assert.equal(inserts.length,2);
 const rx=f.writes.findIndex(w=>w.sql.includes('INSERT INTO gateway_payload_receive_revisions'));
 assert.ok(rx>=0 && rx<f.writes.findIndex(w=>w.sql==='COMMIT'));
});
test('creation rejects reception alias targeting an unplanned device before writes',async()=>{
 const f=fixture();
 await assert.rejects(f.c.createSite({name:'Configured site',schoolName:'School',capacityMwp:0.5,gatewayName:'GW',deviceSerial:'S1',payloadProfileRevisionId:'r',externalSiteId:'SITE',externalGatewayId:'GW',externalDeviceId:'METER',receiveConfig:{deviceAliases:[{source:'SOURCE',target:'UNKNOWN'}]}}),/target/i);
 assert.ok(!f.writes.some(w=>w.sql.includes('INSERT INTO sites')));
});

test('import stores new devices and reception revision together without billing writes',async()=>{
 const f=fixture();await f.c.importPayloadConfiguration('s',{baseVersion:0,devices:[{name:'Imported meter',model:'PM2230',serialNumber:'IMPORT-1',externalDeviceId:'METER',payloadProfileRevisionId:'r'}],config:{messagesPath:'payloads',deviceAliases:[{source:'SOURCE',target:'METER'}]}});
 assert.ok(f.writes.some(w=>w.sql.includes('INSERT INTO devices')));assert.ok(f.writes.some(w=>w.sql.includes('INSERT INTO gateway_payload_receive_revisions')));assert.equal(f.writes.at(-1)?.sql,'COMMIT');assert.ok(!f.writes.some(w=>w.sql.includes('billing_meters')));
});
test('import rolls back device insert when reception target is invalid',async()=>{
 const f=fixture();await assert.rejects(f.c.importPayloadConfiguration('s',{baseVersion:0,devices:[{name:'Imported meter',model:'PM2230',serialNumber:'IMPORT-1',externalDeviceId:'METER',payloadProfileRevisionId:'r'}],config:{deviceAliases:[{source:'SOURCE',target:'UNKNOWN'}]}}),/target/i);
 assert.equal(f.writes.at(-1)?.sql,'ROLLBACK');assert.ok(!f.writes.some(w=>w.sql==='COMMIT'));
});

test('manual site configuration persists edited main meter name and independent local profiles atomically',async()=>{const f=fixture(),main=structuredClone(DEFAULT_PAYLOAD_PROFILES[0]!),extra=structuredClone(main);main.fields[0]!.displayName='Main local';extra.fields[0]!.displayName='Second local';await f.c.createSite({name:'Manual site',schoolName:'School',gatewayName:'Gateway',deviceName:'Edited main name',deviceModel:'Edited model',deviceSerial:'REAL-1',localOverrideConfig:main,externalSiteId:'SITE',externalGatewayId:'GW',externalDeviceId:'METER',additionalDevices:[{name:'Second',model:'Other',serialNumber:'REAL-2',externalDeviceId:'SECOND',localOverrideConfig:extra}]} as any);const locals=f.writes.filter(w=>w.sql.includes('INSERT INTO payload_profile_revisions'));assert.equal(locals.length,2);assert.notEqual(locals[0]!.values[0],locals[1]!.values[0]);assert.notEqual(locals[0]!.values[4],locals[1]!.values[4]);assert.ok(f.writes.find(w=>w.sql.includes('INSERT INTO devices'))?.values.includes('Edited main name'));assert.equal(f.writes.filter(w=>w.sql==='COMMIT').length,1);});
