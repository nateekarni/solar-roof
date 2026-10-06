import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetsController } from './assets.controller.js';

test('default broker metadata shows the runtime server without URL credentials',async()=>{
 const previous=process.env.MQTT_URL;
 try{
  process.env.MQTT_URL='mqtt://user:secret@localhost:1883';
  const controller=new AssetsController({query:async()=>({rows:[]})} as any,{} as any);
  const [broker]=await controller.listBrokers();
  assert.ok(broker);
  assert.equal(broker.id,'default');assert.equal(broker.url,'mqtt://localhost:1883');
 }finally{if(previous===undefined)delete process.env.MQTT_URL;else process.env.MQTT_URL=previous;}
});

test('editing broker connection keeps credentials when password is omitted',async()=>{
 let parameters:unknown[]=[];
 const db={query:async(_sql:string,values:unknown[])=>{parameters=values;return {rows:[{id:'broker',name:'Updated',url:'mqtt://localhost:1883',username:''}]};}};
 const controller=new AssetsController(db as any,{} as any);
 const result=await controller.updateBroker('broker',{name:'Updated',host:'localhost',port:1883,protocol:'mqtt'});
 assert.equal(result.name,'Updated');assert.equal(parameters[4],false);assert.equal(parameters[2],'mqtt://localhost:1883');
});

test('deleting a broker referenced by a Gateway gives an actionable error',async()=>{
 const db={query:async()=>{throw Object.assign(new Error('foreign key'),{code:'23503'});}};
 const controller=new AssetsController(db as any,{} as any);
 await assert.rejects(controller.deleteBroker('broker'),/Gateway/);
});
