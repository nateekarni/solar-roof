import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FinancialAvailabilityNotice } from "./financial-availability-notice";

for (const scenario of [
  { locale: "en", resource: "contracts", status: /Contract creation is currently unavailable\./, summary: /Why is this unavailable\?/, detail: /verified accounting requirements and implementation readiness/ },
  { locale: "th", resource: "documents", status: /ยังไม่สามารถออกเอกสารได้ในขณะนี้/, summary: /เหตุใดจึงยังไม่พร้อมใช้งาน/, detail: /การยืนยันข้อกำหนดทางบัญชีและความพร้อมของระบบ/ },
] as const) {
  for (const role of ["owner", "admin", "operator", "accountant"]) {
    test(`${scenario.locale} ${role} receives localized status and collapsed readiness details`, () => {
      const html = renderToStaticMarkup(<FinancialAvailabilityNotice locale={scenario.locale} role={role} resource={scenario.resource} />);
      assert.match(html, /role="status"/);
      assert.match(html, scenario.status);
      assert.match(html, /<details[\s>]/);
      assert.doesNotMatch(html, /<details[^>]*\sopen/);
      assert.match(html, scenario.summary);
      assert.match(html, scenario.detail);
      assert.doesNotMatch(html, /Financial workflows await|FINANCIAL_WRITES_ENABLED/);
    });
  }
  test(`${scenario.locale} organization user receives status without internal readiness details`, () => {
    const html = renderToStaticMarkup(<FinancialAvailabilityNotice locale={scenario.locale} role="school_user" resource={scenario.resource} />);
    assert.match(html, scenario.status);
    assert.doesNotMatch(html, /<details|accounting|implementation|บัญชี|ความพร้อมของระบบ|Financial workflows await|settings|ตั้งค่า/);
  });
}

test("notice identifies unavailable creation and issuance actions", () => {
  assert.match(renderToStaticMarkup(<FinancialAvailabilityNotice locale="en" role="admin" resource="contracts" />), /Contract creation is currently unavailable\./);
  assert.match(renderToStaticMarkup(<FinancialAvailabilityNotice locale="th" role="admin" resource="contracts" />), /ยังไม่สามารถสร้างสัญญาได้ในขณะนี้/);
  assert.match(renderToStaticMarkup(<FinancialAvailabilityNotice locale="en" role="admin" resource="documents" />), /Document issuance is currently unavailable\./);
  assert.match(renderToStaticMarkup(<FinancialAvailabilityNotice locale="th" role="admin" resource="documents" />), /ยังไม่สามารถออกเอกสารได้ในขณะนี้/);
});

test("unknown roles do not receive internal readiness details", () => {
  const html = renderToStaticMarkup(<FinancialAvailabilityNotice locale="en" role="unknown" resource="documents" />);
  assert.doesNotMatch(html, /<details|accounting|implementation/);
});

test('billing and receipts omit the unused availability notice for every viewer', () => {
  for (const resource of ['billing', 'receipts']) for (const role of ['admin', 'accountant', 'school_user']) {
    assert.equal(renderToStaticMarkup(<FinancialAvailabilityNotice locale="th" role={role} resource={resource} />), '');
  }
});
