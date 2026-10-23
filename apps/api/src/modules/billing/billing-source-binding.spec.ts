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

test('sites without a main meter expose only devices with one valid cumulative billing field',async()=>{
 const invalid=structuredClone(DEFAULT_PAYLOAD_PROFILES[0]!);invalid.fields.forEach(field=>{field.role='none';});
 const db={query:async(sql:string)=>({rows:
  sql.includes('FROM billing_meters')?[]:
  sql.includes('FROM devices d')?[
   {id:'eligible',name:'SPM91',external_device_id:'SPM91-01',payload_profile_revision_id:'rev-energy',config:DEFAULT_PAYLOAD_PROFILES[0]},
   {id:'realtime-only',name:'Realtime meter',external_device_id:'RT-01',payload_profile_revision_id:'rev-realtime',config:invalid}
  ]:[]
 })};
 const result=await new BillingSourceBindingService(db as unknown as DatabaseService).get('s');
 assert.equal(result.status,'no-main-meter');
 assert.deepEqual(result.candidates,[{
  id:'eligible',name:'SPM91',externalDeviceId:'SPM91-01',profileRevisionId:'rev-energy',
  eligibleFields:[{...DEFAULT_PAYLOAD_PROFILES[0]!.fields.find(field=>field.role==='billing-import')!,sourceTag:'energy.active.import.total',canonicalTag:'energy.active.import.total'}]
 }]);
});

