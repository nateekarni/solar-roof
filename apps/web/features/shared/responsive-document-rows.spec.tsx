import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {LocaleProvider} from '../../providers/locale-provider';
import {OperationCardList} from './operation-card-list';
import {ResponsiveDocumentRows} from './responsive-document-rows';
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
