import test from 'node:test';
import assert from 'node:assert/strict';
import {billingDetailRequest} from './billing-detail-request';
test('billing detail requests the scoped records route and unwraps persisted transfer history',async()=>{
 const row={id:'cycle-a',payments:[{id:'transfer-a',amount:'2000.00000000'}]};let path='';
 const result=await billingDetailRequest('cycle-a',async(value)=>{path=value;return {row};});
 assert.equal(path,'/v1/operations/billing/records/cycle-a');assert.equal(result,row);
});