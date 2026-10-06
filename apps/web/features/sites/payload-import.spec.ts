import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readPayloadSample} from './payload-import';
const message=(group:string)=>({messageType:'telemetry',siteId:'SITE-001',gatewayId:'GW-001',device:{deviceId:'METER-001',profileId:'meter',profileVersion:'1.0.0',deviceType:'energy-meter',model:'PM2230'},pollGroup:group});
test('deduplicates groups and reconciles topic scope without guessing profile versions',()=>{
 const plan=readPayloadSample({payloads:{realtime:message('realtime'),energy:message('energy'),ack:{messageType:'dataAcept'}}},'solar/v1/sites/SITE-TEST/gateways/GW-TEST/devices/METER-TEST/telemetry',[]);
 assert.equal(plan.devices.length,1);assert.equal(plan.siteId,'SITE-TEST');assert.equal(plan.receiveConfig.siteAlias,'SITE-001');assert.equal(plan.devices[0]?.externalDeviceId,'METER-001');assert.equal(plan.devices[0]?.payloadProfileRevisionId,'');assert.equal(plan.ignored,1);
});
test('rejects mixed scope and conflicting profile revisions for one device',()=>{
 assert.throws(()=>readPayloadSample({payloads:[message('realtime'),{...message('energy'),siteId:'OTHER'}]},'',[]),/ไซต์/);
 assert.throws(()=>readPayloadSample({payloads:[message('realtime'),{...message('energy'),device:{...message('energy').device,profileVersion:'2'}}]},'',[]),/โปรไฟล์/);
});
test('single message requires concrete publish topic and keeps pinned identifiers on edit',()=>{
 assert.throws(()=>readPayloadSample(message('energy'),'solar/v1/sites/S/gateways/G/devices/+/telemetry',[]),/Publish/);
 const plan=readPayloadSample(message('energy'),'solar/v1/sites/S/gateways/G/devices/D/telemetry',[],{siteId:'LOCKED-S',gatewayId:'LOCKED-G'});
 assert.equal(plan.siteId,'LOCKED-S');assert.equal(plan.gatewayId,'LOCKED-G');assert.equal(plan.receiveConfig.gatewayAlias,'GW-001');
});

test('inherits omitted profile metadata across poll groups regardless of order',()=>{
 const energy=message('energy');const environment={...message('realtime'),device:{deviceId:'METER-001',model:'PM2230'}};
 const plan=readPayloadSample({payloads:[environment,energy]},'',[]);assert.equal(plan.devices.length,1);assert.equal(plan.devices[0]?.sourceProfileId,'meter');assert.equal(plan.devices[0]?.sourceProfileVersion,'1.0.0');
});
