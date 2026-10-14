import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {BillingStatusTabs} from './billing-status-tabs';
import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {SearchParamsContext,PathnameContext} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import {SessionUserProvider} from '../../providers/session-user-provider';
import {OperationQueryTable} from '../shared/operation-query-table';

test('billing tabs expose translated names and scoped counts with the selected view',()=>{
 const html=renderToStaticMarkup(<BillingStatusTabs value="pending_verification" counts={{all:120,pending_verification:37}} locale="th" onValueChange={()=>{}}/>);
 assert.match(html,/role="tablist"/);
 assert.equal((html.match(/role="tab"/g)??[]).length,7);
 assert.match(html,/รออนุมัติออกเอกสาร/);
 assert.match(html,/รอตรวจหลักฐาน/);
 assert.match(html,/120/);
 assert.match(html,/aria-selected="true"[^>]*>รอตรวจหลักฐาน/);
 assert.match(html,/37/);
 assert.match(html,/overflow-x-auto/);
 assert.doesNotMatch(html,/pending_issue_approval|pending_verification/);
});

test('billing toolbar replaces both status dropdowns with tabs below search and dates',()=>{
 const html=renderToStaticMarkup(<AppRouterContext.Provider value={{bfcacheId:'test',back(){},forward(){},refresh(){},push(){},replace(){},prefetch(){}}}>
  <SearchParamsContext.Provider value={new URLSearchParams('search=school&billingStatusView=paid')}><PathnameContext.Provider value="/billing">
   <SessionUserProvider user={{id:'session-user',email:'user@example.test',displayName:'Officer',role:'owner'}}>
    <OperationQueryTable resource="billing" title="ใบวางบิล" summary={[]} initial={{idKey:'id',columns:[],rows:[],page:{limit:25,nextCursor:null,hasMore:false},facets:{billingStatusCounts:{all:120,pending_issue_approval:20,awaiting_payment:30,pending_verification:37,overdue:12,paid:15,unsuccessful:6}}}}/>
   </SessionUserProvider>
  </PathnameContext.Provider></SearchParamsContext.Provider>
 </AppRouterContext.Provider>);
 const tabs=html.indexOf('role="tablist"');
 assert.ok(tabs>html.indexOf('id="billing-search"'));
 assert.ok(tabs>html.indexOf('ช่วงเวลา'));
 assert.doesNotMatch(html,/สถานะการชำระเงิน/);
 assert.doesNotMatch(html,/aria-label="สถานะ"/);
 assert.match(html,/120/);
 const panelId=/<div[^>]*id="([^"]+)"[^>]*role="tabpanel"/.exec(html)?.[1];
 assert.ok(panelId,'billing results must supply the tab panel');
 assert.ok(html.includes(`aria-controls="${panelId}"`));
});

test('English billing tabs have human names and default missing counts to zero',()=>{
 const html=renderToStaticMarkup(<BillingStatusTabs value="all" locale="en" onValueChange={()=>{}}/>);
 assert.match(html,/Billing statement status/);
 assert.match(html,/Awaiting issuance approval/);
 assert.match(html,/Awaiting evidence review/);
 assert.match(html,/Unsuccessful/);
 assert.equal((html.match(/>0<\/span>/g)??[]).length,7);
});

test('receipts retain their independent collection filter without billing tabs',()=>{
 const html=renderToStaticMarkup(<AppRouterContext.Provider value={{bfcacheId:'test',back(){},forward(){},refresh(){},push(){},replace(){},prefetch(){}}}>
  <SearchParamsContext.Provider value={new URLSearchParams('collectionStatus=paid')}><PathnameContext.Provider value="/receipts">
   <SessionUserProvider user={{id:'session-user',email:'user@example.test',displayName:'Officer',role:'owner'}}>
    <OperationQueryTable resource="receipts" title="ใบเสร็จ" summary={[]} initial={{idKey:'id',columns:[],rows:[],page:{limit:25,nextCursor:null,hasMore:false}}}/>
   </SessionUserProvider>
  </PathnameContext.Provider></SearchParamsContext.Provider>
 </AppRouterContext.Provider>);
 assert.match(html,/สถานะการชำระเงิน/);assert.doesNotMatch(html,/role="tablist"/);
});

test('display-safe tab values produce the public billing status view',()=>{
 const selected:string[]=[];
 const element=BillingStatusTabs({value:'all',onValueChange:value=>selected.push(value)});
 element.props.onValueChange('1');
 element.props.onValueChange('5');
 assert.deepEqual(selected,['pending_issue_approval','paid']);
});
