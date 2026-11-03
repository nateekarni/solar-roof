import * as React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {PaymentVerificationDialog} from './payment-verification-dialog';
import {PaymentHistory} from './payment-history';
test('inline review exposes a single full-payment confirmation without editable settlement fields',()=>{
 const html=renderToStaticMarkup(<PaymentVerificationDialog inline open onOpenChange={()=>{}} billingCycle={{id:'bill',amount:'100'}}/>);
 assert.match(html,/ยอดคงเหลือเต็มจำนวน/);
 assert.match(html,/ตรวจสอบและยืนยัน/);
 assert.doesNotMatch(html,/verified-amount|transfer-time|transfer-reference/);
 assert.doesNotMatch(html,/<iframe/);
});
test('reviewed evidence stays accessible in history',()=>{
 const html=renderToStaticMarkup(<PaymentHistory locale="en" payments={[{id:'p',amount:null,status:'rejected',slipUrl:'https://example.test/evidence.png',rejectionReason:'Unreadable'}]}/>);
 assert.match(html,/href="https:\/\/example.test\/evidence.png"/);
 assert.match(html,/Unreadable/);
});
import {RecordDocuments} from '../shared/record-documents';
test('record documents render selection and related payment link before loading document content',()=>{
 const html=renderToStaticMarkup(<RecordDocuments resource="receipts" row={{id:'receipt',billingCycleId:'bill'}}/>);
 assert.match(html,/button/);assert.match(html,/href="\/records\/billing\/bill"/);
 assert.doesNotMatch(html,/<iframe|Loading original document/);
});
test('inline review cannot submit while current approval capability is unavailable',()=>{
 const html=renderToStaticMarkup(<PaymentVerificationDialog inline open canReview={false} onOpenChange={()=>{}} billingCycle={{id:'bill'}}/>);
 assert.match(html,/disabled=""[^>]*>ตรวจสอบและยืนยัน/);
});
