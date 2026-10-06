import test from 'node:test';
import assert from 'node:assert/strict';
import { DashboardService } from './dashboard.service.js';
import { DatabaseService } from '../../database/database.service.js';
const id='11111111-1111-4111-8111-111111111111';
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
