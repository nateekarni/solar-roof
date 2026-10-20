import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {CashPaymentHistory} from './cash-payment-history';

test('daily cash list shows customer, cycle, amount, receipt, recorder and both dates',()=>{
 const html=renderToStaticMarkup(<CashPaymentHistory locale="en" entries={[{id:'cash-1',amount:'200.00',customerName:'Acme',siteName:'Roof A',billingCycleId:'cycle-1',receiptId:'receipt-1',receiptNumber:'REC-001',recordedBy:'Natee',receivedAt:'2026-10-19',recordedAt:'2026-10-19T10:30:00+07:00',note:null}]}/>);
 for(const value of ['Cash received today','Acme','Roof A','cycle-1','200.00','REC-001','Natee','October 19, 2026','10:30'])assert.match(html,new RegExp(value));
});
