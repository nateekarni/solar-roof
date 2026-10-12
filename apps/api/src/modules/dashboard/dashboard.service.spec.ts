import test from 'node:test';
import assert from 'node:assert/strict';
import { DashboardService } from './dashboard.service.js';
import { DatabaseService } from '../../database/database.service.js';
const id='11111111-1111-4111-8111-111111111111';
test('detailed comparison keeps all columns and batches authorized queries',async()=>{
 const sites=Array.from({length:12},(_,index)=>({id:`11111111-1111-4111-8111-${String(index).padStart(12,'0')}`,name:'Same',customer_name:'Customer',capacity_mwp:'1'}));
 const {service,calls}=fixture(sites);
 const result=await service.comparison({role:'admin'},[], '2026-09-01','2026-09-30');
 assert.equal(result.sites.length,12);assert.ok(result.sites.every(site=>site.finance===null&&site.generatedKwh===null));
 assert.equal(calls.filter(call=>call.sql.includes('s.latitude')).length,1);
 assert.ok(!calls.some(call=>call.sql.includes('FROM billing_cycles')));
 await assert.rejects(service.comparison({role:'admin'},['other'],'2026-09-01','2026-09-30'),/outside assigned scope/);
 await assert.rejects(service.comparison({role:'admin'},[],'2026-01-01','2026-04-01'),/3 calendar months/);
});
test('detailed comparison customer strips technical fields and excludes unassigned sites',async()=>{
 const {service,calls}=fixture([{id,name:'A',customer_name:'C',capacity_mwp:'1',gateway:{name:'hidden'},devices:[{name:'hidden'}]}]);
 const result=await service.comparison({role:'customer_user',customerId:id,assignedSiteIds:[id]},[id],'2026-09-01','2026-09-30');
 assert.equal(result.sites[0]?.context?.gateway,null);assert.deepEqual(result.sites[0]?.context?.devices,[]);
 assert.equal(result.sites[0]?.finance?.cohortBilled,'0.00');assert.ok(!('cashReceived' in result.sites[0]!.finance!));
 for(const call of calls.slice(1))assert.deepEqual(call.params[0],[id]);
 await assert.rejects(service.comparison({role:'customer_user',customerId:id,assignedSiteIds:[id]},['22222222-2222-4222-8222-222222222222'],'2026-09-01','2026-09-30'),/outside assigned scope/);
});
test('selected site keeps authorized map coordinates without measurements from other sites',async()=>{
 const other='22222222-2222-4222-8222-222222222222';const calls:{sql:string;params:unknown[]}[]=[];
 const sites=[id,other].map((siteId,index)=>({id:siteId,name:`Site ${index}`,customer_name:'Customer',capacity_mwp:'1',latitude:'13.7',longitude:'100.8',gateway_id:null,gateway_name:null,last_seen_at:null}));
 const db={query:async(sql:string,params:unknown[]=[])=>{calls.push({sql,params});return {rows:sql.includes('FROM sites s JOIN customers')?(params[2]?sites.filter(s=>s.id===params[2]):sites):[]};}};
 const result=await new DashboardService(db as any).getSummary({role:'owner'},'2026-10-01','2026-10-07',id);
 assert.equal(result.sites.length,1);assert.deepEqual((result as any).availableMapSites,sites.map(s=>({id:s.id,externalSiteId:null,name:s.name,customerName:s.customer_name,latitude:13.7,longitude:100.8})));
 for(const call of calls.filter(c=>!c.sql.includes('FROM sites s JOIN customers')))assert.deepEqual(call.params[0],[id]);
 assert.ok(calls[0]?.sql.includes('ORDER BY created_at,id LIMIT 1'));
});
function fixture(sites:Record<string,unknown>[]=[]){
  const calls:{sql:string;params:unknown[]}[]=[];
  const db={query:async(sql:string,params:unknown[]=[])=>{calls.push({sql,params});return {rows:sql.includes('FROM sites s JOIN customers')?sites:[],rowCount:0};}};
  return {service:new DashboardService(db as unknown as DatabaseService),calls};
}

