import test from 'node:test';
import assert from 'node:assert/strict';
import { generationDays, GENERATION_SAMPLES_SQL } from './generation-energy.js';
const start=Date.parse('2026-08-31T17:00:00Z');
function samples(){return ['a','b'].flatMap(site_id=>Array.from({length:721},(_,hour)=>({site_id,device_id:site_id,polled_at:new Date(start+hour*3600000).toISOString(),value:String(100000+hour*52100/24)})));}
test('two independent solar loggers produce measured September 3126 kWh',()=>{
 const rows=generationDays(['a','b'],'2026-09-01','2026-09-30',samples(),Date.parse('2026-10-01T00:00:00Z'));
 assert.equal(rows.length,60);assert.ok(rows.every(row=>row.quality==='complete'));
 assert.ok(Math.abs(rows.reduce((sum,row)=>sum+Number(row.value),0)-3126)<1e-8);
 for(const site of ['a','b'])assert.ok(Math.abs(rows.filter(row=>row.site_id===site).reduce((sum,row)=>sum+Number(row.value),0)-1563)<1e-8);
});
test('missing actual daily boundary prevents complete aggregate and never substitutes zero',()=>{
 const rows=generationDays(['a','b'],'2026-09-01','2026-09-30',samples().filter(row=>!(row.site_id==='a'&&Date.parse(row.polled_at)===start+24*3600000)),Date.parse('2026-10-01T00:00:00Z'));
 assert.equal(rows.filter(row=>row.value===null).length,2);assert.ok(rows.filter(row=>row.value===null).every(row=>row.quality==='missing'));
 assert.equal(generationDays(['none'],'2026-09-01','2026-09-01',[],start+86400000)[0]?.value,null);
});
test('current day uses observed counters with partial quality and reset never becomes production',()=>{
 const input=samples().filter(row=>row.site_id==='a'&&Date.parse(row.polled_at)<=start+3600000);
 assert.equal(generationDays(['a'],'2026-09-01','2026-09-01',input,start+3600000)[0]?.quality,'partial');
 const reset=[input[0]!,{...input[1]!,value:'0'}];assert.equal(generationDays(['a'],'2026-09-01','2026-09-01',reset,start+3600000)[0]?.quality,'reset');
});
test('canonical query excludes billing meters and unpinned/unhealthy payloads',()=>{
 assert.ok(!GENERATION_SAMPLES_SQL.includes('billing_meters'));assert.ok(!GENERATION_SAMPLES_SQL.includes('telemetry_raw'));
 for(const requirement of ["deviceType'='solar-logger'","solar.total_yield","profile_revision_id=d.payload_profile_revision_id","quality='good'","communication='online'","unit='Wh'"])assert.ok(GENERATION_SAMPLES_SQL.includes(requirement),requirement);
});
