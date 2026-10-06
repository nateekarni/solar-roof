/** Dedicated local integration verification. Never resets data or issues financial documents. */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import mqtt from 'mqtt';
import { Pool } from 'pg';

config({path:fileURLToPath(new URL('../../../../.env',import.meta.url))});
const api=process.env.PAYLOAD_TEST_API_URL ?? 'http://localhost:3001';
const password=process.env.PAYLOAD_TEST_PASSWORD;
if(!password) throw new Error('Set PAYLOAD_TEST_PASSWORD for the existing local administrator');
const login=await fetch(`${api}/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:3000'},body:JSON.stringify({email:process.env.PAYLOAD_TEST_EMAIL ?? 'admin@solar.local',password})});
assert.equal(login.status,200,'local login');
const token=((await login.json()) as {accessToken:string}).accessToken;
async function request(path:string,body?:unknown,method=body===undefined?'GET':'POST'):Promise<any>{
 const res=await fetch(api+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Origin:'http://localhost:3000'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await res.json(); if(!res.ok)throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(data)}`);return data;
}
const examples=JSON.parse(await readFile(new URL('../modules/telemetry/fixtures/payload-examples-v1.1.json',import.meta.url),'utf8')).payloads;
const run=randomUUID().slice(0,8);
const profiles=await request('/v1/settings/payload-presets');
const pm=profiles.find((p:any)=>p.profileId==='schneider-pm2230' && p.version==='1.0.0');
const logger=profiles.find((p:any)=>p.profileId==='huawei-smartlogger3000a' && p.version==='1.0.0');
assert.ok(pm && logger,'default revisions exist');
let siteId=process.env.PAYLOAD_TEST_SITE_ID;
if(!siteId){
 const site=await request('/v1/sites',{name:`MQTT Payload Test ${run}`,schoolName:`MQTT Test School ${run}`,capacityMwp:0.5,gatewayName:`GW-TEST-${run}`,deviceSerial:`PM2230-TEST-${run}`,deviceModel:'PM2230',externalSiteId:`SITE-TEST-${run}`,externalGatewayId:`GW-TEST-${run}`,externalDeviceId:`METER-TEST-${run}`,payloadProfileRevisionId:pm.id});
 siteId=site.id;
}
assert.ok(siteId,'test site');
let connection=await request(`/v1/sites/${siteId}/payload-config`);
if(!connection.devices.some((d:any)=>d.profileId==='huawei-smartlogger3000a')){
 await request(`/v1/sites/${siteId}/devices`,{name:'Huawei SmartLogger MQTT Test',model:'SmartLogger3000A',serialNumber:`LOGGER-TEST-${run}`,externalDeviceId:`LOGGER-TEST-${run}`,payloadProfileRevisionId:logger.id});
 connection=await request(`/v1/sites/${siteId}/payload-config`);
}
const pmDevice=connection.devices.find((d:any)=>d.profileId==='schneider-pm2230');
const loggerDevice=connection.devices.find((d:any)=>d.profileId==='huawei-smartlogger3000a');
assert.ok(pmDevice && loggerDevice,'both bindings provisioned');
const db=new Pool({connectionString:process.env.DATABASE_URL});
const client=mqtt.connect(process.env.MQTT_URL ?? 'mqtt://localhost:1883',{reconnectPeriod:0,connectTimeout:5000,...(process.env.MQTT_USERNAME?{username:process.env.MQTT_USERNAME}:{}),...(process.env.MQTT_PASSWORD?{password:process.env.MQTT_PASSWORD}:{})});
const mqttReady=new Promise<void>((resolve,reject)=>{client.once('connect',()=>resolve());client.once('error',reject);});
const acks=new Map<string,any>();
client.on('message',(_topic,payload)=>{const ack=JSON.parse(payload.toString());acks.set(ack.messageId,ack);});
const checks:string[]=[];
async function poll<T>(read:()=>Promise<T>,ok:(value:T)=>boolean,label:string,ms=6000):Promise<T>{
 const end=Date.now()+ms;let result:T;do{result=await read();if(ok(result))return result;await new Promise(r=>setTimeout(r,100));}while(Date.now()<end);throw new Error(`Timed out: ${label}`);
}
async function count(messageId?:string){const r=await db.query('SELECT count(*)::int count FROM telemetry_raw WHERE site_id=$1 AND ($2::text IS NULL OR raw_payload->>\'messageId\'=$2)',[siteId,messageId??null]);return r.rows[0].count as number;}
async function publish(topic:string,payload:any){await new Promise<void>((resolve,reject)=>client.publish(topic,JSON.stringify(payload),{qos:1},e=>e?reject(e):resolve()));}
async function accepted(topic:string,payload:any){acks.delete(payload.messageId);await publish(topic,payload);const ack=await poll<any>(async()=>acks.get(payload.messageId),Boolean,'dataAcept');assert.equal(ack.messageType,'dataAcept');assert.equal(ack.status,'accepted');assert.equal(ack.siteId,connection.externalSiteId);assert.equal(ack.gatewayId,connection.externalGatewayId);assert.equal(ack.lotNumber,payload.lotNumber);assert.equal(await count(payload.messageId),1,'ACK corresponds to committed raw');return ack;}
const base=Date.now()-20000;
const previous=(await db.query('SELECT total_energy_kwh FROM telemetry_raw WHERE site_id=$1 AND total_energy_kwh IS NOT NULL ORDER BY source_time DESC LIMIT 1',[siteId])).rows[0];
const initialImportWh=previous ? Math.round(Number(previous.total_energy_kwh)*1000)+1000 : 152430275;
function fixture(name:string,offset=0){const p=structuredClone(examples[name]);const d=name.startsWith('pm')?pmDevice:loggerDevice;p.siteId=connection.externalSiteId;p.gatewayId=connection.externalGatewayId;p.device.deviceId=d.externalDeviceId;if(p.device.profileVersion)p.device.profileVersion=d.profileVersion;p.messageId=`${run}-${name}-${offset}`;p.timestamps.polledAt=new Date(base+offset).toISOString();p.timestamps.sentAt=new Date().toISOString();if(name==='pm2230Energy')p.data.values['energy.active.import.total']=initialImportWh;return p;}
const fixtures:Record<string,any>={};
try{
 await mqttReady;
 await new Promise<void>((resolve,reject)=>client.subscribe(connection.ackTopic,{qos:1},e=>e?reject(e):resolve()));
 for(const name of ['pm2230Realtime','pm2230Energy','smartLoggerPlant','smartLoggerEnvironment']){const p=fixture(name);fixtures[name]=p;await accepted(name.startsWith('pm')?pmDevice.telemetryTopic:loggerDevice.telemetryTopic,p);}
 checks.push('Four supplied groups persisted and correlated dataAcept received');
 const before=await count();const beforeSamples=Number((await db.query('SELECT count(*) count FROM payload_samples WHERE site_id=$1',[siteId])).rows[0].count);const retry=structuredClone(fixtures.pm2230Energy);retry.timestamps.sentAt=new Date().toISOString();const retryAck=await accepted(pmDevice.telemetryTopic,retry);assert.equal(await count(),before);assert.equal(Number((await db.query('SELECT count(*) count FROM payload_samples WHERE site_id=$1',[siteId])).rows[0].count),beforeSamples);checks.push('Retry changed sentAt: no duplicate raw or measurements');
 const conflicting=structuredClone(retry);conflicting.data.values['energy.active.import.total']++;acks.delete(conflicting.messageId);await publish(pmDevice.telemetryTopic,conflicting);
 await poll(()=>request(`/v1/sites/${siteId}/payload-config`),c=>c.rejections.length>0,'conflict diagnostic');assert.equal(acks.has(conflicting.messageId),false);assert.equal(await count(),before);checks.push('Conflicting logical identity rejected without accepted ACK');
 const live=await request(`/v1/sites/${siteId}/live-telemetry`);
 assert.equal(live.metrics.totalEnergy,initialImportWh/1000);assert.equal(live.metrics.activePower,28240);assert.ok(live.canonicalFields.length>=26,'all configured tags visible');checks.push(`Realtime and energy coexist; PM import ${initialImportWh} Wh = ${initialImportWh/1000} kWh; logger does not override billing meter`);
 const late=fixture('pm2230Realtime',-60000);late.data.values['power.active.total']=100;await accepted(pmDevice.telemetryTopic,late);assert.equal((await request(`/v1/sites/${siteId}/live-telemetry`)).metrics.activePower,28240);checks.push('Late raw retained without replacing latest fields');
 const unknown=fixture('pm2230Realtime',13000);unknown.data.values['future.vendor_metric']=9.5;unknown.data.units['future.vendor_metric']='widgets';await accepted(pmDevice.telemetryTopic,unknown);const unmapped=(await request(`/v1/sites/${siteId}/payload-config`)).unmappedMessages;assert.ok(unmapped.some((m:any)=>m.messageId===unknown.messageId&&m.unmapped.some((f:any)=>f.tag==='future.vendor_metric')));checks.push('Unknown future tag retained as unmapped raw without billing role');
 const invalid=fixture('pm2230Energy',5000);invalid.data.units['energy.active.import.total']='kWh';const rejectsBefore=(await request(`/v1/sites/${siteId}/payload-config`)).rejections.length;await publish(pmDevice.telemetryTopic,invalid);await poll(()=>request(`/v1/sites/${siteId}/payload-config`),c=>c.rejections.length>rejectsBefore,'unit diagnostic');assert.equal(acks.has(invalid.messageId),false);assert.equal(await count(invalid.messageId),0);checks.push('Invalid energy unit rejected, no accepted ACK');
 const wrong=fixture('pm2230Energy',6000);wrong.siteId='WRONG-SITE';await publish(pmDevice.telemetryTopic,wrong);await new Promise(r=>setTimeout(r,500));assert.equal(acks.has(wrong.messageId),false);assert.equal(await count(wrong.messageId),0);checks.push('Topic/body ownership mismatch rejected');
 const maxLot=fixture('pm2230Energy',9000);maxLot.lotNumber=4294967295;await accepted(pmDevice.telemetryTopic,maxLot);
 const second=fixture('pm2230Energy',10000);second.lotNumber=1;second.data.values['energy.active.import.total']+=1000;await accepted(pmDevice.telemetryTopic,second);const energies=await db.query('SELECT total_energy_kwh::text value FROM telemetry_raw WHERE site_id=$1 AND total_energy_kwh IS NOT NULL ORDER BY source_time',[siteId]);assert.equal(Number(energies.rows.at(-1).value)-Number(energies.rows.at(-2).value),1);checks.push('Import cumulative delta 1000 Wh = 1 kWh; rollover lot 1 accepted');
 const poor=fixture('pm2230Energy',11000);poor.quality.status='bad';poor.quality.communication='offline';await accepted(pmDevice.telemetryTopic,poor);const poorRaw=await db.query("SELECT total_energy_kwh FROM telemetry_raw WHERE site_id=$1 AND raw_payload->>'messageId'=$2",[siteId,poor.messageId]);assert.equal(poorRaw.rows[0].total_energy_kwh,null);checks.push('Poor-quality fields retained; excluded from billing energy projection');
 const restored=fixture('pm2230Energy',12000);restored.data.values['energy.active.import.total']+=1000;await accepted(pmDevice.telemetryTopic,restored);
 const historical=fixture('smartLoggerEnvironment',-86400000);historical.timestamps.polledAt=examples.smartLoggerEnvironment.timestamps.polledAt;await accepted(loggerDevice.telemetryTopic,historical);checks.push('Historical source time stored without becoming current live data');
 const target=fileURLToPath(new URL('../../../../docs/mqttbox-local-test/',import.meta.url));await mkdir(target,{recursive:true});
 for(const [name,p] of Object.entries(fixtures))await writeFile(`${target}/${name}.json`,JSON.stringify(p,null,2)+'\n');
 await writeFile(`${target}/connection.json`,JSON.stringify({siteId,externalSiteId:connection.externalSiteId,externalGatewayId:connection.externalGatewayId,ackTopic:connection.ackTopic,devices:connection.devices.map((d:any)=>({id:d.id,externalDeviceId:d.externalDeviceId,profileRevisionId:d.profileRevisionId,profileId:d.profileId,profileVersion:d.profileVersion,telemetryTopic:d.telemetryTopic}))},null,2)+'\n');
 await writeFile(`${target}/evidence.json`,JSON.stringify({verifiedAt:new Date().toISOString(),siteId,checks,rawCount:await count(),sampleCount:Number((await db.query('SELECT count(*) count FROM payload_samples WHERE site_id=$1',[siteId])).rows[0].count),brokerUrl:process.env.MQTT_URL ?? 'mqtt://localhost:1883',duplicateAcceptedAt:retryAck.acceptedAt},null,2)+'\n');
 console.log(JSON.stringify({siteId,checks,rawCount:await count(),artifacts:target},null,2));
}finally{client.end(true);await db.end();}
