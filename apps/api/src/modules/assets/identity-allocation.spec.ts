import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetsController } from './assets.controller.js';
import { routeAllowed } from '../../common/auth/route-policy.js';
import { DEFAULT_PAYLOAD_PROFILES } from '../telemetry/payload-profile.js';
function fixture(endpoint='energy/Legacy/#',collisions=0) {
 const writes:{sql:string;values:any[]}[]=[];
 const query=async(sql:string,values:any[]=[])=>{
  writes.push({sql,values});
  if(sql.includes('INSERT INTO sites')&&collisions-->0)throw Object.assign(new Error('site code collision'),{code:'23505',constraint:'sites_external_site_id_key'});
  if(sql.includes('INSERT INTO sites')) return {rows:[{id:values[0],externalSiteId:values[7]}]};
  if(sql.includes('INSERT INTO schools'))return {rows:[{id:values[0]}]};
  if(sql.includes('FROM payload_profile_revisions'))return {rows:[{id:'revision',config:DEFAULT_PAYLOAD_PROFILES[0]}]};
  if(sql.includes('FROM gateways')&&sql.includes('FOR UPDATE'))return {rows:[{id:'gateway',externalSiteId:'SITE-existing',externalGatewayId:'GW-existing',endpoint}]};
  return {rows:[]};
 };
 return {controller:new AssetsController({query,pool:{connect:async()=>({query,release(){}})}} as any,{refreshSubscriptions:async()=>{},publishHardwareConfig:async()=>false} as any),writes};
}
test('blank legacy creation allocates all operational codes while retaining energy routing and no profile',async()=>{
 const f=fixture();await f.controller.createSite({name:'Legacy',schoolName:'Customer',gatewayName:'Legacy',deviceSerial:'SERIAL'});
 const site=f.writes.find(w=>w.sql.includes('INSERT INTO sites'))!;
 const gateway=f.writes.find(w=>w.sql.includes('INSERT INTO gateways'))!;
 const device=f.writes.find(w=>w.sql.includes('INSERT INTO devices'))!;
 assert.match(site.values[7],/^SITE-[A-F0-9]{12}$/);assert.match(gateway.values[8],/^GW-[A-F0-9]{12}$/);
 assert.match(device.values[7],/^DEV-[A-F0-9]{12}$/);assert.equal(device.values[8],null);assert.equal(gateway.values[4],'energy/Legacy/#');
});
test('blank standard creation aligns generated topic with saved site and gateway codes',async()=>{
 const f=fixture();await f.controller.createSite({name:'Standard',schoolName:'Customer',gatewayName:'Standard',deviceSerial:'SERIAL',payloadProfileRevisionId:'revision'});
 const site=f.writes.find(w=>w.sql.includes('INSERT INTO sites'))!;const gateway=f.writes.find(w=>w.sql.includes('INSERT INTO gateways'))!;
 assert.equal(gateway.values[4],`solar/v1/sites/${site.values[7]}/gateways/${gateway.values[8]}/devices/+/telemetry`);
});
test('new legacy device receives a code without migrating a gateway which already has display codes',async()=>{
 const f=fixture();await f.controller.addDevice('site',{name:'New',model:'Old',serialNumber:'SERIAL'});
 const device=f.writes.find(w=>w.sql.includes('INSERT INTO devices'))!;assert.match(device.values[8],/^DEV-[A-F0-9]{12}$/);assert.equal(device.values[9],null);
});
test('display codes alone do not permit adding standard profile to legacy gateway',async()=>{
 const f=fixture();await assert.rejects(f.controller.addDevice('site',{name:'New',model:'Old',serialNumber:'SERIAL',payloadProfileRevisionId:'revision'}),/standard|legacy|commission/i);
});
test('identity draft endpoint is admin only',()=>{
 for(const role of ['owner','operator','accountant','school_user'])assert.equal(routeAllowed(role,'POST','/v1/sites/identity-draft'),false);
 assert.equal(routeAllowed('admin','POST','/v1/sites/identity-draft'),true);
 assert.equal(routeAllowed('operator','GET','/v1/sites/identity-draft'),false);
});
import { parseOrganization,insertOrganization } from './organization-master.js';
import { PayloadReceptionSettings } from '../telemetry/payload-reception-settings.js';

