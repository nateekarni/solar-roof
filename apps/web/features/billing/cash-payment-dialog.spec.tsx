import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {CashPaymentConfirmation,CashPaymentDialog,createCashPaymentDraft,cashPaymentPayload} from './cash-payment-dialog';

test('cash draft defaults to the full outstanding balance and Bangkok received date',()=>{
 const draft=createCashPaymentDraft('670.13','2026-10-19');
 assert.deepEqual(draft,{amount:'670.13',receivedAt:'2026-10-19',note:''});
 assert.deepEqual(cashPaymentPayload(draft,'670.13'),{amount:'670.13',receivedAt:'2026-10-19'});
 assert.deepEqual(cashPaymentPayload({...draft,amount:'200',note:'  counter  '},'670.13'),{amount:'200.00',receivedAt:'2026-10-19',note:'counter'});
 assert.throws(()=>cashPaymentPayload({...draft,amount:'700'},'670.13'),/outstanding/i);
 assert.throws(()=>cashPaymentPayload({...draft,receivedAt:'2026-10-20'},'670.13','2026-10-19'),/future/i);
 assert.throws(()=>cashPaymentPayload({...draft,receivedAt:'2026-02-30'},'670.13','2026-10-19'),/valid calendar date/i);
});

test('cash dialog exposes amount, date, note and the staff-only record action',()=>{
 const html=renderToStaticMarkup(<CashPaymentDialog inline open onOpenChange={()=>{}} billingCycle={{id:'cycle',outstandingAmount:'670.13',invoiceNumber:'INV-001',customerName:'Customer'}} onSuccess={()=>{}}/>);
 assert.match(html,/รับชำระเงินสด/);
 assert.match(html,/INV-001/);
 assert.match(html,/670\.13/);
 assert.match(html,/cash-received-at/);
 assert.match(html,/cash-note/);
 assert.match(html,/บันทึกรับเงินสด/);
});

test('closed cash dialog renders safely when a non-payable record has no outstanding balance',()=>{
 assert.doesNotThrow(()=>renderToStaticMarkup(<CashPaymentDialog open={false} onOpenChange={()=>{}} billingCycle={{id:'cycle',outstandingAmount:'0.00'}}/>));
});

test('cash confirmation exposes the paid amount, remaining balance, receipt preview and queued notification state',()=>{
 const html=renderToStaticMarkup(<CashPaymentConfirmation locale="en" amount="200.00" result={{success:true,billingCycleStatus:'partially_paid',outstandingAmount:'470.13',paymentId:'payment',receipt:{id:'receipt/id',documentNumber:'RCT-001'}}} onClose={()=>{}}/>);
 assert.match(html,/200\.00/);
 assert.match(html,/470\.13/);
 assert.match(html,/RCT-001/);
 assert.match(html,/notification has been queued/i);
 assert.match(html,/href="\/records\/receipts\/receipt%2Fid"/);
});
