import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { MqttIngestionService } from './mqtt-ingestion.service.js';
import { PayloadIngestion } from './payload-ingestion.js';
const runtime=createRequire(import.meta.url)('mqtt/mqtt');
const flush=()=>new Promise<void>(r=>setImmediate(r));

test('unassigned remote broker gets all four required subscriptions and control stays on its source scope',async context=>{
 const previous=process.env.MQTT_DEFAULT_BROKER_ENABLED;process.env.MQTT_DEFAULT_BROKER_ENABLED='false';
 const subscriptions:string[]=[],received:any[]=[],queries:string[]=[];
 const client=Object.assign(new EventEmitter(),{connected:false,end(){},reconnect(){},subscribe(topic:string,options:any,done:Function){assert.equal(options.qos,1);subscriptions.push(topic);done(null,[{topic,qos:1}]);},unsubscribe(){}});
 context.mock.method(runtime,'connect',()=>client);
 const db={query:async(sql:string)=>{queries.push(sql);return {rows:sql.includes('FROM mqtt_brokers')?[{id:'unassigned',url:'mqtt://empty',username:'',password_cipher:'',topics:[]}]:[]};}};
 const service=new MqttIngestionService(db as any,db as any);
 context.mock.method(service,'handleIncomingMessage',async(topic:string,_payload:unknown,_client:unknown,brokerId:string|null)=>{received.push({topic,brokerId});});
 try{await service.onModuleInit();await flush();client.connected=true;client.emit('connect');await flush();
  assert.deepEqual(subscriptions.sort(),['solar/v1/gateways/+/configStatus','solar/v1/gateways/+/configUpdate','solar/v1/gateways/+/status','solar/v1/sites/+/gateways/+/devices/+/telemetry']);
  assert.ok(queries.some(sql=>sql.includes('FROM mqtt_brokers')&&sql.includes('LEFT JOIN')),'unassigned brokers must survive gateway discovery');
  client.emit('message','solar/v1/gateways/NEW/status',Buffer.from('{}'));await flush();
  assert.deepEqual(received,[{topic:'solar/v1/gateways/NEW/status',brokerId:'unassigned'}]);
 }finally{await service.onModuleDestroy();if(previous===undefined)delete process.env.MQTT_DEFAULT_BROKER_ENABLED;else process.env.MQTT_DEFAULT_BROKER_ENABLED=previous;}
});
test('broker sessions subscribe separately and ACK on the receiving client',async context=>{
 const clients:any[]=[],subscriptions:string[][]=[],published:string[][]=[];
 context.mock.method(runtime,'connect',(_url:string,options:any)=>{assert.equal(options.password,undefined,'anonymous broker connections must omit the password flag');const index=clients.length;subscriptions[index]=[];published[index]=[];const c=Object.assign(new EventEmitter(),{connected:true,end(){},unsubscribe(){},subscribe(topic:string,_options:unknown,done:Function){subscriptions[index]!.push(topic);done(null,[{topic,qos:1}]);},publish(topic:string,_body:string,_options:unknown,done?:Function){published[index]!.push(topic);done?.();}});clients.push(c);return c;});
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
  remote2.emit('message','solar/v1/sites/S/gateways/G/devices/D/telemetry',Buffer.from('{}'));await flush();assert.deepEqual(received,['b1','b2']);
  remote1.connected=false;remote1.emit('close');assert.equal((service as any).remote.get('b1').ready,false);
  assert.ok(subscriptions[1]!.includes('solar/v1/sites/+/gateways/+/devices/+/telemetry'));assert.ok(subscriptions[2]!.includes('solar/v1/sites/+/gateways/+/devices/+/telemetry'));
 }finally{await service.onModuleDestroy();}
});
test('registered payload binding query verifies broker ownership',async()=>{
 let parameters:unknown[]=[];
 const db={query:async(sql:string,values:unknown[])=>{if(sql.includes('FROM devices d'))parameters=values;return {rows:[]};}};
 await new PayloadIngestion(db as any).accept('solar/v1/sites/S/gateways/G/devices/D/telemetry',{},'broker-a');
 assert.deepEqual(parameters,['S','G','D',false,'broker-a',null,null]);
});

test('late rejected remote SUBACK cannot invalidate a recovered broker session',async context=>{
 const previous=process.env.MQTT_DEFAULT_BROKER_ENABLED;process.env.MQTT_DEFAULT_BROKER_ENABLED='false';
 let hold=true,late:Function|undefined,reconnects=0;
 const client=Object.assign(new EventEmitter(),{connected:false,end(){},reconnect(){reconnects++;},unsubscribe(){},subscribe(topic:string,_options:unknown,done:Function){if(hold)late=()=>done(null,[{topic,qos:128}]);else done(null,[{topic,qos:1}]);}});
 context.mock.method(runtime,'connect',()=>client);
 const db={query:async(sql:string)=>({rows:sql.includes('FROM mqtt_brokers')?[{id:'remote',url:'mqtt://remote',username:'',password_cipher:'',topics:[]}]:[]})};
 const service=new MqttIngestionService(db as any,db as any);
 try{await service.onModuleInit();await flush();client.connected=true;client.emit('connect');await flush();assert.equal(service.getConnectionHealth().readyBrokers,0);
  client.emit('disconnect');hold=false;client.emit('connect');await flush();assert.equal(service.getConnectionHealth().readyBrokers,1);
  late?.();await flush();assert.equal(service.getConnectionHealth().readyBrokers,1);assert.equal(reconnects,0);
 }finally{await service.onModuleDestroy();if(previous===undefined)delete process.env.MQTT_DEFAULT_BROKER_ENABLED;else process.env.MQTT_DEFAULT_BROKER_ENABLED=previous;}
});

test('late refresh SUBACK failure cannot revoke a newer remote connection readiness',async context=>{
 const previous=process.env.MQTT_DEFAULT_BROKER_ENABLED;process.env.MQTT_DEFAULT_BROKER_ENABLED='false';
 let hold=false,late:Function|undefined;
 const client=Object.assign(new EventEmitter(),{connected:false,end(){},reconnect(){},unsubscribe(){},subscribe(topic:string,_options:unknown,done:Function){if(hold)late=()=>done(Error('old connection'));else done(null,[{topic,qos:1}]);}});
 context.mock.method(runtime,'connect',()=>client);
 const db={query:async(sql:string)=>({rows:sql.includes('FROM mqtt_brokers')?[{id:'remote',url:'mqtt://remote',username:'',password_cipher:'',topics:[]}]:[]})};
 const service=new MqttIngestionService(db as any,db as any);
 try{await service.onModuleInit();await flush();client.connected=true;client.emit('connect');await flush();
  client.emit('error',Error('lost session'));hold=true;const refresh=service.refreshSubscriptions();await flush();
  hold=false;client.emit('connect');await flush();assert.equal(service.getConnectionHealth().readyBrokers,1);
  late?.();await refresh;assert.equal(service.getConnectionHealth().readyBrokers,1);
 }finally{await service.onModuleDestroy();if(previous===undefined)delete process.env.MQTT_DEFAULT_BROKER_ENABLED;else process.env.MQTT_DEFAULT_BROKER_ENABLED=previous;}
});
