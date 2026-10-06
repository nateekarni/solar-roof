import assert from 'node:assert/strict';
import test from 'node:test';
import {RefreshEnergySummaryJob} from '../src/jobs/refresh-energy-summary.job.js';
test('payload revision upgrade breaks billing continuity rather than mixing revisions',async()=>{
 let saved:any[]=[];const query=async(sql:string,values:any[]=[])=>{
  if(sql.includes('SELECT device_id,day::text'))return {rows:[{device_id:'d',day:'2026-01-01',version:'1'}]};
  if(sql.includes('SELECT site_id FROM devices'))return {rows:[{site_id:'s'}]};
  if(sql.includes('SELECT source_time::text'))return {rows:[{at:sql.includes('source_time>$2')?'2026-01-02T00:00:00+07:00':'2026-01-01T00:00:00+07:00',kwh:sql.includes('source_time>$2')?'110':'100',quality:'complete',mapping:sql.includes('payload_profile_revision_id')?(sql.includes('source_time>$2')?'revision2':'revision1'):null,conflict:false}]};
  if(sql.includes('INSERT INTO energy_daily'))saved=values;return {rows:[]};
 };const job=new RefreshEnergySummaryJob({connect:async()=>({query,release(){}})} as any);await job.runBatch(1);assert.equal(saved[8],null);assert.equal(saved[9],'missing');assert.equal(saved[11],'invalid_sample');
});
