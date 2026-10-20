import * as React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {BillingRecordPanel,billingRecordTransfers} from './billing-record-panel';
test('attachment-only pending evidence remains visible without declared amount',()=>{
 const evidence={id:'new',amount:null,status:'pending_verification',slipUrl:'data:image/png;base64,AA=='};
 assert.equal(billingRecordTransfers([evidence]).length,1);
});
const row={id:'cycle-a',status:'pending_verification',payments:[{id:'a',amount:'2000.00000000',status:'pending_verification'},{id:'b',amount:'2623.45000000',status:'pending_verification'}]};
test('customer billing record exposes additional payment and exact persisted history',()=>{
 const html=renderToStaticMarkup(<BillingRecordPanel row={row} locale="en" capabilities={{financialScope:'TEST',actions:[],unavailable:{},operationsActions:['submit_payment']}} onPay={()=>{}} onVerify={()=>{}}/>);
 assert.match(html,/Submit transfer evidence/);assert.match(html,/Awaiting amount verification/);assert.doesNotMatch(html,/Total pending transfers|2,000.00|2,623.45/);assert.doesNotMatch(html,/Verify pending transfers/);
});
test('staff billing record exposes verification only with current financial capability',()=>{
 const html=renderToStaticMarkup(<BillingRecordPanel row={row} locale="en" capabilities={{financialScope:'TEST',actions:['approve_payment'],unavailable:{}}} onPay={()=>{}} onVerify={()=>{}}/>);assert.match(html,/Verify pending transfers/);
 const denied=renderToStaticMarkup(<BillingRecordPanel row={row} locale="en" capabilities={{actions:[],unavailable:{}}} onPay={()=>{}} onVerify={()=>{}}/>);assert.doesNotMatch(denied,/Verify pending transfers|Submit transfer evidence/);
});
test('paid bill has no payment or verification action and modal hides duplicate background history',()=>{
 const html=renderToStaticMarkup(<BillingRecordPanel row={{...row,status:'paid',paymentStatus:'paid'}} locale="th" capabilities={{financialScope:'TEST',actions:['approve_payment'],unavailable:{},operationsActions:['submit_payment']}} onPay={()=>{}} onVerify={()=>{}} historyVisible={false}/>);assert.doesNotMatch(html,/button|ประวัติการโอนเงิน/);
});
test('cash receipt action requires its live capability and a positive eligible outstanding balance',()=>{
 const eligible={...row,status:'approved',billingStatusView:'awaiting_payment',outstandingAmount:'670.13'};
 const allowed=renderToStaticMarkup(<BillingRecordPanel row={eligible} locale="en" capabilities={{actions:[],unavailable:{},operationsActions:['record_cash_payment']}} onPay={()=>{}} onCash={()=>{}} onVerify={()=>{}}/>);
 assert.match(allowed,/Record cash payment/);
 for(const patch of [{outstandingAmount:'0.00'},{billingStatusView:'pending_verification'},{status:'paid'}]){
  const denied=renderToStaticMarkup(<BillingRecordPanel row={{...eligible,...patch}} locale="en" capabilities={{actions:[],unavailable:{},operationsActions:['record_cash_payment']}} onPay={()=>{}} onCash={()=>{}} onVerify={()=>{}}/>);
  assert.doesNotMatch(denied,/Record cash payment/);
 }
});
