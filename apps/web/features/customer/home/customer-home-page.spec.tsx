import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { CustomerPortalHomeResponse } from "@solar/api-contracts";
import { CustomerHomePage } from "./customer-home-page";
import { CustomerFinancialRecordPage } from "../records/customer-financial-record-page";
import { CustomerDocumentsPage } from "../documents/customer-documents-page";
import { LocaleProvider } from "../../../providers/locale-provider";

export const fixture: CustomerPortalHomeResponse = {
  range: "7d",
  site: { id: "s", name: "Campus", customerName: "School A" },
  focusedBill: {
    id: "bill-a",
    siteId: "s",
    period: "2026-10",
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    dueDate: "2026-11-10",
    invoiceId: "i",
    invoiceNumber: "INV-001",
    status: "partially_paid",
    consumedKwh: "300.50",
    rate: "3.00",
    subtotal: "900.13",
    tax: "63.01",
    billedAmount: "963.14",
    approvedAmount: "100.00",
    outstandingAmount: "863.14",
    pendingEvidenceCount: 0,
    rejectedEvidenceCount: 0,
    canPay: true,
  },
  additionalOpenBillCount: 2,
  energySeries: [{ date: "2026-10-18", value: null }],
  recentFinancialRecords: [],
  capabilities: { canPay: true, canViewDocuments: true },
};
const productionFixture = {
  date: "2026-10-23",
  timezone: "Asia/Bangkok" as const,
  source: "telemetry" as const,
  status: "partial" as const,
  site: { id: "s", name: "Campus" },
  dayTotalKwh: 18.25,
  watermark: "2026-10-23T08:00:00.000Z",
  intervals: [
    { timestamp: "2026-10-23T01:00:00.000Z", valueKwh: 3.5, status: "actual" as const },
    { timestamp: "2026-10-23T02:00:00.000Z", valueKwh: null, status: "unavailable" as const },
  ],
};
fixture.recentFinancialRecords = ["latest", "second", "third"].map((id) => ({
  ...fixture.focusedBill!,
  id,
  invoiceNumber: id,
}));
test("initial server markup follows the provider locale even when route locale props are stale", () => {
  for (const locale of ["en", "th"] as const) {
    const staleLocale = locale === "en" ? "th" : "en";
    const html = renderToStaticMarkup(
      <LocaleProvider initialLocale={locale}>
        <CustomerHomePage
          initial={{ status: "ready", data: fixture }}
          locale={staleLocale}
        />
        <CustomerDocumentsPage
          initial={null}
          initialQuery=""
          capabilities={null}
          locale={staleLocale}
        />
        <CustomerFinancialRecordPage
          row={{ id: "legacy" }}
          capabilities={null}
          locale={staleLocale}
        />
      </LocaleProvider>,
    );
    for (const text of locale === "en"
      ? ["Amount due", "Search documents", "Financial record"]
      : ["ยอดที่ต้องชำระ", "ค้นหาเอกสาร", "รายการทางการเงิน"])
      assert.ok(html.includes(text), text);
    assert.doesNotMatch(
      html,
      locale === "en"
        ? /ยอดที่ต้องชำระ|ค้นหาเอกสาร|รายการทางการเงิน/
        : /Amount due|Search documents|Financial record/,
    );
  }
});
test("compact home omits unavailable legacy subtotal/tax while record keeps the persisted detail", () => {
  for (const [locale, unavailable] of [
    ["en", "Unavailable"],
    ["th", "ไม่พร้อมใช้งาน"],
  ] as const) {
    const home = renderToStaticMarkup(
      <CustomerHomePage
        initial={{
          status: "ready",
          data: {
            ...fixture,
            focusedBill: { ...fixture.focusedBill!, subtotal: null, tax: null },
            recentFinancialRecords: [],
          },
        }}
        locale={locale}
      />,
    );
    const detail = renderToStaticMarkup(
      <CustomerFinancialRecordPage
        row={{
          ...fixture.focusedBill!,
          subtotal: null,
          simulatedTax: null,
          amount: "963.14",
          billingStatusView: "partially_paid",
        }}
        locale={locale}
        capabilities={null}
      />,
    );
    assert.doesNotMatch(home, /Subtotal|Tax|ยอดก่อนภาษี|ภาษี/);
    assert.match(home, /963\.14/);
    assert.equal(
      (detail.match(new RegExp(`<dd[^>]*>${unavailable}\\s*</dd>`, "g")) ?? []).length,
      2,
    );
    assert.match(detail, /963\.14/);
    assert.doesNotMatch(detail, new RegExp(`${unavailable}(?:<!-- -->)?\\s*(?:THB|บาท)`));
  }
});
test("compact bill precedes monitoring and keeps the full record reachable", () => {
  const html = renderToStaticMarkup(
    <CustomerHomePage
      initial={{ status: "ready", data: fixture }}
      locale="en"
    />,
  );
  assert.ok(html.indexOf("Amount due") < html.indexOf("Energy production"));
  assert.ok(
    html.indexOf("Energy production") <
      html.indexOf("Recent financial records"),
  );
  assert.equal((html.match(/data-bill-summary-row=/g) ?? []).length, 4);
  for (const value of [
    "Billed amount",
    "963.14",
    "863.14",
    "Due date",
    "Partially paid",
    "2 more open bills",
    "View all documents",
  ])
    assert.ok(html.includes(value), value);
  assert.match(html, /Subtotal/);
  assert.match(html, /Tax/);
  assert.match(html, /Rate 3/);
  assert.match(html, /href="\/records\/billing\/bill-a/);
  assert.equal((html.match(/data-financial-record=/g) ?? []).length, 3);
  assert.match(html, /data-state="active"/);
});

test("bill and compact record actions keep the payment action last", () => {
  const html = renderToStaticMarkup(
    <CustomerHomePage
      initial={{ status: "ready", data: fixture }}
      locale="en"
    />,
  ).replaceAll("<!-- -->", "");
  assert.match(
    html,
    /data-current-bill-actions="true"/,
  );
  assert.equal((html.match(/data-record-actions="true"/g) ?? []).length, 3);
  assert.match(
    html,
    /data-record-actions="true"[^>]*class="[^"]*justify-end/,
  );
  assert.match(html, />View details<.*>Pay</s);
  assert.doesNotMatch(html, /Submit payment evidence/);
});
test("recent records use compact document rows with a visible file icon", () => {
  const html = renderToStaticMarkup(
    <CustomerHomePage
      initial={{ status: "ready", data: fixture }}
      locale="en"
    />,
  ).replaceAll("<!-- -->", "");
  assert.match(
    html,
    /data-record-header="true"[^>]*>.*<h3[^>]*>latest<\/h3>.*October 2026.*Partially paid/s,
  );
  assert.match(html, /data-financial-record-list="compact"/);
  assert.match(html, /lucide-file-text/);
});
test("no open bill, no site and unavailable overview remain distinct", () => {
  const render = (data: CustomerPortalHomeResponse) =>
    renderToStaticMarkup(
      <CustomerHomePage initial={{ status: "ready", data }} locale="en" />,
    );
  const paid = {
    ...fixture,
    focusedBill: null,
    additionalOpenBillCount: 0,
    recentFinancialRecords: fixture.recentFinancialRecords.map((record) => ({
      ...record,
      status: "paid" as const,
      canPay: false,
    })),
  };
  assert.doesNotMatch(render(paid), /Current bill|You are paid up to date|No open bill/);
  assert.match(render(paid), /Power flow is unavailable/);
  assert.doesNotMatch(render(paid), />Pay</);
  assert.match(
    render({ ...fixture, site: null, focusedBill: null }),
    /No site is assigned/,
  );
  const error = renderToStaticMarkup(
    <CustomerHomePage initial={{ status: "unavailable" }} locale="en" />,
  );
  assert.match(error, /overview is unavailable/);
  assert.match(error, /Try again/);
  assert.doesNotMatch(error, /paid up to date/);
});
test("unknown energy is unavailable, measured zero is valid, and Thai labels are translated", () => {
  const html = renderToStaticMarkup(
    <CustomerHomePage
      initial={{ status: "ready", data: fixture }}
      locale="en"
    />,
  );
  assert.match(html, /Energy data is unavailable/);
  const zero = renderToStaticMarkup(
    <CustomerHomePage
      initial={{
        status: "ready",
        data: { ...fixture, energySeries: [{ date: "2026-10-18", value: 0 }] },
      }}
      locale="en"
    />,
  );
  assert.doesNotMatch(zero, /Energy data is unavailable/);
  const thai = renderToStaticMarkup(
    <CustomerHomePage
      initial={{ status: "ready", data: fixture }}
      locale="th"
    />,
  );
  assert.doesNotMatch(
    thai,
    /Amount due|Subtotal|View all documents|Partially paid/,
  );
  assert.match(thai, /ยอด|ภาษี/);
});
test("server payment capability and bill eligibility both gate the payment action", () => {
  const html = renderToStaticMarkup(
    <CustomerHomePage
      initial={{
        status: "ready",
        data: {
          ...fixture,
          capabilities: { ...fixture.capabilities, canPay: false },
        },
      }}
      locale="en"
    />,
  );
  assert.doesNotMatch(html, />Pay</);
});

