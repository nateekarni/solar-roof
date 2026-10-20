/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizePaymentMetadata} from './payments.js';

test('normalizes bank transfer and its transfer channel independently',()=>{
 assert.deepEqual(normalizePaymentMetadata({paymentMethod:'bank_transfer',transferChannel:'promptpay'}),{
  paymentMethod:'bank_transfer',transferChannel:'promptpay',
 });
 assert.deepEqual(normalizePaymentMetadata({paymentMethod:'bank_transfer',transferChannel:'bank_account'}),{
  paymentMethod:'bank_transfer',transferChannel:'bank_account',
 });
});

test('accepts cash only without a transfer channel',()=>{
 assert.deepEqual(normalizePaymentMetadata({paymentMethod:'cash'}),{paymentMethod:'cash'});
 assert.throws(()=>normalizePaymentMetadata({paymentMethod:'cash',transferChannel:'promptpay'}),/transferChannel/);
});

test('rejects legacy or incomplete method and channel combinations',()=>{
 assert.throws(()=>normalizePaymentMetadata({paymentMethod:'promptpay'}),/paymentMethod/);
 assert.throws(()=>normalizePaymentMetadata({paymentMethod:'bank_transfer'}),/transferChannel/);
 assert.throws(()=>normalizePaymentMetadata({transferChannel:'promptpay'}),/paymentMethod/);
 assert.throws(()=>normalizePaymentMetadata({paymentMethod:'bank_transfer',transferChannel:'cash'}),/transferChannel/);
});
