import * as React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {PaymentMetadataFields} from './payment-dialog';
test('payer inputs stay optional, show entered evidence and expose only existing transfer methods',()=>{
 for(const locale of ['en','th'] as const){
  const html=renderToStaticMarkup(<PaymentMetadataFields locale={locale} value={{payerName:'Payer',paymentMethod:'promptpay',originBank:'Origin bank',originAccount:'00123'}} onChange={()=>{}}/>);
  assert.match(html,/value="Payer"/);assert.match(html,/value="00123"/);assert.match(html,/maxLength="200"/i);assert.match(html,/maxLength="120"/i);assert.match(html,/maxLength="80"/i);assert.match(html,/value="bank_transfer"/);assert.match(html,/value="promptpay" selected/);assert.doesNotMatch(html,/required|value="cash"|value="card"/);assert.match(html,locale==='en'?/Payer name/:/ชื่อผู้ชำระเงิน/);
 }
});
