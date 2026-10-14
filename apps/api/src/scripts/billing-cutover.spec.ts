import assert from 'node:assert/strict';
import test from 'node:test';
import {parseCutoverArguments} from './billing-cutover-runner.js';
const args=['--site=00000000-0000-4000-8000-000000000001','--period-start=2026-09-01','--period-end=2026-09-30','--operation-key=review-operation-1','--owner=00000000-0000-4000-8000-000000000002'];
test('cutover defaults to dry run and only explicit apply activates writes',()=>{
 assert.equal(parseCutoverArguments(args).apply,false);
 assert.equal(parseCutoverArguments([...args,'--apply']).apply,true);
});
test('cutover refuses incomplete, duplicated, unknown and invalid inputs before database access',()=>{
 for(const invalid of [args.slice(1),[...args,'--unsafe'],[...args,args[0]!],args.map(v=>v==='--period-start=2026-09-01'?'--period-start=2026-02-30':v),args.map(v=>v==='--operation-key=review-operation-1'?'--operation-key=':v)])assert.throws(()=>parseCutoverArguments(invalid));
});
