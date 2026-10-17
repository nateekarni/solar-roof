import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {FinancialReadinessStatus} from '@solar/api-contracts';
import {FinanceReadinessCard} from './finance-readiness-card';

function status(items: FinancialReadinessStatus['items'], approval: FinancialReadinessStatus['approval'] = null): FinancialReadinessStatus {
  return {scope: approval ? 'PRODUCTION' : null, fingerprint:'abc', approval, items,
    actions: {calculate:{enabled:false,missing:[]},issue:{enabled:false,missing:[]},approve_payment:{enabled:false,missing:[]},adjust:{enabled:false,missing:[]},send:{enabled:false,missing:[]}}};
}
const confirmation = {id:'approval.confirmation',ready:false,responsibility:'owner' as const,destination:'/settings/company'};
const approval = {id:'approved',approvedAt:'2026-10-13T00:00:00Z',approvedBy:'owner'};
const render = (value: FinancialReadinessStatus, owner = true) => renderToStaticMarkup(<FinanceReadinessCard status={value} locale="en" isOwner={owner} confirming={false} onConfirm={()=>{}}/>);

test('incomplete Owner configuration links to setup and prevents confirmation',()=>{
  const html=render(status([{id:'company.logo',ready:false,responsibility:'owner',destination:'/settings/company'},confirmation]));
  assert.match(html,/href="\/settings\/company#company-logoUrl"/);
  assert.match(html,/<button[^>]* disabled=""/);
});
test('complete global Owner data permits confirmation despite site and environment blockers',()=>{
  const html=render(status([{id:'company.logo',ready:true,responsibility:'owner'},confirmation,{id:'site.tax',siteId:'site-a',ready:false,responsibility:'owner',destination:'/sites/site-a/settings'},{id:'environment.smtp',ready:false,responsibility:'environment',destination:'/secret-smtp'},{id:'site.meter',siteId:'site-a',ready:false,responsibility:'technical',destination:'/sites/site-a/settings'}]));
  assert.match(html,/Confirm production readiness/);
  assert.doesNotMatch(html,/<button[^>]* disabled=""/);
  assert.match(html,/Site readiness/);
  assert.match(html,/aria-expanded="false"/);
  assert.doesNotMatch(html,/secret-smtp|SMTP_PASSWORD|type="password"/);
  assert.doesNotMatch(html,/Finance and delivery services/);
});
test('current site step has setup navigation and technical guidance without displaying its ID',()=>{
  const html=render(status([{...confirmation,ready:true},{id:'site.tax',siteId:'site-a',ready:false,responsibility:'owner',destination:'/sites/site-a/settings'},{id:'site.meter',siteId:'site-a',ready:false,responsibility:'technical',destination:'/sites/site-a/settings'}],approval));
  assert.match(html,/href="\/records\/sites\/site-a"/);
  assert.match(html,/Ask the technical team/);
  assert.doesNotMatch(html,/>site-a<|\(site-a\)/);
});
test('approved configuration shows infrastructure blockers and does not ask for confirmation again',()=>{
  const html=render(status([{...confirmation,ready:true},{id:'environment.smtp',ready:false,responsibility:'environment'}],approval));
  assert.match(html,/Production configuration confirmed/);
  assert.doesNotMatch(html,/Email delivery|Finance and delivery services/);
  assert.doesNotMatch(html,/Confirm production readiness/);
});
test('ready status is distinguished from test scope and non Owners cannot confirm',()=>{
  const ready=status([{...confirmation,ready:true}],approval);
  ready.actions.send.enabled=true;
  assert.match(render(ready),/Ready for production/);
  assert.doesNotMatch(render(status([confirmation]),false),/Confirm production readiness/);
  assert.match(render({...ready,scope:'TEST',approval:null}),/TEST/);
});
test('unavailable company configuration and unsaved edits cannot be confirmed',()=>{
  assert.match(render(status([confirmation])),/<button[^>]* disabled=""/);
  const html=renderToStaticMarkup(<FinanceReadinessCard status={status([{id:'company.logo',ready:true,responsibility:'owner'},confirmation])} locale="en" isOwner confirming={false} pendingChanges onConfirm={()=>{}}/>);
  assert.match(html,/<button[^>]* disabled=""/);
  assert.match(html,/Save or cancel/);
});
test('progress counts readiness requirements and hides completed labels in either locale',()=>{
  const value=status([{id:'company.logo',ready:true,responsibility:'owner'},{id:'company.name',ready:false,responsibility:'owner'},confirmation,{id:'site.tax',siteId:'site-a',ready:true,responsibility:'owner'},{id:'environment.smtp',ready:true,responsibility:'environment'},{id:'site.meter',siteId:'site-a',ready:false,responsibility:'technical'}]);
  const en=render(value);
  assert.match(en,/3 of 6 complete/);
  assert.match(en,/role="progressbar"[^>]*aria-valuemin="0"[^>]*aria-valuemax="6"[^>]*aria-valuenow="3"/);
  assert.doesNotMatch(en,/Company logo|Confirmed tax settings|Email delivery/);
  const th=renderToStaticMarkup(<FinanceReadinessCard status={value} locale="th" isOwner confirming={false} onConfirm={()=>{}}/>);
  assert.match(th,/ครบแล้ว 3 จาก 6 รายการ/);
});
test('current approval shows a readable actor and Bangkok timestamp without long identifiers',()=>{
  const value=status([{...confirmation,ready:true}],{id:'confirmed',approvedBy:'owner-confirmed-123',approvedAt:'2026-10-13T00:00:00Z'});
  const en=render(value);
  assert.match(en,/Confirmed by<\/dt><dd[^>]*>Owner<\/dd>/);
  assert.doesNotMatch(en,/owner-confirmed-123/);
  assert.match(en,/<time dateTime="2026-10-13T00:00:00Z">13 October 2026 07:00 \(Asia\/Bangkok\)<\/time>/);
  const th=renderToStaticMarkup(<FinanceReadinessCard status={value} locale="th" isOwner confirming={false} onConfirm={()=>{}}/>);
  assert.match(th,/ยืนยันโดย/);
  assert.doesNotMatch(th,/owner-confirmed-123/);
  assert.match(th,/13 ตุลาคม 2569 07:00 \(เวลาไทย\)/);
  assert.doesNotMatch(render({...value,approval:null,scope:null}),/owner-confirmed-123|dateTime=/);
});