test("dashboard keeps the date in its heading and orders bill, flow, production, trend and documents", () => {
  const html = renderToStaticMarkup(
    <CustomerHomePage
      initial={{
        status: "ready",
        data: { ...fixture, energySeries: [{ date: "2026-10-23", value: 4.25 }] },
      }}
      production={productionFixture}
      locale="en"
    />,
  );
  assert.ok(html.indexOf("Dashboard") < html.indexOf("Amount due"));
  assert.ok(html.indexOf("Amount due") < html.indexOf("Power flow right now"));
  assert.ok(html.indexOf("Power flow right now") < html.indexOf("Production overview"));
  assert.ok(html.indexOf("Production overview") < html.indexOf("Energy production"));
  assert.ok(html.indexOf("Energy production") < html.indexOf("Recent financial records"));
  assert.match(html, /aria-label="Select production date"/);
  assert.match(html, /Power flow is unavailable/);
  assert.doesNotMatch(html, /data-flow-particles=/);
  assert.match(html, /data-slot="tabs"/);
  assert.equal((html.match(/data-slot="tabs-trigger"/g) ?? []).length, 2);
  assert.match(html, /View hourly readings/);
  assert.equal((html.match(/data-slot="dialog-trigger"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /<(?:details|summary)\b/);
  assert.match(html, /data-customer-dashboard-board="true"/);
  for (const area of ["header", "bill", "flow", "production", "trend", "records"])
    assert.match(html, new RegExp(`data-dashboard-area="${area}"`));
});
