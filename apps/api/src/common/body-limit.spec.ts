import test from 'node:test';import assert from 'node:assert/strict';
import {requestJsonLimit} from './body-limit.js';
test('evidence accepts10MiB encoded files while other endpoints retain bounded JSON',()=>{
 assert.ok(requestJsonLimit('/v1/billing-cycles/bill/pay')>Math.ceil(10*1024*1024/3)*4+4096);
 assert.equal(requestJsonLimit('/v1/billing-cycles/bill/verify-payment'),100*1024);
 assert.equal(requestJsonLimit('/v1/settings/company'),3*1024*1024);
});
