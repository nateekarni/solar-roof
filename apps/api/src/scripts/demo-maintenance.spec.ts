import assert from 'node:assert/strict';import test from 'node:test';import {deleteGateway,deleteSite,parseDemoMaintenance} from './demo-maintenance.js';
const base={DATABASE_URL:'postgresql://test:test@localhost/test',DEMO_MAINTENANCE_ENABLED:'true'};
test('demo maintenance uses non-interactive exact confirmation tokens',()=>{
 assert.equal(parseDemoMaintenance({...base,DEMO_ACTION:'reset-billing',DEMO_TARGET:'SITE-001',DEMO_CONFIRM:'RESET-BILLING:SITE-001'}).action,'reset-billing');
 assert.equal(parseDemoMaintenance({...base,DEMO_ACTION:'delete-gateway',DEMO_TARGET:'GW-001',DEMO_CONFIRM:'DELETE-GATEWAY:GW-001'}).target,'GW-001');
 assert.equal(parseDemoMaintenance({...base,DEMO_ACTION:'delete-site',DEMO_TARGET:'SITE-001',DEMO_CONFIRM:'DELETE-SITE:SITE-001'}).target,'SITE-001');
 for(const env of [{...base,DEMO_ACTION:'delete-site',DEMO_TARGET:'SITE-001',DEMO_CONFIRM:'wrong'},{...base,DEMO_ACTION:'delete-gateway',DEMO_TARGET:'',DEMO_CONFIRM:'DELETE-GATEWAY:'},{...base,DEMO_ACTION:'reset-billing',DEMO_TARGET:'SITE-001',DEMO_CONFIRM:'RESET'}])assert.throws(()=>parseDemoMaintenance(env));
});
test('targeted maintenance resolves exactly one row and never sends parameterized multi-statements',async()=>{
 const calls:string[]=[];const db:any={query:async(sql:string,values?:unknown[])=>{calls.push(sql);if(values?.length&&sql.includes(';'))throw Error('parameterized multi-statement');if(sql.includes('FROM gateways WHERE id::text'))return {rows:[{id:'gateway-id',external_gateway_id:'GW-001',name:'Gateway'}]};if(sql.includes(' AS referenced'))return {rows:[{referenced:false}]};if(sql.includes(' AS preserved')&&sql.includes('demo_preset_counts'))return {rows:[{preserved:true}]};if(sql.includes('FROM sites WHERE id::text'))return {rows:[{id:'site-id',external_site_id:'SITE-001',name:'Site'}]};if(sql.includes(' AS gateways')&&sql.includes(' AS devices'))return {rows:[{gateways:'0',devices:'0',contracts:'0',cycles:'0',documents:'0'}]};if(sql.includes(' AS value'))return {rows:[{value:true}]};return {rows:[]};}};
 assert.equal((await deleteGateway(db,'GW-001')).presetsPreserved,true);assert.equal((await deleteSite(db,'SITE-001')).unrelatedDataPreserved,true);assert.ok(calls.length>10);
});
