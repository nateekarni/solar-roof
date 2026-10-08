import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {recordBackLink} from './record-back-link';
import {renderRecordValue} from './record-value';
test('Organization financial records return to Documents in both locales',()=>{
 for(const resource of ['billing','documents','receipts'])for(const locale of ['th','en'] as const){
  assert.deepEqual(recordBackLink(resource,'school_user','/billing',locale),{href:'/contracts',label:locale==='th'?'กลับไปหน้าเอกสาร':'Back to documents'});
 }
 assert.deepEqual(recordBackLink('billing','admin','/billing','en'),{href:'/billing',label:'Back to list'});
});
test('payment status renders localized existing badges and absent status stays unavailable',()=>{
 assert.match(renderToStaticMarkup(<>{renderRecordValue('pending_verification','paymentStatus','th')}</>),/รอตรวจสอบการชำระเงิน/);
 assert.match(renderToStaticMarkup(<>{renderRecordValue('rejected','paymentStatus','en')}</>),/Rejected/);
 assert.equal(renderRecordValue(null,'paymentStatus','en'),'—');
});
