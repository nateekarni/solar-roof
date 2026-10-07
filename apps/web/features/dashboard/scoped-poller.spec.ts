import test from 'node:test';
import assert from 'node:assert/strict';
import {createScopedPoller} from './scoped-poller';
test('late data from a disposed site cannot overwrite the new scope',async()=>{
 let resolveA!:(value:string)=>void;const seen:string[]=[];
 const a=createScopedPoller(()=>new Promise<string>(resolve=>{resolveA=resolve;}),value=>seen.push(value),()=>seen.push('error'));
 const old=a.load();a.dispose();
 const b=createScopedPoller(async()=>'B',value=>seen.push(value),()=>seen.push('error'));
 await b.load();resolveA('A');await old;
 assert.deepEqual(seen,['B']);
});
test('polling avoids overlapping requests and ignores late errors after scope change',async()=>{
 let reject!:(reason:Error)=>void;let requests=0,errors=0;
 const poller=createScopedPoller(()=>{requests++;return new Promise<string>((_,fail)=>{reject=fail;});},()=>{},()=>{errors++;});
 const first=poller.load();await poller.load();assert.equal(requests,1);poller.dispose();reject(new Error('late'));await first;await poller.load();assert.equal(errors,0);assert.equal(requests,1);
});
