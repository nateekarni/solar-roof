import assert from 'node:assert/strict';
import test from 'node:test';
import {settlementBalance} from './payment-settlement.js';

test('calculates partial and full settlement with exact decimal money',()=>{
 assert.deepEqual(settlementBalance('44565.50',['10000.00'],'5000.00'),{
  paidBefore:'10000.00',paidAfter:'15000.00',outstanding:'29565.50',settled:false,
 });
 assert.deepEqual(settlementBalance('44565.50000000',['10000.00000000'],'34565.50'),{
  paidBefore:'10000.00',paidAfter:'44565.50',outstanding:'0.00',settled:true,
 });
});

test('rejects overpayment and sub-satang stored values',()=>{
 assert.throws(()=>settlementBalance('100.00',[],'100.01'),/exceed/);
 assert.throws(()=>settlementBalance('100.001',[],'10.00'),/decimal/);
});