test('dashboard returns registered site and gateway codes while retaining navigation UUIDs',async()=>{
 const {service}=fixture([{id,name:'A',external_site_id:'SITE-A',external_gateway_id:'GW-A',customer_name:'Customer',capacity_mwp:'1',latitude:null,longitude:null,gateway_id:id,gateway_name:'Gateway',last_seen_at:null}]);
 const result=await service.getSummary({role:'owner'},'2026-10-01','2026-10-07');
 assert.equal(result.availableSites[0]?.externalSiteId,'SITE-A');
 assert.equal(result.sites[0]?.externalGatewayId,'GW-A');
 assert.equal(result.sites[0]?.id,id);
 const flow=await service.getPowerFlow({role:'owner'});
 assert.equal(flow.sites[0]?.externalSiteId,'SITE-A');
 assert.equal(flow.sites[0]?.gatewayId,id);
});
test('empty authorized sites produce no invented telemetry or rankings',async()=>{
  const {service}=fixture();const result=await service.getSummary({role:'customer_user',customerId:id,assignedSiteIds:[id]},'2026-01-01','2026-01-31');
  assert.equal(result.stats.currentMw,null);assert.equal(result.stats.periodKwh,null);assert.equal(result.stats.totalSites,0);
  assert.deepEqual(result.production,[]);assert.deepEqual(result.rankings,[]);assert.equal(result.stats.billCount,0);
  assert.deepEqual(await service.getPowerFlow({role:'customer_user',customerId:id,assignedSiteIds:[id]}),{sites:[]});
});
test('every measurement/billing query receives only server-authorized site IDs',async()=>{
  const {service,calls}=fixture([{id,name:'A',customer_name:'Customer',capacity_mwp:'1',latitude:null,longitude:null,gateway_id:null,gateway_name:null,last_seen_at:null}]);
  await service.getSummary({role:'customer_user',customerId:id,assignedSiteIds:[id]},'2026-01-01','2026-01-31');
  assert.deepEqual(calls[0]!.params[0],[id]);
  for(const call of calls.slice(1))assert.deepEqual(call.params[0],[id]);
});
test('unassigned customer users cannot receive global customer scope',async()=>{
  const {service,calls}=fixture();await service.getPowerFlow({role:'customer_user'});assert.deepEqual(calls[0]!.params[0],[]);
});
test('comparison rejects IDs outside allowed sites and missing roles fail closed',async()=>{
  const {service}=fixture();await assert.rejects(service.compare({role:'customer_user',customerId:id,assignedSiteIds:[id]},'periodKwh',[id],'2026-01-01','2026-01-31'),/outside assigned scope/);
  await assert.rejects(service.getPowerFlow({}),/access denied/);
});

test('comparison executes one scoped grouped query instead of one summary per site',async()=>{
 const site=(id:string)=>({id,name:id,customer_name:'Customer',capacity_mwp:'1',latitude:null,longitude:null,gateway_id:null,gateway_name:null,last_seen_at:null});
 const {service,calls}=fixture([site(id),site('22222222-2222-4222-8222-222222222222')]);
 const rows=await service.compare({role:'owner'},'periodAmount',[],'2026-01-01','2026-01-31');
 assert.equal(rows.length,2);assert.equal(calls.length,2);
});
test('admin dashboard ignores every legacy assignment',async()=>{
 const {service,calls}=fixture();await service.getPowerFlow({role:'admin',customerId:id,assignedCustomerIds:[id],assignedSiteIds:[id]});assert.deepEqual(calls[0]!.params,[null,null,null]);
});

test('generic billing meter power is never returned as verified PV',async()=>{const calls:string[]=[];const db={query:async(sql:string)=>{calls.push(sql);return {rows:sql.includes('FROM sites s JOIN customers')?[{id,name:'A',gateway_id:null,gateway_name:null,last_seen_at:null}]:sql.includes('sum(active_power_w)')?[{site_id:id,power_kw:'42',source_time:'2026-10-07T00:00:00Z',received_time:'2026-10-07T00:00:00Z'}]:[]};}};const result=await new DashboardService(db as any).getPowerFlow({role:'owner'});assert.equal(result.sites[0]?.meterPowerKw,42);assert.equal(result.sites[0]?.generationKw,null);assert.equal(result.sites[0]?.customerLoadKw,null);assert.equal(result.sites[0]?.gridImportKw,null);const pv=calls.find(sql=>sql.includes('WITH loggers'));assert.ok(pv?.includes("p.config->>'deviceType'='solar-logger'"));assert.ok(pv?.includes("ps.tag='solar.active_power'"));assert.ok(pv?.includes("quality='good'"));assert.ok(pv?.includes('expected_interval_seconds*2'));});

test('Organization power-flow rejects a site outside its server-assigned organization before telemetry lookup',async()=>{
 const {service,calls}=fixture();const other='22222222-2222-4222-8222-222222222222';
 await assert.rejects(()=>service.getPowerFlow({role:'customer_user',customerId:id,assignedSiteIds:[id]},other),/outside assigned scope/);
 assert.equal(calls.length,1);assert.deepEqual(calls[0]!.params,[[id],[id],other]);
});

