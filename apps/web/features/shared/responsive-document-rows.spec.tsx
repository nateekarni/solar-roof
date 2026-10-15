import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {LocaleProvider} from '../../providers/locale-provider';
import {OperationCardList} from './operation-card-list';
import {ResponsiveDocumentRows} from './responsive-document-rows';
import {OperationTable} from './operation-table';
import {SessionUserProvider} from '../../providers/session-user-provider';
import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {SearchParamsContext,PathnameContext} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

const selectionRows=[
 {id:'secret-pending-id',period:'October',customerName:'School A',siteName:'Roof A',status:'draft',billingStatusView:'pending_issue_approval'},
 {id:'secret-paid-id',period:'September',customerName:'School B',siteName:'Roof B',status:'pending_issue_approval',billingStatusView:'paid'},
];
function renderSelectionTable(rows=selectionRows,resource='billing',locale:'en'|'th'='en'){
 return renderToStaticMarkup(<AppRouterContext.Provider value={{bfcacheId:'test',back(){},forward(){},refresh(){},push(){},replace(){},prefetch(){}}}>
  <SearchParamsContext.Provider value={new URLSearchParams()}><PathnameContext.Provider value="/billing">
   <SessionUserProvider user={{id:'session-user',email:'owner@example.test',displayName:'Owner',role:'owner'}}><LocaleProvider initialLocale={locale}>
    <OperationTable resource={resource} title="Bills" rows={rows} columns={[]} summary={[]} serverManaged/>
   </LocaleProvider></SessionUserProvider>
  </PathnameContext.Provider></SearchParamsContext.Provider>
 </AppRouterContext.Provider>);
}

test('desktop billing selection is the first column and includes all rows without exposing internal IDs',()=>{
 const html=renderSelectionTable();
 const firstHeader=html.match(/<thead[\s\S]*?<th\s[^>]*>([\s\S]*?)<\/th>/)?.[1];
 assert.ok(firstHeader?.includes('Select all on this page'));
 const body=html.match(/<tbody[\s\S]*?<\/tbody>/)?.[0]??'';
 assert.equal((body.match(/role="checkbox"/g)??[]).length,2);
 assert.match(body,/aria-label="Select October School A Roof A"/);
 assert.match(body,/aria-label="Select September School B Roof B"/);
 assert.doesNotMatch(html,/secret-pending-id|secret-paid-id/);
});

test('select-all is disabled when table has no rows',()=>{
 const html=renderSelectionTable([]);
 assert.match(html,/<button[^>]*role="checkbox"[^>]*disabled=""[^>]*aria-label="Select all on this page"/);
 const unrelated=renderSelectionTable(selectionRows,'receipts');
 assert.doesNotMatch(unrelated,/role="checkbox"/);
});

test('mobile selection reflects shared state with human labels across rows',()=>{
 for(const locale of ['en','th'] as const){
  const html=renderToStaticMarkup(<LocaleProvider initialLocale={locale}><OperationCardList resource="billing" title="Bills" columns={[]} rows={selectionRows} selection={{selected:new Set(['secret-pending-id']),toggle(){},togglePage(){}}}/></LocaleProvider>);
  assert.equal((html.match(/role="checkbox"/g)??[]).length,3);
  assert.match(html,new RegExp(`aria-label="${locale==='th'?'เลือก':'Select'} October School A Roof A"`));
  assert.match(html,/aria-checked="true"/);
  assert.doesNotMatch(html,/secret-pending-id|secret-paid-id/);
 }
});

test('mobile select-all is mixed for a partial page selection',()=>{
 const html=renderToStaticMarkup(<LocaleProvider initialLocale="en"><OperationCardList resource="billing" title="Bills" columns={[]} rows={[...selectionRows,{id:'secret-second-id',period:'November',billingStatusView:'pending_issue_approval'}]} selection={{selected:new Set(['secret-pending-id']),toggle(){},togglePage(){}}}/></LocaleProvider>);
 assert.match(html,/aria-checked="mixed"/);
 assert.doesNotMatch(html,/secret-second-id/);
});
test('mobile bill uses one combined overdue cell only for overdue collection status',()=>{
 const overdue=renderToStaticMarkup(<LocaleProvider initialLocale="th"><OperationCardList resource="billing" title="Bills" columns={[]} rows={[{id:'a',period:'October',collectionStatus:'overdue',daysOverdue:12,successfulReminderCount:3}]}/></LocaleProvider>);
 assert.match(overdue,/12 วัน \(ทวงแล้ว 3 ครั้ง\)/);assert.doesNotMatch(overdue,/จำนวนครั้งที่แจ้งเตือนสำเร็จ/);
 const pending=renderToStaticMarkup(<LocaleProvider initialLocale="en"><OperationCardList resource="billing" title="Bills" columns={[]} rows={[{id:'a',period:'October',collectionStatus:'pending_review',daysOverdue:12,successfulReminderCount:3}]}/></LocaleProvider>);
 assert.doesNotMatch(pending,/12 days|3 reminders/);assert.match(pending,/—/);
});
test('business financial mobile cards keep amounts, dates and permitted actions alongside desktop table',()=>{
 const mobile=<OperationCardList resource="billing" title="Invoices" columns={['Period','Customer','Site','Energy','Rate','Amount','Slip','Status']} rows={[{id:'a',period:'October',customerName:'Customer A',siteName:'Site A',consumedKwh:10,rate:2,amount:20,status:'approved'}]} renderActions={()=> <button>Submit payment evidence</button>}/>;
 const html=renderToStaticMarkup(<LocaleProvider initialLocale="en"><ResponsiveDocumentRows role="customer_user" resource="billing" mobile={mobile} desktop={<table><tbody><tr><td>Invoice desktop</td></tr></tbody></table>}/></LocaleProvider>);
 assert.match(html,/md:hidden/);assert.match(html,/hidden md:block/);assert.match(html,/฿20/);assert.match(html,/Submit payment evidence/);assert.match(html,/October/);
});
test('admin retains original table presentation',()=>{
 const html=renderToStaticMarkup(<ResponsiveDocumentRows role="admin" resource="billing" mobile={<p>mobile cards</p>} desktop={<table/>}/>);
 assert.match(html,/<table/);assert.doesNotMatch(html,/mobile cards|md:hidden/);
});
test('missing mobile financial amounts never display a zero charge',()=>{
 const html=renderToStaticMarkup(<LocaleProvider initialLocale="en"><OperationCardList resource="billing" title="Invoices" columns={[]} rows={[{id:'a',period:'October',amount:null,status:'approved'}]}/></LocaleProvider>);
 assert.doesNotMatch(html,/฿0/);assert.match(html,/฿—/);
});
test('mobile contract and billing rates remain numeric instead of being parsed as dates',()=>{
 const html=renderToStaticMarkup(<LocaleProvider initialLocale="en"><OperationCardList resource="billing" title="Invoices" columns={['Period','Customer','Site','Energy','Rate','Amount','Slip','Status']} rows={[{id:'a',period:'October',rate:2,amount:20,status:'approved'}]}/></LocaleProvider>);
 assert.match(html,/>2<\/span>/);assert.doesNotMatch(html,/February 2001|January 2001/);
});
