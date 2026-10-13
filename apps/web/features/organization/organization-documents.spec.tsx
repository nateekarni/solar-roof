import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {LocaleProvider} from '../../providers/locale-provider';
import {OrganizationDocuments} from './organization-documents';
import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
const router={bfcacheId:'test',back(){},forward(){},refresh(){},push(){},replace(){},prefetch:async()=>{},hmrRefresh(){}};
for(const kind of ['invoice','receipt'] as const)test(`customer ${kind} page has its own heading and no contract prerequisite`,()=>{
 const html=renderToStaticMarkup(<AppRouterContext.Provider value={router}><LocaleProvider initialLocale="th"><OrganizationDocuments kind={kind}/></LocaleProvider></AppRouterContext.Provider>);
 assert.match(html,kind==='invoice'?/ใบวางบิล/:/ใบเสร็จรับเงิน/);assert.doesNotMatch(html,/เลือกสัญญา|Select contract|contract linkage/);assert.match(html,/role="status"/);
});
