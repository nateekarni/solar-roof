import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULT_PAYLOAD_PROFILES,validatePayloadProfile,normalizePayloadEnvelope} from './payload-profile.js';
const payload=JSON.parse(readFileSync(new URL('./fixtures/payload-examples-v1.1.json',import.meta.url),'utf8')).payloads.pm2230Energy;
test('local mapping revision accepts pinned source version, aliases literal tags and retains raw evidence',()=>{
 const profile=validatePayloadProfile({...DEFAULT_PAYLOAD_PROFILES[0],version:'1.0.1',sourceProfile:{id:'schneider-pm2230',version:'1.0.0'},fields:[{tag:'energy.active.import.total',sourceTag:'vendor.energy',displayName:'Energy',pollGroup:'energy',sourceUnit:'Wh',targetUnit:'kWh',conversion:'wh-to-kwh',role:'billing-import',required:true}]});
 const raw=structuredClone(payload);raw.data.values={'vendor.energy':1700};raw.data.units={'vendor.energy':'Wh'};
 const n=normalizePayloadEnvelope(raw,{profile,siteId:'SITE-001',gatewayId:'GW-001',deviceId:'METER-001'},'solar/v1/sites/SITE-001/gateways/GW-001/devices/METER-001/telemetry');
 assert.equal(n.samples[0]?.value,1.7);assert.equal(n.samples[0]?.tag,'energy.active.import.total');assert.equal(n.samples[0]?.sourceTag,'vendor.energy');assert.equal(n.raw.data.values['vendor.energy'],1700);
 const missing=structuredClone(raw);missing.data.values={other:1};missing.data.units={other:'Wh'};
 assert.throws(()=>normalizePayloadEnvelope(missing,{profile,siteId:'SITE-001',gatewayId:'GW-001',deviceId:'METER-001'},'solar/v1/sites/SITE-001/gateways/GW-001/devices/METER-001/telemetry'),/Required field/);
});
test('duplicate source aliases are rejected instead of ambiguous decoding',()=>{
 const fields=DEFAULT_PAYLOAD_PROFILES[0]!.fields.map(f=>({...f,sourceTag:'same'}));
 assert.throws(()=>validatePayloadProfile({...DEFAULT_PAYLOAD_PROFILES[0],fields}),/Duplicate source/);
});
