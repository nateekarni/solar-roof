import assert from 'node:assert/strict';
import test from 'node:test';
import { lifecycleState } from './gateway-lifecycle.js';
test('publish success does not claim hardware acknowledgement or application',()=>{
 assert.deepEqual(lifecycleState({desired:4,published:4,acknowledged:3,applied:2}),{desiredVersion:4,publishedVersion:4,acknowledgedVersion:3,appliedVersion:2,state:'awaiting-acknowledgement'});
});
test('acknowledged hardware is still awaiting application until the same revision is applied',()=>{
 assert.equal(lifecycleState({desired:4,published:4,acknowledged:4,applied:3}).state,'awaiting-application');
 assert.equal(lifecycleState({desired:4,published:4,acknowledged:4,applied:4}).state,'applied');
});
