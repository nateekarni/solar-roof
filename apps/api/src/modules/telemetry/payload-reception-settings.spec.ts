import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PayloadReceptionSettings } from './payload-reception-settings.js';
import { DEFAULT_PAYLOAD_PROFILES } from './payload-profile.js';
const input = JSON.parse(readFileSync(new URL('./fixtures/payload-examples-v1.1.json',import.meta.url),'utf8'));
function fixture() {
 const writes:string[]=[];
 const query=async(sql:string)=>{
  writes.push(sql);
  if(sql.includes('FROM gateways g JOIN sites'))return {rows:[{gatewayId:'g',externalSiteId:'SITE-001',externalGatewayId:'GW-001'}]};
  if(sql.includes('FROM devices d'))return {rows:[{externalDeviceId:'METER-001',config:DEFAULT_PAYLOAD_PROFILES[0]},{externalDeviceId:'SMARTLOGGER-001',config:DEFAULT_PAYLOAD_PROFILES[1]}]};
  if(sql.includes('ORDER BY version DESC'))return {rows:[]};
  if(sql.includes('INSERT INTO gateway_payload_receive_revisions'))return {rows:[{version:1}]};
  return {rows:[]};
 };
 return {settings:new PayloadReceptionSettings({query,pool:{connect:async()=>({query,release(){}})}} as any),writes};
}
test('preview validates the full gateway bundle without telemetry writes',async()=>{
 const f=fixture();const result=await f.settings.preview('s',{config:{},input,topic:'solar/v1/sites/SITE-001/gateways/GW-001/devices/METER-001/telemetry'});
 assert.equal(result.messages.filter(m=>m.status==='valid').length,4);assert.equal(result.ignored,1);
 assert.ok(!f.writes.some(sql=>sql.includes('INSERT')));
});
test('saving validates registered target aliases and stale configuration revisions',async()=>{
 const f=fixture();await assert.rejects(f.settings.save('s',{baseVersion:0,config:{deviceAliases:[{source:'A',target:'UNKNOWN'}]}}),/registered/i);
 await assert.rejects(f.settings.save('s',{baseVersion:2,config:{}}),/changed/i);
 await f.settings.save('s',{baseVersion:0,config:{}});assert.ok(f.writes.some(sql=>sql.includes('INSERT INTO gateway_payload_receive_revisions')));
});
test('generated fixtures cover every field and poll group for meter and logger',async()=>{
 const f=fixture(); const result=await f.settings.fixtures('s');
 assert.equal(Object.keys(result.payloads).length,4);
 assert.equal(Object.keys(result.payloads['METER-001.energy']!.data.values).length,4);
 assert.equal(Object.keys(result.payloads['SMARTLOGGER-001.environment']!.data.values).length,4);
});
