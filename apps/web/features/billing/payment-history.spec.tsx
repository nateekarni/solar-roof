import * as React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {PaymentHistory} from './payment-history';
test('bill detail shows individual persisted transfers, exact pending total and retained rejection',()=>{
 const html=renderToStaticMarkup(<PaymentHistory locale="en" payments={[{id:'a',amount:'2000.00000000',status:'pending_verification',transferDate:'2026-10-08T01:00:00Z'},{id:'b',amount:'2623.45000000',status:'pending_verification'},{id:'c',amount:'4623.45000000',status:'rejected',rejectionReason:'Wrong evidence'}]}/>);
 assert.match(html,/2,000.00/);assert.match(html,/2,623.45/);assert.match(html,/Total pending transfers: .*4,623.45/);assert.match(html,/Wrong evidence/);assert.match(html,/Rejection applies to all pending transfers/);
});
test('officer history renders bilingual payer details for each transfer and dashes for legacy data',()=>{
 for(const locale of ['en','th'] as const){const html=renderToStaticMarkup(<PaymentHistory locale={locale} payments={[{id:'payer',amount:'107.00',status:'pending_verification',payerName:'Actual payer',paymentMethod:'promptpay',originBank:'Payer bank',originAccount:'00123'} as any,{id:'legacy',amount:'107.00',status:'rejected'}]}/>);
 assert.match(html,/Actual payer/);assert.match(html,/Payer bank/);assert.match(html,/00123/);assert.match(html,locale==='en'?/PromptPay/:/พร้อมเพย์/);assert.match(html,locale==='en'?/Payer name/:/ชื่อผู้ชำระเงิน/);assert.match(html,locale==='en'?/Origin account/:/บัญชีต้นทาง/);assert.match(html,/—/);
 }
});
