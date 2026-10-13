import assert from 'node:assert/strict';
import test from 'node:test';
import {ManualBillOperation} from './manual-bill-operation';

test('manual issuance retries retain one explicit operation key and unchanged payload across a day boundary',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-14T23:59:00+07:00')});
 const sent:any[]=[];const operation=new ManualBillOperation();
 const input={siteId:'site',lines:[{description:'Work',quantity:'1',unitPrice:'100'}],note:'',dueDate:'2026-10-31'};
 await assert.rejects(operation.issue(input,async payload=>{sent.push(structuredClone(payload));throw Error('Response lost after invoice committed');}));
 const first=sent[0];assert.match(first.idempotencyKey,/^[a-f0-9-]{36}$/);
 t.mock.timers.tick(120000); // Retry the same operation after Bangkok midnight.
 await operation.issue(input,async payload=>{sent.push(structuredClone(payload));return {document:'original'};});
 assert.deepEqual(sent[1],first);
 await operation.issue(input,async payload=>{sent.push(structuredClone(payload));return {document:'second'};});
 assert.notEqual(sent[2].idempotencyKey,first.idempotencyKey,'A deliberate new identical invoice gets a distinct operation key');
});
