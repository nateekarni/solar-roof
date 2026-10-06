import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {LocaleProvider} from '../../providers/locale-provider';
import {OperationCardList} from './operation-card-list';
import {ResponsiveDocumentRows} from './responsive-document-rows';
test('business financial mobile cards keep amounts, dates and permitted actions alongside desktop table',()=>{
 const mobile=<OperationCardList resource="billing" title="Invoices" columns={['Period','School','Site','Energy','Rate','Amount','Slip','Status']} rows={[{id:'a',period:'October',schoolName:'School A',siteName:'Site A',consumedKwh:10,rate:2,amount:20,status:'approved'}]} renderActions={()=> <button>Submit payment evidence</button>}/>;
 const html=renderToStaticMarkup(<LocaleProvider initialLocale="en"><ResponsiveDocumentRows role="school_user" resource="billing" mobile={mobile} desktop={<table><tbody><tr><td>Invoice desktop</td></tr></tbody></table>}/></LocaleProvider>);
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
 const html=renderToStaticMarkup(<LocaleProvider initialLocale="en"><OperationCardList resource="billing" title="Invoices" columns={['Period','School','Site','Energy','Rate','Amount','Slip','Status']} rows={[{id:'a',period:'October',rate:2,amount:20,status:'approved'}]}/></LocaleProvider>);
 assert.match(html,/>2<\/span>/);assert.doesNotMatch(html,/February 2001|January 2001/);
});
