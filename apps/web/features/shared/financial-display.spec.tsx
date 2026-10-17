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
import {OperationTable} from './operation-table';
import {OperationCardList} from './operation-card-list';
import {FinancialRecordDetails} from '../billing/financial-record-details';
import {LocaleProvider} from '../../providers/locale-provider';
import {SessionUserProvider} from '../../providers/session-user-provider';
import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {SearchParamsContext,PathnameContext} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import {billingStatusViewFromQuery} from './operation-request-query';

function renderFinance(children:React.ReactNode,locale:'th'|'en',view:string){
 return renderToStaticMarkup(<AppRouterContext.Provider value={{bfcacheId:'test',back(){},forward(){},refresh(){},push(){},replace(){},prefetch(){}}}>
  <SearchParamsContext.Provider value={new URLSearchParams({billingStatusView:view})}><PathnameContext.Provider value="/billing">
   <SessionUserProvider user={{id:'session-user',email:'user@example.test',displayName:'Officer',role:'owner'}}><LocaleProvider initialLocale={locale}>{children}</LocaleProvider></SessionUserProvider>
  </PathnameContext.Provider></SearchParamsContext.Provider>
 </AppRouterContext.Provider>);
}

test('desktop, mobile and detail display the derived billing view consistently with URL selection',()=>{
 for(const [view,status,th,en] of [
  ['paid','issued','ชำระแล้ว','Paid'],
  ['overdue','issued','เกินกำหนดชำระ','Overdue'],
  ['pending_verification','issued','รอตรวจหลักฐาน','Awaiting evidence review'],
  ['pending_issue_approval','draft','รออนุมัติออกเอกสาร','Awaiting issuance approval'],
  ['awaiting_payment','approved','รอชำระเงิน','Awaiting payment'],
  ['unsuccessful','cancelled','ถูกยกเลิก','Cancelled'],
 ] as const){
  assert.equal(billingStatusViewFromQuery(new URLSearchParams({billingStatusView:view,status})),view);
  const row={id:'bill-a',period:'October',status,billingStatusView:view,amount:'100.00',payments:[]};
  for(const locale of ['th','en'] as const){
   const desktop=renderFinance(<OperationTable resource="billing" title="Bills" columns={[]} rows={[row]} summary={[]} serverManaged/>,locale,view).match(/<tbody[\s\S]*?<\/tbody>/)?.[0];
   assert.ok(desktop);
   const mobile=renderFinance(<OperationCardList resource="billing" title="Bills" columns={[]} rows={[row]}/>,locale,view);
   const detail=renderFinance(<FinancialRecordDetails resource="billing" row={row}/>,locale,view).match(/<header[\s\S]*?<\/header>/)?.[0];
   assert.ok(detail);
   for(const [surface,html] of [['desktop',desktop],['mobile',mobile],['detail',detail]] as const){
    assert.ok(html.includes(locale==='th'?th:en),`${surface}: ${view}, ${locale}: ${html}`);
    if(view!=='unsuccessful')assert.doesNotMatch(html,/pending_issue_approval|pending_verification|awaiting_payment|>Issued<|>Draft<|>Cancelled<|>ออกแล้ว<|>ฉบับร่าง<|>ยกเลิก</);
   }
  }
  assert.equal(row.status,status,'display must preserve raw lifecycle state for actions');
 }
});

test('every known billing quality has clear human copy in Thai and English',()=>{
 for(const [quality,th,en] of [
  ['complete','ข้อมูลครบถ้วน','Complete data'],
  ['partial','ข้อมูลบางส่วน','Partial data'],
  ['estimated','ข้อมูลประมาณการ','Estimated data'],
  ['invalid','ข้อมูลไม่ถูกต้อง','Invalid data'],
 ] as const)for(const locale of ['th','en'] as const){
  const html=renderToStaticMarkup(<>{renderRecordValue(quality,'quality',locale)}</>);
  assert.ok(html.includes(locale==='th'?th:en),`${quality}: ${locale}: ${html}`);
  assert.doesNotMatch(html,/Unknown status|ไม่ทราบสถานะ/);
  assert.doesNotMatch(html,new RegExp(`>${quality}<`));
 }
});
test('billing table excludes slip while retaining financial status',()=>{
 assert.ok(!operationKeys('billing',{}).includes('slipUrl'));
 assert.ok(operationKeys('billing',{}).includes('status'));
});

test('finance states and data quality render human copy in both locales',()=>{
 for(const [status,th,en] of [['pending_issue_approval','รออนุมัติออกเอกสาร','Awaiting issuance approval'],['awaiting_payment','รอชำระเงิน','Awaiting payment'],['pending_verification','รอตรวจหลักฐาน','Awaiting evidence review'],['unsuccessful','ถูกยกเลิก','Cancelled'],['rejected','ปฏิเสธ','Rejected'],['complete','ข้อมูลครบถ้วน','Complete data']] as const){
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