test('Organization summary and comparison use independent logger energy, with missing site boundaries blocking aggregate',async()=>{
 const other='22222222-2222-4222-8222-222222222222',first=Date.parse('2026-08-31T17:00:00Z');
 const sites=[id,other].map(site_id=>({id:site_id,name:site_id,customer_name:'Organization',capacity_mwp:'1'}));
 let missing=false;const calls:string[]=[];
 const db={query:async(sql:string)=>{calls.push(sql);return {rows:sql.includes('FROM sites s JOIN customers')?sites:sql.includes("ps.tag='solar.total_yield'")?[id,other].flatMap(site_id=>Array.from({length:721},(_,hour)=>({site_id,device_id:site_id,polled_at:new Date(first+hour*3600000).toISOString(),value:String(100000+hour*52100/24)}))).filter(row=>!missing||row.site_id!==other||Date.parse(row.polled_at)!==first+86400000):sql.includes('WITH samples AS')?[{site_id:id,day:'2026-09-01',value:'2465.7'}]:[]};}};
 const service=new DashboardService(db as any),user={role:'customer_user',customerId:id,assignedSiteIds:[id]};
 const summary=await service.getSummary(user,'2026-09-01','2026-09-30');assert.ok(Math.abs(summary.stats.periodKwh!-3126)<1e-8);
 assert.ok(!calls.some(sql=>sql.includes('WITH samples AS')));assert.ok(summary.production.every(row=>row.quality==='complete'));
 const comparison=await service.compare(user,'periodKwh',[],'2026-09-01','2026-09-30');assert.ok(comparison.every(row=>Math.abs(row.value!-1563)<1e-8));
 missing=true;const incomplete=await service.getSummary(user,'2026-09-01','2026-09-30');assert.equal(incomplete.stats.periodKwh,null);assert.equal(incomplete.sites.find(site=>site.id===other)?.productionKwh,null);assert.ok(incomplete.production.some(row=>row.value===null&&row.quality==='missing'));
});


test('service enforces calendar month cap even when called without controller',async()=>{
 const {service}=fixture();
 await assert.rejects(service.getSummary({role:'owner'},'2026-01-31','2026-04-01'),/3 calendar months/);
 await assert.rejects(service.compare({role:'owner'},'periodKwh',[],'2026-01-31','2026-04-01'),/3 calendar months/);
});
test('summary exposes observed energy and completeness while preserving graph gaps',async()=>{
 const sites=['a','b','c'].map(id=>({id,name:id,customer_name:'C',capacity_mwp:'1'}));
 const db={query:async(sql:string)=>({rows:sql.includes('FROM sites s JOIN customers')?sites:sql.includes("ps.tag='solar.total_yield'")?[
 {site_id:'a',device_id:'a',polled_at:'2026-08-31T17:00:00Z',value:'0'},
 {site_id:'a',device_id:'a',polled_at:'2026-09-01T17:00:00Z',value:'10000'},
 {site_id:'b',device_id:'b',polled_at:'2026-08-31T18:00:00Z',value:'1000'},
 {site_id:'b',device_id:'b',polled_at:'2026-08-31T19:00:00Z',value:'3000'}]:[]})};
 const result=await new DashboardService(db as any).getSummary({role:'owner'},'2026-09-01','2026-09-01');
 assert.equal(result.stats.periodKwh,null);
 assert.deepEqual((result.stats as any).energy,{observedKwh:12,quality:'partial',completeSites:1,partialSites:1,unavailableSites:1});
 assert.equal(result.production[0]?.value,null);assert.equal((result.production[0] as any).observedValue,12);
});

test('financial comparison query excludes unissued, cancelled and superseded cycles',async()=>{
 const {service,calls}=fixture([{id,name:'A'}]);
 await service.compare({role:'owner'},'periodAmount',[],'2026-09-01','2026-09-30');
 const sql=calls[1]!.sql;
 assert.match(sql,/b.status NOT IN\('draft','cancelled','superseded'\)/);
 assert.match(sql,/d.is_current/);assert.match(sql,/d.status IN\('issued','finalized'\)/);
});
test('daily financial series uses cohort start for invoices and actual approved payment day for cash',async()=>{
 const {service,calls}=fixture([{id,name:'A'}]);
 const result=await service.getSummary({role:'owner'},'2026-09-01','2026-09-30');
 assert.ok(Array.isArray((result as any).cashReceivedDaily));
 assert.ok(calls.some(call=>call.sql.includes('b.period_start::text AS day')));
 assert.ok(calls.some(call=>call.sql.includes('GROUP BY day')&&call.sql.includes('verified_transfer_at')));
});
test('day drilldown rejects multi-day and unauthorized site and returns measured hourly buckets only on demand',async()=>{
 const {service}=fixture();
 await assert.rejects((service as any).getDay({role:'owner'},'2026-09-01','2026-09-02'),/single day/);
 await assert.rejects((service as any).getDay({role:'owner'},'2026-09-01','2026-09-01',id),/outside assigned scope/);
});

