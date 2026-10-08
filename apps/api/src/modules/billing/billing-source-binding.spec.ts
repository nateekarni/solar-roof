import assert from 'node:assert/strict';
import test from 'node:test';
import { validateBillingSource } from './billing-source-binding.service.js';
import { DEFAULT_PAYLOAD_PROFILES } from '../telemetry/payload-profile.js';
const input={deviceId:'d',profileRevisionId:'r',sourceTag:'energy.active.import.total',canonicalTag:'energy.active.import.total',sourceUnit:'Wh',targetUnit:'kWh',conversion:'wh-to-kwh',measurementPurpose:'solar-delivered'};
test('binding validates exact cumulative field identity and physical purpose',()=>{
 assert.equal(validateBillingSource(input,DEFAULT_PAYLOAD_PROFILES[0]!).sourceTag,'energy.active.import.total');
 for(const change of [{sourceTag:'energy.active.export.total'},{canonicalTag:'solar.total_yield'},{sourceUnit:'kWh'},{targetUnit:'Wh'},{conversion:'identity'},{measurementPurpose:''},{measurementPurpose:'other'}])assert.throws(()=>validateBillingSource({...input,...change},DEFAULT_PAYLOAD_PROFILES[0]!));
 assert.equal(validateBillingSource({...input,measurementPurpose:'other',purposeDescription:'Dedicated delivery meter'},DEFAULT_PAYLOAD_PROFILES[0]!).purposeDescription,'Dedicated delivery meter');
});
test('duplicate or missing cumulative fields fail closed',()=>{
 const p=structuredClone(DEFAULT_PAYLOAD_PROFILES[0]!);p.fields.push({...p.fields.find(f=>f.role==='billing-import')!});assert.throws(()=>validateBillingSource(input,p));
 const noRole=structuredClone(DEFAULT_PAYLOAD_PROFILES[0]!);noRole.fields.forEach(f=>{f.role='none';});assert.throws(()=>validateBillingSource(input,noRole));
});

import { BillingSourceBindingService } from './billing-source-binding.service.js';
import type { DatabaseService } from '../../database/database.service.js';
function fixture(overrides:Record<string,unknown>={}){
 const writes:string[]=[];
 const meter={id:'meter',device_id:'d',payload_profile_revision_id:'r',config:DEFAULT_PAYLOAD_PROFILES[0],billing_source_binding_id:null,...overrides};
 const previous={id:'old',meter_id:'meter',site_id:'s',device_id:'d',profile_revision_id:'r',source_tag:'energy.active.import.total',canonical_tag:'energy.active.import.total',source_unit:'Wh',target_unit:'kWh',conversion:'wh-to-kwh',measurement_purpose:'grid-import'};
 const db={transaction:async(run:any)=>run({query:async(sql:string,params:any[])=>{
  if(sql.startsWith('SELECT id FROM sites'))return {rows:[{id:'s'}]};
  if(sql.includes('FROM billing_meters'))return {rows:[meter]};
  if(sql.includes('SELECT * FROM billing_source_bindings'))return {rows:[previous]};
  writes.push(sql);
  if(sql.includes('INSERT INTO billing_source_bindings'))return {rows:[{...previous,id:params[0],measurement_purpose:params[10]}]};
  return {rows:[]};
 }})};
 return {writes,service:new BillingSourceBindingService(db as unknown as DatabaseService)};
}
test('binding refuses other devices and stale profile before writes',async()=>{
 for(const patch of [{deviceId:'another-device'},{profileRevisionId:'stale'}]){const f=fixture();await assert.rejects(f.service.bind('s',{...input,...patch},'actor'));assert.equal(f.writes.length,0);}
 const f=fixture();await assert.rejects(f.service.bind('s',input,undefined));assert.equal(f.writes.length,0);
});
test('source replacement requires confirmed impact and preserves immutable history',async()=>{
 const f=fixture({billing_source_binding_id:'old'});await assert.rejects(f.service.bind('s',input,'actor'),/Confirm billing impact/);assert.equal(f.writes.length,0);
 const source=await f.service.bind('s',{...input,billingImpactConfirmed:true},'actor');assert.equal(source?.measurementPurpose,'solar-delivered');assert.notEqual(source?.id,'old');assert.ok(f.writes.some(sql=>sql.includes('INSERT INTO audit_events')));assert.ok(!f.writes.some(sql=>sql.includes('UPDATE billing_source_bindings')));
});

test('latest invalid source does not display an older counter as currently verified',async()=>{
 const db={query:async(sql:string)=>({rows:sql.includes('FROM billing_meters')?[{meter_id:'meter',device_id:'d',payload_profile_revision_id:'r',billing_source_binding_id:'b',config:DEFAULT_PAYLOAD_PROFILES[0]}]:sql.includes('FROM billing_source_bindings')?[{id:'b',profile_revision_id:'r',device_id:'d',site_id:'s'}]:[{id:'bad',quality:'invalid',valueKwh:null,unit:'kWh',fresh:false}]})};
 const result=await new BillingSourceBindingService(db as unknown as DatabaseService).get('s');assert.equal(result.status,'invalid-data');assert.equal(result.latestVerifiedReading,null);
});
