import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exactRate,configuredTotals,manualTotals,assertRateEditable} from './site-billing-policy.js';
test('rates compare at exact database precision',()=>{assert.equal(exactRate('3.5'),'3.5000');assert.throws(()=>exactRate('3.50001'));});
test('configured inclusive and exclusive tax use satang rounding',()=>{
 assert.deepEqual(configuredTotals('100.00','7',false),{subtotal:'100.00',tax:'7.00',total:'107.00'});
 assert.deepEqual(configuredTotals('107.00','7',true),{subtotal:'100.00',tax:'7.00',total:'107.00'});
 assert.throws(()=>configuredTotals('100',undefined,false));
});
test('manual lines calculate their own totals without energy tariff',()=>{assert.equal(manualTotals([{description:'Service',quantity:'2.5',unitPrice:'10.01'}],'0',false).total,'25.03');});
test('partial approved and pending evidence both block rate edits',()=>{for(const status of ['paid','pending_verification'])assert.throws(()=>assertRateEditable('approved',[{status}]));assert.throws(()=>assertRateEditable('paid',[]));assert.doesNotThrow(()=>assertRateEditable('approved',[{status:'rejected'}]));});