test('customer day drilldown queries only authorized site and exposes no technical device metadata',async()=>{
 const sites=[{id,name:'Assigned',customer_name:'Customer',capacity_mwp:'1'}];
 const calls:{sql:string;params:unknown[]}[]=[];
 const db={query:async(sql:string,params:unknown[]=[])=>{calls.push({sql,params});return {rows:sql.includes('FROM sites s JOIN customers')?sites:[{site_id:id,device_id:'private-device',polled_at:'2026-08-31T17:00:00Z',value:'0'},{site_id:id,device_id:'private-device',polled_at:'2026-08-31T18:00:00Z',value:'1000'}]};}};
 const result=await new DashboardService(db as any).getDay({role:'customer_user',customerId:id,assignedSiteIds:[id]},'2026-09-01','2026-09-01',id);
 assert.deepEqual(calls[1]?.params,[[id],'2026-09-01','2026-09-01']);assert.equal(result.sites[0]?.points[0]?.value,1);assert.equal(result.sites[0]?.points.length,24);assert.ok(!JSON.stringify(result).includes('private-device'));
});

test('comparison fingerprints identify actual source profile and suppress unknown or multiple sources',async()=>{
 const site={id,name:'A',customer_name:'Customer',capacity_mwp:'1'};
 let profile:string|undefined='profile-a',device='device-a',multiple=false;
 const db={query:async(sql:string)=>({rows:sql.includes('FROM sites s JOIN customers')?[site]:sql.includes("ps.tag='solar.total_yield'")?[
 {site_id:id,device_id:device,profile_revision_id:profile,polled_at:'2026-08-31T17:00:00Z',value:'0'},
 {site_id:id,device_id:multiple?'device-b':device,profile_revision_id:profile,polled_at:'2026-09-01T17:00:00Z',value:'1000'}]:[]})};
 const service=new DashboardService(db as any),read=async()=>(await service.getSummary({role:'owner'},'2026-09-01','2026-09-01')).sites[0] as any;
 const first=(await read()).sourceFingerprint;assert.equal(typeof first,'string');assert.equal(first.length,64);
 assert.equal((await read()).sourceFingerprint,first);
 profile='profile-b';assert.notEqual((await read()).sourceFingerprint,first);
 profile=undefined;assert.equal((await read()).sourceFingerprint,null);
 profile='profile-a';multiple=true;assert.equal((await read()).sourceFingerprint,null);
});

test('customer summary strips technical context while retaining authorized business rate',async()=>{
 const site={id,name:'Site',customer_name:'Customer',capacity_mwp:'1'};
 const db={query:async(sql:string)=>({rows:sql.includes('AS gateway')?[{id,name:'Site',gateway:{topic:'private/topic'},devices:[{name:'private-device'}]}]:sql.includes('FROM sites s JOIN customers')?[site]:sql.includes('FROM site_billing_settings')?[{rate:'3.5'}]:[]})};
 const result=await new DashboardService(db as any).getSummary({role:'customer_user',customerId:id,assignedSiteIds:[id]},'2026-09-01','2026-09-01',id);
 assert.equal(result.selectedSite?.gateway,null);assert.deepEqual(result.selectedSite?.devices,[]);
 assert.equal(result.selectedSite?.business?.rate,'3.5');
});

test('owner can read the selected site configuration summary without technical write access',async()=>{
 const site={id,name:'Site',customer_name:'Customer',capacity_mwp:'1'};
 const db={query:async(sql:string)=>({rows:sql.includes('AS gateway')?[{id,name:'Site',gateway:{name:'Gateway A',topic:'solar/site'},devices:[{name:'Meter A',billingSource:true}]}]:sql.includes('FROM sites s JOIN customers')?[site]:[]})};
 const result=await new DashboardService(db as any).getSummary({role:'owner'},'2026-09-01','2026-09-01',id);
 assert.equal(result.selectedSite?.gateway?.name,'Gateway A');assert.equal(result.selectedSite?.devices[0]?.name,'Meter A');
});
