import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {renderStatusBadge} from '../../lib/status-badge';
import {operationKeys} from './operation-columns';
import {operationFilters} from '@solar/api-contracts';
import {renderRecordValue} from './record-value';
import {PaymentHistory} from '../billing/payment-history';
import {FinancialDocumentList} from '../billing/financial-document-list';
test('billing table excludes slip while retaining financial status',()=>{
 assert.ok(!operationKeys('billing',{}).includes('slipUrl'));
 assert.ok(operationKeys('billing',{}).includes('status'));
});

test('finance states and data quality render human copy in both locales',()=>{
 for(const [status,th,en] of [['pending_issue_approval','รออนุมัติออกเอกสาร','Awaiting issuance approval'],['awaiting_payment','รอชำระเงิน','Awaiting payment'],['pending_verification','รอตรวจหลักฐาน','Awaiting evidence review'],['unsuccessful','ไม่สำเร็จ','Unsuccessful'],['rejected','ปฏิเสธ','Rejected'],['complete','ข้อมูลครบถ้วน','Complete data']] as const){
  for(const locale of ['th','en'] as const){
   const html=renderToStaticMarkup(<>{renderRecordValue(status,status==='complete'?'quality':'status',locale)}</>);
   assert.match(html,new RegExp(locale==='th'?th:en));
   assert.doesNotMatch(html,new RegExp(`>${status}<`));
  }
 }
});

test('unknown statuses never expose raw status identifiers',()=>{
 const html=renderToStaticMarkup(renderStatusBadge('internal_finance_state_a','en'));
 assert.match(html,/Unknown status/);
 assert.doesNotMatch(html,/internal_finance_state_a/);
});

test('transfer history never exposes unknown finance status keys or transfer IDs',()=>{
 const html=renderToStaticMarkup(<PaymentHistory locale="en" payments={[{id:'secret-transfer-id',amount:null,status:'internal_finance_state_a'}]}/>);
 assert.match(html,/Unknown status/);
 assert.doesNotMatch(html,/internal_finance_state_a|secret-transfer-id/);
});

test('evidence labels and preview IDs never expose internal status keys or transfer IDs',()=>{
 const html=renderToStaticMarkup(<FinancialDocumentList locale="th" selected={null} onSelect={()=>{}} disabled={false} documents={[{id:'payment:secret-transfer-id',kind:'payment',payment:{id:'secret-transfer-id',amount:null,status:'internal_finance_state_a'}}]}/>);
 assert.match(html,/ไม่ทราบสถานะ/);
 assert.doesNotMatch(html,/internal_finance_state_a|secret-transfer-id/);
});
test('receipt lifecycle states have translated semantic badges and superseded filter',()=>{
 for(const [value,label,color] of [['issued','ออกแล้ว','success'],['finalized','ยืนยันแล้ว','success'],['superseded','ถูกแทนที่ด้วยฉบับใหม่','muted'],['cancelled','ยกเลิก','destructive']]){
  const html=renderToStaticMarkup(renderStatusBadge(value!,'th'));
  assert.ok(html.includes(label!),html);assert.ok(html.includes(color!),html);
 }
 assert.ok(operationFilters.receipts?.[0]?.options.some(option=>option.value==='superseded'));
});
