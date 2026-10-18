import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {BillingHeaderBulkAction} from './billing-header-bulk-action';
import {LocaleProvider} from '../../providers/locale-provider';
import {SessionUserProvider} from '../../providers/session-user-provider';

import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';

function renderAction(locale: 'th' | 'en' = 'th', count = 0) {
  const router = {bfcacheId: 'test', back(){}, forward(){}, refresh(){}, push(){}, replace(){}, prefetch(){}};
  return renderToStaticMarkup(
    <AppRouterContext.Provider value={router}>
      <SessionUserProvider user={{id: 'test-user', email: 'owner@test.local', displayName: 'Owner', role: 'owner'}}>
        <LocaleProvider initialLocale={locale}>
          <BillingHeaderBulkAction initialCount={count} />
        </LocaleProvider>
      </SessionUserProvider>
    </AppRouterContext.Provider>
  );
}

test('header bulk action button shows count and is disabled when 0 items', () => {
  const htmlTh = renderAction('th', 0);
  assert.match(htmlTh, /อนุมัติเอกสาร \(0\)/);
  assert.match(htmlTh, /disabled=""/);

  const htmlEn = renderAction('en', 0);
  assert.match(htmlEn, /Approve documents \(0\)/);
  assert.match(htmlEn, /disabled=""/);
});

test('header bulk action button displays active label with count', () => {
  const html = renderAction('th', 5);
  assert.match(html, /อนุมัติเอกสาร \(5\)/);
});
