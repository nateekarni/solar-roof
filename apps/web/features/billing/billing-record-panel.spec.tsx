import * as React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {BillingRecordPanel} from './billing-record-panel';
const row={id:'cycle-a',status:'pending_verification',payments:[{id:'a',amount:'2000.00000000',status:'pending_verification'},{id:'b',amount:'2623.45000000',status:'pending_verification'}]};
test('customer billing record exposes additional payment and exact persisted history',()=>{
 const html=renderToStaticMarkup(<BillingRecordPanel row={row} locale="en" capabilities={{financialScope:'TEST',actions:[],unavailable:{},operationsActions:['submit_payment']}} onPay={()=>{}} onVerify={()=>{}}/>);
 assert.match(html,/Submit transfer evidence/);assert.match(html,/2,000.00/);assert.match(html,/2,623.45/);assert.match(html,/Total pending transfers: .*4,623.45/);assert.doesNotMatch(html,/Verify pending transfers/);
});
test('staff billing record exposes verification only with current financial capability',()=>{
 const html=renderToStaticMarkup(<BillingRecordPanel row={row} locale="en" capabilities={{financialScope:'TEST',actions:['approve_payment'],unavailable:{}}} onPay={()=>{}} onVerify={()=>{}}/>);assert.match(html,/Verify pending transfers/);
 const denied=renderToStaticMarkup(<BillingRecordPanel row={row} locale="en" capabilities={{actions:[],unavailable:{}}} onPay={()=>{}} onVerify={()=>{}}/>);assert.doesNotMatch(denied,/Verify pending transfers|Submit transfer evidence/);
});
test('paid bill has no payment or verification action and modal hides duplicate background history',()=>{
 const html=renderToStaticMarkup(<BillingRecordPanel row={{...row,status:'paid',paymentStatus:'paid'}} locale="th" capabilities={{financialScope:'TEST',actions:['approve_payment'],unavailable:{},operationsActions:['submit_payment']}} onPay={()=>{}} onVerify={()=>{}} historyVisible={false}/>);assert.doesNotMatch(html,/button|ประวัติการโอนเงิน/);
});