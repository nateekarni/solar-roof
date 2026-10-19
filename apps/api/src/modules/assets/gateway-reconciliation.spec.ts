import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetsController } from './assets.controller.js';
import { AssetsService } from './assets.service.js';
import { compareWindow, validateCadence } from './gateway-reconciliation.js';

test('gateway index returns saved gateways without a fabricated row for every site',async()=>{
 const controller=new AssetsController({query:async()=>({rows:[{id:'saved',siteId:'site',name:'Hardware'}]})} as any,{} as any);
 assert.deepEqual(await controller.listGateways(),[{id:'saved',siteId:'site',name:'Hardware'}]);
});
test('gateway index queries expose persisted onboarding lifecycle and configuration state',async()=>{
 const queries:string[]=[];const db={query:async(sql:string)=>{queries.push(sql);return {rows:[]};}} as any;
 await new AssetsController(db,{} as any).listGateways();
 await new AssetsService(db).listGateways(null);
 assert.equal(queries.length,2);
 for(const sql of queries){assert.match(sql,/lifecycle_state AS "lifecycleState"/);assert.match(sql,/config_state AS "configState"/);}
});
test('cadence rejects invalid group values and keeps independent expected intervals',()=>{
 assert.deepEqual(validateCadence({expectedIntervalSeconds:30,pollGroups:{energy:900,realtime:10}}),{expectedIntervalSeconds:30,pollGroups:{energy:900,realtime:10}});
 assert.throws(()=>validateCadence({expectedIntervalSeconds:0,pollGroups:{}}));
 assert.throws(()=>validateCadence({expectedIntervalSeconds:30,pollGroups:{energy:Infinity}}));
});
test('energy compares increments with absolute floor instead of lifetime counters',()=>{
 const result=compareWindow({kind:'energy',left:[{time:0,value:1000},{time:900000,value:1001}],right:[{time:0,value:2000},{time:900000,value:2001.06}],leftCadenceSeconds:450,rightCadenceSeconds:450});
 assert.equal(result.state,'ok');assert.equal(result.left,1);assert.ok(Math.abs(result.right!-1.06)<1e-8);
});
test('slow cadence expands window and missing or reset counters never become mismatch',()=>{
 const base={kind:'energy' as const,left:[{time:0,value:10},{time:900000,value:11}],right:[{time:0,value:10},{time:900000,value:15}],leftCadenceSeconds:60,rightCadenceSeconds:600};
 assert.equal(compareWindow(base).state,'insufficient');
 assert.equal(compareWindow({...base,rightCadenceSeconds:60,left:[{time:0,value:10},{time:900000,value:1}]}).state,'invalid');
});
test('power never compares latest values from different source times',()=>{
 assert.equal(compareWindow({kind:'power',left:[{time:0,value:10}],right:[{time:900000,value:20}],leftCadenceSeconds:10,rightCadenceSeconds:10}).state,'insufficient');
});
test('off-boundary source clocks compare actual aligned counters with expected cadence coverage',()=>{
 const left=Array.from({length:90},(_,i)=>({time:5000+i*10000,value:1000+i}));
 const right=Array.from({length:90},(_,i)=>({time:6000+i*10000,value:2000+i}));
 const result=compareWindow({kind:'energy',left,right,leftCadenceSeconds:10,rightCadenceSeconds:10,windowStart:0,windowEnd:900000});
 assert.equal(result.state,'ok');assert.equal(result.left,89);assert.equal(result.right,89);
});
