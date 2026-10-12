import test from 'node:test';import assert from 'node:assert/strict';import {frozenFinancialTax} from './frozen-financial-tax.js';
test('receipt retains issued invoice tax policy after configuration changes',()=>{
 assert.deepEqual(frozenFinancialTax({taxPercent:'7',taxMode:'inclusive'},'10',false),{taxPercent:'7',taxMode:'inclusive'});
 assert.deepEqual(frozenFinancialTax(undefined,'7',false),{taxPercent:'7',taxMode:'exclusive'});
});