test('whitespace customer code allocates while leaving tax and serial identity untouched',()=>{
 const parsed=parseOrganization({name:'Customer',code:'   ',taxId:'1234567890123'});assert.match(parsed.code,/^ORG-[A-F0-9]{12}$/);assert.equal(parsed.taxId,'1234567890123');
});
test('generated customer allocation retries a committed collision without aborting site transaction',async()=>{
 let attempts=0;const input=parseOrganization({name:'Customer'});
 const client={query:async(_sql:string,values:any[])=>{attempts++;return {rows:attempts===1?[]:[{id:values[0],code:values[2]}]};}};
 const result=await insertOrganization(client as any,input);assert.equal(attempts,2);assert.match(result.code,/^ORG-/);
});
test('reception configuration rejects legacy routing even when display codes are present',async()=>{
 const db={query:async()=>({rows:[{gatewayId:'gateway',externalSiteId:'SITE',externalGatewayId:'GW',endpoint:'energy/Legacy/#'}]})};
 await assert.rejects(new PayloadReceptionSettings(db as any).context('site'),/Standard MQTT gateway/);
});
test('resolved draft codes persist exactly during standard creation and case is preserved',async()=>{
 const f=fixture();const draft=await f.controller.allocateIdentityDraft({externalSiteId:'Site-Mixed',additionalDevices:[{}]});
 await f.controller.createSite({name:'Draft',schoolName:'Customer',gatewayName:'Draft',deviceSerial:'SERIAL',payloadProfileRevisionId:'revision',externalSiteId:draft.externalSiteId,externalGatewayId:draft.externalGatewayId,externalDeviceId:draft.externalDeviceId});
 const site=f.writes.find(w=>w.sql.includes('INSERT INTO sites'))!;const gateway=f.writes.find(w=>w.sql.includes('INSERT INTO gateways'))!;const device=f.writes.find(w=>w.sql.includes('INSERT INTO devices'))!;
 assert.equal(site.values[7],'Site-Mixed');assert.equal(gateway.values[8],draft.externalGatewayId);assert.equal(device.values[7],draft.externalDeviceId);
});
test('draft rejects invalid supplied codes and duplicate codes within gateway',async()=>{
 const f=fixture();await assert.rejects(f.controller.allocateIdentityDraft({externalSiteId:'invalid/topic'}),/letters|code/i);
 await assert.rejects(f.controller.allocateIdentityDraft({externalDeviceId:'Same',additionalDevices:[{externalDeviceId:'Same'}]}),/unique/i);
 const distinct=await f.controller.allocateIdentityDraft({externalDeviceId:'Same',additionalDevices:[{externalDeviceId:'same'}]});assert.equal(distinct.additionalDevices[0]?.externalDeviceId,'same');
});
test('generated site code collision rolls back then retries with a fresh topic-aligned identity',async()=>{
 const f=fixture('energy/Legacy/#',1);await f.controller.createSite({name:'Retry',schoolName:'Customer',gatewayName:'Retry',deviceSerial:'SERIAL',payloadProfileRevisionId:'revision'});
 const sites=f.writes.filter(w=>w.sql.includes('INSERT INTO sites'));const gateway=f.writes.find(w=>w.sql.includes('INSERT INTO gateways'))!;
 assert.equal(sites.length,2);assert.notEqual(sites[0]?.values[7],sites[1]?.values[7]);assert.ok(f.writes.some(w=>w.sql==='ROLLBACK'));
 assert.equal(gateway.values[4],`solar/v1/sites/${sites[1]?.values[7]}/gateways/${gateway.values[8]}/devices/+/telemetry`);
});
test('supplied site code collision is actionable and is never silently replaced',async()=>{
 const f=fixture('energy/Legacy/#',2);await assert.rejects(f.controller.createSite({name:'Duplicate',schoolName:'Customer',gatewayName:'Duplicate',deviceSerial:'SERIAL',externalSiteId:'Fixed-Code'}),/Site code already exists/);
 assert.equal(f.writes.filter(w=>w.sql.includes('INSERT INTO sites')).length,1);
});
test('automatic site code retries are bounded on persistent uniqueness conflicts',async()=>{
 const f=fixture('energy/Legacy/#',20);await assert.rejects(f.controller.createSite({name:'Duplicate',schoolName:'Customer',gatewayName:'Duplicate',deviceSerial:'SERIAL'}),/Site code already exists/);
 assert.equal(f.writes.filter(w=>w.sql.includes('INSERT INTO sites')).length,5);assert.ok(!f.writes.some(w=>w.sql==='COMMIT'));
});
test('parallel new creations allocate distinct identities while preserving UUID references',async()=>{
 const f=fixture();await Promise.all(Array.from({length:12},(_,i)=>f.controller.createSite({name:`Site ${i}`,schoolName:`Customer ${i}`,deviceSerial:`SERIAL-${i}`})));
 const sites=f.writes.filter(w=>w.sql.includes('INSERT INTO sites'));const gateways=f.writes.filter(w=>w.sql.includes('INSERT INTO gateways'));
 assert.equal(new Set(sites.map(w=>w.values[7])).size,12);assert.equal(new Set(sites.map(w=>w.values[0])).size,12);
 for(const gateway of gateways){assert.ok(sites.some(w=>w.values[0]===gateway.values[1]));assert.match(gateway.values[4],/^energy\/GW-[A-F0-9]{12}\/#$/);}
});
test('editing an existing customer never treats whitespace code as an allocation request',async()=>{
 const f=fixture();await assert.rejects(f.controller.updateSchool('customer',{name:'Customer',code:'   ',impactConfirmed:true,expectedUpdatedAt:'2026-10-09T00:00:00.000Z'},{user:{role:'admin'}}),/code is required/i);
});
test('identity draft rejects arrays and malformed additional device objects',async()=>{
 const f=fixture();await assert.rejects(f.controller.allocateIdentityDraft([] as any),/draft/i);await assert.rejects(f.controller.allocateIdentityDraft({additionalDevices:[[] as any]}),/device/i);
});