import { BillingSourceBindingService } from './billing-source-binding.service.js';
import type { DatabaseService } from '../../database/database.service.js';
function fixture(overrides:Record<string,unknown>={}){
 const writes:string[]=[];
 const meter={id:'meter',device_id:'d',payload_profile_revision_id:'r',config:DEFAULT_PAYLOAD_PROFILES[0],billing_source_binding_id:null,...overrides};
 const previous={id:'old',meter_id:'meter',site_id:'s',device_id:'d',profile_revision_id:'r',source_tag:'energy.active.import.total',canonical_tag:'energy.active.import.total',source_unit:'Wh',target_unit:'kWh',conversion:'wh-to-kwh',measurement_purpose:'grid-import'};
 const db={transaction:async(run:any)=>run({query:async(sql:string,params:any[])=>{
  if(sql.startsWith('SELECT id FROM sites'))return {rows:[{id:'s'}]};
  if(sql.startsWith('SELECT id FROM devices'))return {rows:[{id:'d'}]};
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

test('binding an eligible discovered device creates the main meter and source atomically',async()=>{
 const writes:Array<{sql:string;params:any[]}>=[];
 const db={transaction:async(run:any)=>run({query:async(sql:string,params:any[])=>{
  if(sql.startsWith('SELECT id FROM sites'))return {rows:[{id:'s'}]};
  if(sql.startsWith('SELECT id FROM devices'))return {rows:[{id:'d'}]};
  if(sql.startsWith('SELECT id FROM billing_meters'))return {rows:[]};
  if(sql.includes('FROM devices d'))return {rows:[{id:'d',name:'SPM91',external_device_id:'SPM91-01',payload_profile_revision_id:'r',config:DEFAULT_PAYLOAD_PROFILES[0]}]};
  if(sql.includes('FROM billing_meters'))return {rows:[]};
  writes.push({sql,params});
  if(sql.includes('INSERT INTO billing_meters'))return {rows:[{id:params[0]}]};
  if(sql.includes('INSERT INTO billing_source_bindings'))return {rows:[{id:params[0],meter_id:params[1],site_id:'s',device_id:'d',profile_revision_id:'r',source_tag:'energy.active.import.total',canonical_tag:'energy.active.import.total',source_unit:'Wh',target_unit:'kWh',conversion:'wh-to-kwh',measurement_purpose:'solar-delivered'}]};
  return {rows:[]};
 }})};
 const result=await new BillingSourceBindingService(db as unknown as DatabaseService).bind('s',input,'actor');
 const meterWrite=writes.find(write=>write.sql.includes('INSERT INTO billing_meters'));
 assert.ok(meterWrite);
 assert.deepEqual(meterWrite.params.slice(1),['s','d','total_energy']);
 const bindingWrite=writes.find(write=>write.sql.includes('INSERT INTO billing_source_bindings'));
 assert.ok(bindingWrite);
 assert.equal(bindingWrite.params[1],meterWrite.params[0]);
 assert.equal(result?.deviceId,'d');
 assert.ok(writes.some(write=>write.sql.includes('INSERT INTO audit_events')));
});

test('reactivating an inactive meter preserves its binding history and replacement safeguards',async()=>{
 const run=async(next:any)=>{
  const writes:Array<{sql:string;params:any[]}>=[];
  const previous={id:'old',meter_id:'inactive-meter',site_id:'s',device_id:'d',profile_revision_id:'r',source_tag:'energy.active.import.total',canonical_tag:'energy.active.import.total',source_unit:'Wh',target_unit:'kWh',conversion:'wh-to-kwh',measurement_purpose:'grid-import'};
  const db={transaction:async(work:any)=>work({query:async(sql:string,params:any[])=>{
   if(sql.startsWith('SELECT id FROM sites'))return {rows:[{id:'s'}]};
   if(sql.startsWith('SELECT id FROM devices'))return {rows:[{id:'d'}]};
   if(sql.startsWith('SELECT id FROM billing_meters')||sql.includes('FROM billing_meters b'))return {rows:[]};
   if(sql.includes('FROM devices d'))return {rows:[{id:'d',payload_profile_revision_id:'r',config:DEFAULT_PAYLOAD_PROFILES[0]}]};
   if(sql.startsWith('SELECT id,billing_source_binding_id FROM billing_meters'))return {rows:[{id:'inactive-meter',billing_source_binding_id:'old'}]};
   if(sql.startsWith('SELECT * FROM billing_source_bindings'))return {rows:[previous]};
   writes.push({sql,params});
   if(sql.includes('INSERT INTO billing_meters'))return {rows:[{id:'inactive-meter',billing_source_binding_id:'old'}]};
   if(sql.includes('INSERT INTO billing_source_bindings'))return {rows:[{...previous,id:params[0],measurement_purpose:params[10]}]};
   return {rows:[]};
  }})};
  return {writes,result:await new BillingSourceBindingService(db as unknown as DatabaseService).bind('s',next,'actor')};
 };
 const same=await run({...input,measurementPurpose:'grid-import'});
 assert.equal(same.result?.id,'old');
 assert.ok(!same.writes.some(write=>write.sql.includes('INSERT INTO billing_source_bindings')));
 assert.ok(same.writes.some(write=>write.sql.includes("'billing_source.reactivate'")&&write.params[3].includes('"meterActive":false')&&write.params[4].includes('"meterActive":true')));
 await assert.rejects(()=>run(input),/Confirm billing impact/);
 const changed=await run({...input,billingImpactConfirmed:true});
 assert.notEqual(changed.result?.id,'old');
 assert.ok(changed.writes.some(write=>write.sql.includes('INSERT INTO billing_source_bindings')));
 assert.ok(changed.writes.some(write=>write.sql.includes('INSERT INTO audit_events')&&write.params[3].includes('"meterActive":false')));
});

test('latest invalid source does not display an older counter as currently verified',async()=>{
 const db={query:async(sql:string)=>({rows:sql.includes('FROM billing_meters')?[{meter_id:'meter',device_id:'d',payload_profile_revision_id:'r',billing_source_binding_id:'b',config:DEFAULT_PAYLOAD_PROFILES[0]}]:sql.includes('FROM billing_source_bindings')?[{id:'b',profile_revision_id:'r',device_id:'d',site_id:'s'}]:[{id:'bad',quality:'invalid',valueKwh:null,unit:'kWh',fresh:false}]})};
 const result=await new BillingSourceBindingService(db as unknown as DatabaseService).get('s');assert.equal(result.status,'invalid-data');assert.equal(result.latestVerifiedReading,null);
});

test('binding locks the device then meter before a fresh profile read and binds the post-lock revision',async()=>{
 let deviceLocked=false;const steps:string[]=[];
 const db={transaction:async(run:any)=>run({query:async(sql:string,params:any[])=>{
  if(sql.startsWith('SELECT id FROM sites'))return {rows:[{id:'s'}]};
  if(sql.startsWith('SELECT id FROM devices')){deviceLocked=true;steps.push('device');return {rows:[{id:'d'}]};}
  if(sql.startsWith('SELECT id FROM billing_meters')){steps.push('meter');return {rows:[{id:'meter'}]};}
  if(sql.includes('FROM billing_meters')){
   if(!sql.includes('FOR UPDATE'))steps.push('read');
   return {rows:[{id:'meter',device_id:'d',payload_profile_revision_id:deviceLocked?'post-apply':'r',config:DEFAULT_PAYLOAD_PROFILES[0],billing_source_binding_id:null}]};
  }
  if(sql.includes('INSERT INTO billing_source_bindings'))return {rows:[{id:params[0],profile_revision_id:params[4]}]};
  return {rows:[]};
 }})};
 const binding=await new BillingSourceBindingService(db as unknown as DatabaseService).bind('s',{...input,profileRevisionId:'post-apply'},'actor');
 assert.equal(binding?.profileRevisionId,'post-apply');assert.deepEqual(steps,['device','meter','read']);
});

test('archived or deleted sites cannot acquire a new billing binding',async()=>{
 for(const deleted of [false,true]){
  let bindings=0;
  const db={transaction:async(run:any)=>run({query:async(sql:string,params:any[])=>{
   if(sql.startsWith('SELECT id FROM sites'))return {rows:deleted||sql.includes("status<>'archived'")?[]:[{id:'s'}]};
   if(sql.startsWith('SELECT id FROM devices'))return {rows:[{id:'d'}]};
   if(sql.includes('FROM billing_meters'))return {rows:[{id:'meter',device_id:'d',payload_profile_revision_id:'r',config:DEFAULT_PAYLOAD_PROFILES[0],billing_source_binding_id:null}]};
   if(sql.includes('INSERT INTO billing_source_bindings')){bindings++;return {rows:[{id:params[0],profile_revision_id:'r'}]};}
   return {rows:[]};
  }})};
  await assert.rejects(new BillingSourceBindingService(db as unknown as DatabaseService).bind('s',input,'actor'),/Site not found/);
  assert.equal(bindings,0);
 }
});
