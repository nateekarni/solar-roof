import test from 'node:test';
import assert from 'node:assert/strict';
import { DashboardService } from './dashboard.service.js';
import { DatabaseService } from '../../database/database.service.js';
const id='11111111-1111-4111-8111-111111111111';
test('selected site keeps authorized map coordinates without measurements from other sites',async()=>{
 const other='22222222-2222-4222-8222-222222222222';const calls:{sql:string;params:unknown[]}[]=[];
 const sites=[id,other].map((siteId,index)=>({id:siteId,name:`Site ${index}`,school_name:'School',capacity_mwp:'1',latitude:'13.7',longitude:'100.8',gateway_id:null,gateway_name:null,last_seen_at:null}));
 const db={query:async(sql:string,params:unknown[]=[])=>{calls.push({sql,params});return {rows:sql.includes('FROM sites s JOIN schools')?(params[2]?sites.filter(s=>s.id===params[2]):sites):[]};}};
 const result=await new DashboardService(db as any).getSummary({role:'owner'},'2026-10-01','2026-10-07',id);
 assert.equal(result.sites.length,1);assert.deepEqual((result as any).availableMapSites,sites.map(s=>({id:s.id,name:s.name,schoolName:s.school_name,latitude:13.7,longitude:100.8})));
 for(const call of calls.filter(c=>!c.sql.includes('FROM sites s JOIN schools')))assert.deepEqual(call.params[0],[id]);
 assert.ok(calls[0]?.sql.includes('ORDER BY created_at,id LIMIT 1'));
});
function fixture(sites:Record<string,unknown>[]=[]){
  const calls:{sql:string;params:unknown[]}[]=[];
  const db={query:async(sql:string,params:unknown[]=[])=>{calls.push({sql,params});return {rows:sql.includes('FROM sites s JOIN schools')?sites:[],rowCount:0};}};
  return {service:new DashboardService(db as unknown as DatabaseService),calls};
}
test('empty authorized sites produce no invented telemetry or rankings',async()=>{
  const {service}=fixture();const result=await service.getSummary({role:'school_user',schoolId:id},'2026-01-01','2026-01-31');
  assert.equal(result.stats.currentMw,null);assert.equal(result.stats.periodKwh,null);assert.equal(result.stats.totalSites,0);
  assert.deepEqual(result.production,[]);assert.deepEqual(result.rankings,[]);assert.equal(result.stats.billCount,0);
  assert.deepEqual(await service.getPowerFlow({role:'school_user',schoolId:id}),{sites:[]});
});
test('every measurement/billing query receives only server-authorized site IDs',async()=>{
  const {service,calls}=fixture([{id,name:'A',school_name:'School',capacity_mwp:'1',latitude:null,longitude:null,gateway_id:null,gateway_name:null,last_seen_at:null}]);
  await service.getSummary({role:'school_user',schoolId:id},'2026-01-01','2026-01-31');
  assert.deepEqual(calls[0]!.params[0],[id]);
  for(const call of calls.slice(1))assert.deepEqual(call.params[0],[id]);
});
test('unassigned school users cannot receive global school scope',async()=>{
  const {service,calls}=fixture();await service.getPowerFlow({role:'school_user'});assert.deepEqual(calls[0]!.params[0],[]);
});
test('comparison rejects IDs outside allowed sites and missing roles fail closed',async()=>{
  const {service}=fixture();await assert.rejects(service.compare({role:'school_user',schoolId:id},'periodKwh',[id],'2026-01-01','2026-01-31'),/outside assigned scope/);
  await assert.rejects(service.getPowerFlow({}),/access denied/);
});

test('comparison executes one scoped grouped query instead of one summary per site',async()=>{
 const site=(id:string)=>({id,name:id,school_name:'School',capacity_mwp:'1',latitude:null,longitude:null,gateway_id:null,gateway_name:null,last_seen_at:null});
 const {service,calls}=fixture([site(id),site('22222222-2222-4222-8222-222222222222')]);
 const rows=await service.compare({role:'owner'},'periodAmount',[],'2026-01-01','2026-01-31');
 assert.equal(rows.length,2);assert.equal(calls.length,2);
});
test('admin dashboard ignores every legacy assignment',async()=>{
 const {service,calls}=fixture();await service.getPowerFlow({role:'admin',schoolId:id,assignedSchoolIds:[id],assignedSiteIds:[id]});assert.deepEqual(calls[0]!.params,[null,null,null]);
});

test('generic billing meter power is never returned as verified PV',async()=>{const calls:string[]=[];const db={query:async(sql:string)=>{calls.push(sql);return {rows:sql.includes('FROM sites s JOIN schools')?[{id,name:'A',gateway_id:null,gateway_name:null,last_seen_at:null}]:sql.includes('sum(active_power_w)')?[{site_id:id,power_kw:'42',source_time:'2026-10-07T00:00:00Z',received_time:'2026-10-07T00:00:00Z'}]:[]};}};const result=await new DashboardService(db as any).getPowerFlow({role:'owner'});assert.equal(result.sites[0]?.meterPowerKw,42);assert.equal(result.sites[0]?.generationKw,null);assert.equal(result.sites[0]?.schoolLoadKw,null);assert.equal(result.sites[0]?.gridImportKw,null);const pv=calls.find(sql=>sql.includes('WITH loggers'));assert.ok(pv?.includes("p.config->>'deviceType'='solar-logger'"));assert.ok(pv?.includes("ps.tag='solar.active_power'"));assert.ok(pv?.includes("quality='good'"));assert.ok(pv?.includes('120 seconds'));});

test('Organization power-flow rejects a site outside its server-assigned organization before telemetry lookup',async()=>{
 const {service,calls}=fixture();const other='22222222-2222-4222-8222-222222222222';
 await assert.rejects(()=>service.getPowerFlow({role:'school_user',schoolId:id},other),/outside assigned scope/);
 assert.equal(calls.length,1);assert.deepEqual(calls[0]!.params,[[id],null,other]);
});
