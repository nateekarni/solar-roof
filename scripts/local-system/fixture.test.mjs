import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReplacement,id,cutoffInstant} from './fixture.mjs';
test('replacement refuses absent backup, unknown users and remote target',()=>{
 const input={databaseUrl:'postgresql://review:x@127.0.0.1:15449/solar_financial_flow_review',backupBytes:20000,oldUsers:[{email:'admin@example.test'}]};
 assert.doesNotThrow(()=>validateReplacement(input));
 for(const patch of [{backupBytes:0},{databaseUrl:'postgresql://review:x@remote:15449/solar_financial_flow_review'},{oldUsers:[{email:'real@company.com'}]}])assert.throws(()=>validateReplacement({...input,...patch}));
});
test('replacement identity generator creates stable canonical v4 UUIDs',()=>{
 const result=id('staff:legacy');assert.match(result,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/);
 assert.equal(result,id('staff:legacy'));assert.notEqual(result,id('staff:other'));
});
test('cutoff is the first instant after the selected Bangkok month',()=>{
 assert.equal(cutoffInstant('2026-09'),'2026-09-30T17:00:00.000Z');
 assert.equal(cutoffInstant('2026-12'),'2026-12-31T17:00:00.000Z');
 assert.throws(()=>cutoffInstant('2026-13'));assert.throws(()=>cutoffInstant('invalid'));
});
