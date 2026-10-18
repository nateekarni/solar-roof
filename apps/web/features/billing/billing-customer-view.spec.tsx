import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { SearchParamsContext, PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { SessionUserProvider } from '../../providers/session-user-provider';
import { OperationQueryTable } from '../shared/operation-query-table';
import { OperationActions } from '../shared/operation-page-actions';
import { OperationTable } from '../shared/operation-table';

test('customer_user in billing view has no export or bulk approval buttons', () => {
  const html = renderToStaticMarkup(
    <AppRouterContext.Provider value={{ bfcacheId: 'test', back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} }}>
      <SearchParamsContext.Provider value={new URLSearchParams('')}>
        <PathnameContext.Provider value="/billing">
          <SessionUserProvider user={{ id: 'customer-user-1', email: 'billing@customer.test', displayName: 'Customer Officer', role: 'customer_user' }}>
            <OperationActions resource="billing" title="ใบวางบิล" action="" />
          </SessionUserProvider>
        </PathnameContext.Provider>
      </SearchParamsContext.Provider>
    </AppRouterContext.Provider>
  );

  assert.doesNotMatch(html, /นำออกข้อมูล|Export data/);
  assert.doesNotMatch(html, /อนุมัติและออกเอกสาร/);
});

test('staff user in billing view retains export and bulk approval buttons', () => {
  const html = renderToStaticMarkup(
    <AppRouterContext.Provider value={{ bfcacheId: 'test', back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} }}>
      <SearchParamsContext.Provider value={new URLSearchParams('')}>
        <PathnameContext.Provider value="/billing">
          <SessionUserProvider user={{ id: 'staff-user-1', email: 'staff@solar.test', displayName: 'Staff Officer', role: 'owner' }}>
            <OperationActions resource="billing" title="ใบวางบิล" action="" />
          </SessionUserProvider>
        </PathnameContext.Provider>
      </SearchParamsContext.Provider>
    </AppRouterContext.Provider>
  );

  assert.match(html, /นำออกข้อมูล/);
  assert.match(html, /อนุมัติเอกสาร/);
});

test('customer_user sees cardless financial table without summary metric cards', () => {
  const summary = [
    { label: 'ใบวางบิล', value: '10', unit: 'ฉบับ', note: 'จากข้อมูลในระบบ' },
    { label: 'ยอดเรียกเก็บรวม', value: '100,000', unit: 'บาท', note: 'จากข้อมูลในระบบ' },
  ];

  const html = renderToStaticMarkup(
    <AppRouterContext.Provider value={{ bfcacheId: 'test', back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} }}>
      <SearchParamsContext.Provider value={new URLSearchParams('')}>
        <PathnameContext.Provider value="/billing">
          <SessionUserProvider user={{ id: 'customer-user-1', email: 'billing@customer.test', displayName: 'Customer Officer', role: 'customer_user' }}>
            <OperationTable
              resource="billing"
              title="ใบวางบิล"
              columns={[]}
              rows={[]}
              summary={summary}
              serverManaged
            />
          </SessionUserProvider>
        </PathnameContext.Provider>
      </SearchParamsContext.Provider>
    </AppRouterContext.Provider>
  );

  assert.doesNotMatch(html, /stat-card/);
  assert.doesNotMatch(html, /ยอดเรียกเก็บรวม/);
});

test('customer_user billing query table renders exactly 5 status tabs and hides cancelled filters', () => {
  const html = renderToStaticMarkup(
    <AppRouterContext.Provider value={{ bfcacheId: 'test', back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} }}>
      <SearchParamsContext.Provider value={new URLSearchParams('')}>
        <PathnameContext.Provider value="/billing">
          <SessionUserProvider user={{ id: 'customer-user-1', email: 'billing@customer.test', displayName: 'Customer Officer', role: 'customer_user' }}>
            <OperationQueryTable
              resource="billing"
              title="ใบวางบิล"
              summary={[]}
              userRole="customer_user"
              initial={{
                idKey: 'id',
                columns: [],
                rows: [],
                page: { limit: 25, nextCursor: null, hasMore: false },
                facets: {
                  billingStatusCounts: {
                    all: 10,
                    pending_issue_approval: 2,
                    awaiting_payment: 3,
                    pending_verification: 2,
                    partially_paid: 1,
                    overdue: 1,
                    paid: 2,
                    unsuccessful: 0,
                  },
                },
              }}
            />
          </SessionUserProvider>
        </PathnameContext.Provider>
      </SearchParamsContext.Provider>
    </AppRouterContext.Provider>
  );

  assert.equal((html.match(/role="tab"/g) ?? []).length, 6);
  assert.match(html, /รอชำระเงิน/);
  assert.match(html, /รอตรวจหลักฐาน/);
  assert.match(html, /ชำระบางส่วน/);
  assert.match(html, /เกินกำหนดชำระ/);
  assert.match(html, /ชำระแล้ว/);
  assert.doesNotMatch(html, /รออนุมัติออกเอกสาร/);
  assert.doesNotMatch(html, /ถูกยกเลิก/);
  assert.doesNotMatch(html, /ไม่สำเร็จ/);
});
