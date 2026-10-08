import test from 'node:test';
import assert from 'node:assert/strict';
import {transferAmount,pendingTransferTotal,formatTransferAmount} from './payment-input';
test('entered transfer amount remains an exact decimal instead of the bill amount',()=>{
 assert.equal(transferAmount('2000'),'2000.00');assert.equal(transferAmount('2623.45'),'2623.45');assert.equal(transferAmount('90071992547409.91'),'90071992547409.91');
 for(const value of ['', '0','-1','0.001','1e3','10000000000000000'])assert.throws(()=>transferAmount(value));
});
test('pending transfer sum excludes rejected history and preserves exact satang',()=>{
 assert.equal(pendingTransferTotal([{amount:'2000.00000000',status:'pending_verification'},{amount:'2623.45000000',status:'pending_verification'},{amount:'4623.45',status:'rejected'}]),'4623.45');assert.equal(formatTransferAmount('90071992547409.91000000'),'90,071,992,547,409.91');
});