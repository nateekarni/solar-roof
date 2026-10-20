import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatabaseService } from '../../database/database.service.js';
import { MeasurementComparisons } from './measurement-comparisons.js';

test('managed gateway comparison takes site and gateway references before device locks and pair FK insert',async()=>{
 const left='11111111-1111-4111-8111-111111111111',right='22222222-2222-4222-8222-222222222222',calls:string[]=[];
 const query=async(sql:string)=>{
  calls.push(sql);
  if(sql.includes('FROM sites'))return {rows:[{id:'site'}]};
  if(sql.includes('FROM gateways'))return {rows:[{id:'gateway',site_id:'site',controlManaged:true}]};
  if(sql.includes('FROM devices d'))return {rows:[left,right].map(id=>({id,config:{fields:[{tag:'solar.total_yield',targetUnit:'kWh'}]}}))};
  return {rows:[]};
 };
 const db={query,transaction:async(work:(client:{query:typeof query})=>Promise<unknown>)=>work({query})} as unknown as DatabaseService;
 const result=await new MeasurementComparisons(db).create('gateway',{leftDeviceId:left,rightDeviceId:right,leftTag:'solar.total_yield',rightTag:'solar.total_yield',kind:'energy'});
 assert.equal(result.alertEnabled,false);
 const site=calls.findIndex(sql=>sql.includes('FROM sites')&&sql.includes('FOR KEY SHARE'));
 const gateway=calls.findIndex(sql=>sql.includes('FROM gateways')&&sql.includes('FOR KEY SHARE'));
 const device=calls.findIndex(sql=>sql.includes('FROM devices d')&&sql.includes('FOR SHARE'));
 assert.ok(site>=0&&gateway>site&&device>gateway);
 assert.ok(calls.findIndex(sql=>sql.startsWith('INSERT INTO measurement_comparison_pairs'))>device);
});
