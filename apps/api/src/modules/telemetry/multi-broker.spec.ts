import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { MqttIngestionService } from './mqtt-ingestion.service.js';
import { PayloadIngestion } from './payload-ingestion.js';
const runtime=createRequire(import.meta.url)('mqtt/mqtt');
const flush=()=>new Promise<void>(r=>setImmediate(r));
test('broker sessions subscribe separately and ACK on the receiving client',async context=>{
 const clients:any[]=[],subscriptions:string[][]=[],published:string[][]=[];
 context.mock.method(runtime,'connect',(_url:string,options:any)=>{assert.equal(options.password,undefined,'anonymous broker connections must omit the password flag');const index=clients.length;subscriptions[index]=[];published[index]=[];const c=Object.assign(new EventEmitter(),{connected:true,end(){},unsubscribe(){},subscribe(topic:string,_options:unknown,done:Function){subscriptions[index]!.push(topic);done(null,[{qos:1}]);},publish(topic:string,_body:string,_options:unknown,done?:Function){published[index]!.push(topic);done?.();}});clients.push(c);return c;});
 const brokers=[{id:'b1',url:'mqtt://one:1883',username:'',password_cipher:'',topics:['solar/v1/sites/S/gateways/G/devices/+/telemetry']},{id:'b2',url:'mqtt://two:1883',username:'',password_cipher:'',topics:['solar/v1/sites/T/gateways/H/devices/+/telemetry']}];
 const db={query:async(sql:string)=>({rows:sql.includes('FROM mqtt_brokers')?brokers:[]})};
 const received:string[]=[];
 context.mock.method(PayloadIngestion.prototype,'accept',async(_topic:string,_input:unknown,broker?:string|null)=>{received.push(broker!);return {siteId:broker==='b1'?'S':'T',gatewayId:broker==='b1'?'G':'H'} as any;});
 const service=new MqttIngestionService(db as any,db as any);
 try{
  await service.onModuleInit();await flush();
  clients.forEach(c=>c.emit('connect'));await flush();await flush();
  const remote1=clients[1],remote2=clients[2];
  remote1.emit('message','solar/v1/sites/S/gateways/G/devices/D/telemetry',Buffer.from('{}'));await flush();
  assert.deepEqual(received,['b1']);assert.deepEqual(published[1],['solar/v1/sites/S/gateways/G/dataAcept']);assert.deepEqual(published[0],[]);assert.deepEqual(published[2],[]);
  remote2.emit('message','solar/v1/sites/S/gateways/G/devices/D/telemetry',Buffer.from('{}'));await flush();assert.deepEqual(received,['b1']);
  remote1.connected=false;remote1.emit('close');assert.equal((service as any).remote.get('b1').ready,false);
  assert.ok(subscriptions[1]!.includes(brokers[0]!.topics[0]!));assert.ok(subscriptions[2]!.includes(brokers[1]!.topics[0]!));
 }finally{await service.onModuleDestroy();}
});
test('registered payload binding query verifies broker ownership',async()=>{
 let parameters:unknown[]=[];
 const db={query:async(sql:string,values:unknown[])=>{if(sql.includes('FROM devices d'))parameters=values;return {rows:[]};}};
 await new PayloadIngestion(db as any).accept('solar/v1/sites/S/gateways/G/devices/D/telemetry',{},'broker-a');
 assert.deepEqual(parameters,['S','G','D',false,'broker-a']);
});
