import assert from 'node:assert/strict';
import test from 'node:test';
import {recordDetailFields,recordDetailLabel,recordPaymentStatus} from './record-detail-fields';
test('removed evidence column cannot relabel billing status',()=>{
 assert.equal(recordDetailLabel('billing','status','en','Payment evidence'),'Status');
 assert.equal(recordDetailLabel('billing','openingEnergy','en',''),'Opening energy');
});
test('receipt details have only one total field',()=>{
 const fields=recordDetailFields('receipts',['receiptNumber','totalAmount','status']);
 assert.ok(fields.includes('totalAmount'));assert.ok(!fields.includes('amount'));
});
test('payment status derives from supported cycle state when no separate payment status exists',()=>{
 assert.equal(recordPaymentStatus({status:'paid'}),'paid');
 assert.equal(recordPaymentStatus({status:'pending_verification'}),'pending_verification');
 assert.equal(recordPaymentStatus({status:'approved'}),'unpaid');
 assert.equal(recordPaymentStatus({status:'draft'}),undefined);
});