test('first missing step is expanded while future steps stay compact with accessible disclosure',()=>{
  const html=render(status([{id:'company.name',ready:false,responsibility:'owner',destination:'/settings/company'},confirmation,{id:'site.tax',siteId:'f50c102a-6160-4e3c-8cf0-8bca1677ddbe',ready:false,responsibility:'owner',destination:'/sites/f50c102a-6160-4e3c-8cf0-8bca1677ddbe/settings'}]));
  assert.match(html,/<li[^>]*aria-current="step"/);
  assert.match(html,/aria-expanded="true"/);
  assert.equal((html.match(/aria-expanded="false"/g)??[]).length,2);
  assert.match(html,/Company name/);
  assert.doesNotMatch(html,/Confirmed tax settings|>f50c102a-6160-4e3c-8cf0-8bca1677ddbe<|site\.tax/);
});
test('awaiting confirmation is distinct from incomplete setup despite infrastructure blockers',()=>{
  const value=status([{id:'company.logo',ready:true,responsibility:'owner'},confirmation,{id:'environment.smtp',ready:false,responsibility:'environment'}]);
  assert.match(render(value),/Awaiting Owner confirmation/);
  const th=renderToStaticMarkup(<FinanceReadinessCard status={value} locale="th" isOwner confirming={false} onConfirm={()=>{}}/>);
  assert.match(th,/รอการยืนยันจากเจ้าของ/);
  assert.doesNotMatch(render(status([{id:'company.logo',ready:false,responsibility:'owner'},confirmation])),/Awaiting Owner confirmation/);
});

test('multiple sites consolidate into a single site readiness step with count summary',()=>{
  const multiSiteItems: FinancialReadinessStatus['items'] = [
    { ...confirmation, ready: true },
    { id: 'site.tax', siteId: 'site-1', ready: false, responsibility: 'owner', destination: '/sites/site-1/settings' },
    { id: 'site.meter', siteId: 'site-1', ready: true, responsibility: 'technical', destination: '/sites/site-1/settings' },
    { id: 'site.tax', siteId: 'site-2', ready: true, responsibility: 'owner', destination: '/sites/site-2/settings' },
    { id: 'site.meter', siteId: 'site-2', ready: true, responsibility: 'technical', destination: '/sites/site-2/settings' },
    { id: 'site.tax', siteId: 'site-3', ready: false, responsibility: 'owner', destination: '/sites/site-3/settings' },
  ];
  const html = render(status(multiSiteItems, approval));
  const siteMatches = html.match(/Site readiness/g) ?? [];
  assert.equal(siteMatches.length, 1);
  assert.match(html, /1 of 3 sites ready/);
});

