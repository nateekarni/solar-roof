import assert from 'node:assert/strict';
import test from 'node:test';
import { MqttIngestionService } from './mqtt-ingestion.service.js';

for(const standard of [true,false])test(`hardware config retains ${standard?'standard code':'legacy name'} routing when external codes exist`,async()=>{
 const sent:{topic:string;body:Record<string,unknown>}[]=[];
 const gateway={brokerId:null,endpoint:standard?'solar/v1/sites/SITE-001/gateways/GW-001/devices/+/telemetry':'energy/Display-Gateway/#',externalSiteId:'SITE-001',externalGatewayId:'GW-001'};
 const db={query:async()=>({rows:[gateway]})};
 const service=new MqttIngestionService(db as never,db as never);
 (service as unknown as {client:unknown}).client={connected:true,publish:(topic:string,body:string,_options:unknown,callback:(error?:Error)=>void)=>{sent.push({topic,body:JSON.parse(body)});callback();}};
 assert.equal(await service.publishHardwareConfig('Display-Gateway',{pollingInterval:10}),true);
 assert.equal(sent[0]?.topic,standard?'solar/v1/sites/SITE-001/gateways/GW-001/config':'energy/Display-Gateway/config');
 assert.equal(sent[0]?.body.gateway,'Display-Gateway');
 if(standard){assert.equal(sent[0]?.body.siteId,'SITE-001');assert.equal(sent[0]?.body.gatewayId,'GW-001');}
 else assert.equal(sent[0]?.body.gatewayId,undefined);
});

test('live telemetry projects registered codes separately from internal references',async()=>{
 const row={device_id:'device-uuid',gatewayId:'gateway-uuid',externalSiteId:'SITE-001',externalGatewayId:'GW-001',externalDeviceId:'METER-001',source_time:new Date(),received_time:new Date(),quality:'complete'};
 const db={query:async(sql:string)=>({rows:sql.includes('payload_samples')?[]:[row]})};
 const live=await new MqttIngestionService(db as never,db as never).getLatestTelemetry('site-uuid');
 assert.equal(live?.siteId,'site-uuid');assert.equal(live?.gatewayId,'gateway-uuid');assert.equal(live?.deviceId,'device-uuid');
 assert.equal(live?.externalSiteId,'SITE-001');assert.equal(live?.externalGatewayId,'GW-001');assert.equal(live?.externalDeviceId,'METER-001');
});
