import assert from 'node:assert/strict';
import test from 'node:test';
import {markFeedRead,accessibleFeedRows} from './notification-feed-state';

test('reading uses personal notifications endpoint and ignores stale user/site completion',async()=>{
 let finish!:()=>void;let scope='owner:all';let updates=0;
 const task=markFeedRead({put:async(path:string,body:unknown)=>{assert.equal(path,'/v1/me/notification-feed/read-all');assert.deepEqual(body,{});await new Promise<void>(resolve=>{finish=resolve;});}},scope,()=>scope,()=>{updates++;});
 scope='customer:school-b';finish();await task;assert.equal(updates,0);
});
test('single notification reads never acknowledge an infrastructure alarm',async()=>{
 let updates=0;await markFeedRead({put:async(path:string,body:unknown)=>{assert.equal(path,'/v1/me/notification-feed/read');assert.deepEqual(body,{ids:['alert:a']});}},'admin:site-a',()=> 'admin:site-a',()=>{updates++;},{ids:['alert:a']});assert.equal(updates,1);
});
test('customer rows cannot link to technical routes, even if a malformed response contains them',()=>{
 const rows=[{destination:'/alerts'},{destination:'/records/documents/a'},{destination:null},{destination:'https://example.test'}];
 assert.deepEqual(accessibleFeedRows(rows,'school_user'),rows.slice(1,3));
});
