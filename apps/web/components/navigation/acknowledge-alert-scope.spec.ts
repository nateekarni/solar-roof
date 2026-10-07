import test from 'node:test';
import assert from 'node:assert/strict';
import {acknowledgeAlertScope} from './acknowledge-alert-scope';
test('delayed global acknowledgement cannot overwrite selected-site alerts or trigger a global refresh',async()=>{
 let finishPut!:()=>void;
 let current={scope:'global',generation:1};
 let bell={scope:'global',active:2,loading:false};let refreshes=0;
 const api={put:async(endpoint:string)=>{assert.equal(endpoint,'/v1/alerts/acknowledge-all');await new Promise<void>(resolve=>{finishPut=resolve;});}};
 const completion=acknowledgeAlertScope(api,{...current},()=>current,()=>{bell={scope:'global',active:0,loading:true};refreshes++;});
 current={scope:'site_id=A',generation:2};bell={scope:'site_id=A',active:3,loading:false};
 finishPut();await completion;
 assert.deepEqual(bell,{scope:'site_id=A',active:3,loading:false});assert.equal(refreshes,0);
});
test('same-scope request generation changes also ignore stale acknowledgement completion',async()=>{
 let finishPut!:()=>void;let current={scope:'global',generation:1};let applications=0;
 const completion=acknowledgeAlertScope({put:()=>new Promise<void>(resolve=>{finishPut=resolve;})},{...current},()=>current,()=>{applications++;});
 current={scope:'global',generation:2};finishPut();await completion;assert.equal(applications,0);
});
test('current global acknowledgement updates state and refreshes alerts once',async()=>{
 const current={scope:'global',generation:1};let applications=0;
 await acknowledgeAlertScope({put:async()=>{}},current,()=>current,()=>{applications++;});assert.equal(applications,1);
});
