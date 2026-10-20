import test from 'node:test';import assert from 'node:assert/strict';
import {AssetsController} from './assets.controller.js';
import type {DatabaseService} from '../../database/database.service.js';import type {MqttIngestionService} from '../telemetry/mqtt-ingestion.service.js';
test('business site can be created before any gateway or meter exists',async()=>{
 const queries:string[]=[];const client={query:async(sql:string)=>{queries.push(sql);return {rows:sql.includes('FROM customers')?[{id:'customer',status:'active'}]:sql.includes('RETURNING')?[{id:'site',customerId:'customer',externalSiteId:'SITE001'}]:[],rowCount:1};}};
 const db={transaction:async(fn:(c:typeof client)=>Promise<unknown>)=>fn(client),query:client.query} as unknown as DatabaseService;
 const controller=new AssetsController(db,{} as MqttIngestionService);
 const result=await controller.createSite({name:'โรงเรียนบ้านสวน',customerId:'customer',capacityMwp:0.2});
 assert.equal(result.configDelivery,'pending');assert.ok(queries.some(q=>q.includes('INSERT INTO sites')));assert.ok(!queries.some(q=>q.includes('INSERT INTO gateways')));
});
test('renaming an existing gateway preserves its broker and polling interval when omitted',async()=>{
 let written:unknown[]=[];
 const gateway={id:'gateway',site_id:'site',version:0,external_gateway_id:'GW001',mqtt_broker_id:'broker',polling_interval_seconds:45,protocol:'modbus',endpoint:'legacy/topic'};
 const client={query:async(sql:string,params:unknown[]=[])=>{if(sql.includes('external_gateway_id=$1'))return {rows:[]};if(sql.includes('INSERT INTO gateways')){written=params;return {rows:[gateway]};}return {rows:sql.includes('FROM sites')?[{id:'site',external_site_id:'SITE001'}]:sql.includes('FROM gateways')?[gateway]:[]};}};
 const db={transaction:async(fn:(c:typeof client)=>Promise<unknown>)=>fn(client)} as unknown as DatabaseService;
 await new AssetsController(db,{refreshSubscriptions:async()=>{},publishHardwareConfig:async()=>false} as unknown as MqttIngestionService).configureGateway('site',{name:'มิเตอร์โรงเรียน'});
 assert.equal(written[5],'broker');assert.equal(written[6],45);
});
test('gateway configuration refreshes subscriptions and reports pending offline hardware delivery',async()=>{
 const client={query:async(sql:string)=>({rows:sql.startsWith('SELECT site_id FROM gateways')||sql.startsWith('SELECT * FROM gateways WHERE id=')?[{id:'gateway',site_id:'site'}]:sql.includes('FROM sites')?[{id:'site',external_site_id:'SITE001'}]:sql.includes('INSERT INTO gateways')?[{id:'gateway',name:'เกตเวย์โรงเรียน',externalGatewayId:'GW001'}]:sql.includes('desired_config_version AS version')?[{id:'gateway',version:0,endpoint:'solar/v1/sites/SITE001/gateways/GW001/devices/+/telemetry',pollingIntervalSeconds:30,alertRules:{}}]:[]})};
 const db={transaction:async(fn:(c:typeof client)=>Promise<unknown>)=>fn(client)} as unknown as DatabaseService;
 let refreshed=false;
 const mqtt={refreshSubscriptions:async()=>{refreshed=true;},publishHardwareConfig:async()=>false} as unknown as MqttIngestionService;
 const result=await new AssetsController(db,mqtt).configureGateway('site',{name:'เกตเวย์โรงเรียน',pollingIntervalSeconds:30});
 assert.equal(refreshed,true);assert.equal(result.configDelivery,'pending');assert.equal(result.configurationVersion,1);
});
