/** Real PostgreSQL fault injection plus concurrent TCP/WebSocket replay verification. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import mqtt from 'mqtt';
import { Pool } from 'pg';
import type { DatabaseService } from '../database/database.service.js';
import { PayloadIngestion } from '../modules/telemetry/payload-ingestion.js';

config({path:fileURLToPath(new URL('../../../../.env',import.meta.url))});
const folder=new URL('../../../../docs/mqttbox-local-test/',import.meta.url);
const connection=JSON.parse(await readFile(new URL('connection.json',folder),'utf8'));
const payload=JSON.parse(await readFile(new URL('pm2230Energy.json',folder),'utf8'));
const device=connection.devices.find((d:any)=>d.profileId==='schneider-pm2230');
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const clients:mqtt.MqttClient[]=[];
const run=randomUUID();
async function connected(url:string){
 const client=mqtt.connect(url,{reconnectPeriod:0,connectTimeout:5000,...(process.env.MQTT_USERNAME?{username:process.env.MQTT_USERNAME}:{}),...(process.env.MQTT_PASSWORD?{password:process.env.MQTT_PASSWORD}:{})});
 clients.push(client);
 await new Promise<void>((resolve,reject)=>{client.once('connect',()=>resolve());client.once('error',reject);});
 return client;
}
async function counts(messageId:string){
 const result=await pool.query(`SELECT
  (SELECT count(*)::int FROM payload_messages WHERE device_id=$1 AND message_id=$2) messages,
  (SELECT count(*)::int FROM payload_samples s JOIN payload_messages m ON m.id=s.message_id WHERE m.device_id=$1 AND m.message_id=$2) samples,
  (SELECT count(*)::int FROM telemetry_raw WHERE device_id=$1 AND raw_payload->>'messageId'=$2) raw`,[device.id,messageId]);
 return result.rows[0];
}
try{
 const current=(await pool.query('SELECT total_energy_kwh FROM telemetry_raw WHERE device_id=$1 AND total_energy_kwh IS NOT NULL ORDER BY source_time DESC LIMIT 1',[device.id])).rows[0];
 payload.messageId=`durability-${run}`;
 payload.timestamps.polledAt=new Date(Date.now()-1000).toISOString();
 payload.timestamps.sentAt=new Date().toISOString();
 payload.data.values['energy.active.import.total']=Math.round(Number(current.total_energy_kwh)*1000)+1000;

 const failingDatabase={
  query:(text:string,values:unknown[])=>pool.query(text,values),
  pool:{connect:async()=>{const owned=await pool.connect();return {
   query:(text:string,values?:unknown[])=>{
    if(text.includes('INSERT INTO telemetry_raw'))throw new Error('Injected raw persistence failure');
    return owned.query(text,values);
   },release:()=>owned.release(),
  };}},
 } as unknown as DatabaseService;
 await assert.rejects(new PayloadIngestion(failingDatabase).accept(device.telemetryTopic,payload),/Injected raw persistence failure/);
 assert.deepEqual(await counts(payload.messageId),{messages:0,samples:0,raw:0},'actual PostgreSQL rollback removes message and samples');

 const observer=await connected('mqtt://localhost:1883');
 const websocket=await connected('ws://localhost:8083/mqtt');
 let ackCount=0;
 observer.on('message',(_topic,wire)=>{const ack=JSON.parse(wire.toString());if(ack.messageType==='dataAcept'&&ack.messageId===payload.messageId){assert.equal(ack.status,'accepted');ackCount++;}});
 await new Promise<void>((resolve,reject)=>observer.subscribe(connection.ackTopic,{qos:1},error=>error?reject(error):resolve()));
 await Promise.all(Array.from({length:16},(_,index)=>new Promise<void>((resolve,reject)=>{
  const sender=index%2?websocket:observer;
  sender.publish(device.telemetryTopic,JSON.stringify({...payload,timestamps:{...payload.timestamps,sentAt:new Date().toISOString()}}),{qos:1},error=>error?reject(error):resolve());
 })));
 const deadline=Date.now()+10000;
 while(ackCount<16&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,100));
 assert.equal(ackCount,16,'all concurrent publishers receive correlated accepted ACKs');
 const stored=await counts(payload.messageId);
 assert.deepEqual(stored,{messages:1,samples:4,raw:1},'one durable insert across simultaneous retries');

 const owned=await pool.connect();
 try{
  await owned.query('BEGIN');
  await assert.rejects(owned.query('UPDATE payload_profile_revisions SET version=version WHERE id=$1',[device.profileRevisionId??'00000000-0000-4000-8000-000000000001']),/immutable/i);
 }finally{await owned.query('ROLLBACK');owned.release();}

 const evidence={verifiedAt:new Date().toISOString(),siteId:connection.siteId,deviceId:device.id,messageId:payload.messageId,ackCount,stored,checks:['Real PostgreSQL rollback: no message/sample/raw survives injected failure','16 simultaneous TCP/WebSocket publishes: one durable message and four canonical samples','Both 1883 MQTT TCP and 8083/mqtt MQTT WebSocket deliver dataAcept','Database rejects changes to immutable profile revisions']};
 await writeFile(new URL('durability-evidence.json',folder),JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify(evidence,null,2));
}finally{for(const client of clients)client.end(true);await pool.end();}
