import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { DashboardSummaryResponse } from "@solar/api-contracts";
import { SchoolDashboard } from "./school-dashboard";
const data: DashboardSummaryResponse = {
  range: { start: "2026-10-01", end: "2026-10-06" },
  availableSites: [],
  sites: [
    {
      id: "s",
      name: "Campus",
      schoolName: "School A",
      latitude: null,
      longitude: null,
      status: "online",
      capacityMwp: 1,
      productionKwh: null,
    },
  ],
  stats: {
    totalSites: 1,
    onlineSites: 1,
    installedMwp: 1,
    currentMw: 0.0428,
    periodKwh: 1234,
    periodAmount: 5600,
    billCount: 1,
    paidBillCount: 0,
  },
  production: [],
  revenue: [],
  rankings: [],
  alerts: [],
  collection: { total: 1, paid: 0, pending: 1, paidPercent: 0 },
};
test("school vector scene converts actual MW to kW and keeps unknown daily energy and invoice absent", () => {
  const html = renderToStaticMarkup(
    <SchoolDashboard data={data} locale="en" />,
  );
  assert.match(html, /<svg/);
  assert.match(html, /42.8/);
  assert.match(html, /kW/);
  assert.match(html, /School A/);
  assert.match(html, /Unavailable/);
  assert.match(html, /No billing records/);
  assert.doesNotMatch(html, /5,600|196.4|<img|Gateway|battery|grid export/);
});
test("school summary uses independently measured daily and monthly values and actual latest bill", () => {
  const html = renderToStaticMarkup(
    <SchoolDashboard
      data={data}
      locale="en"
      todayKwh={196.4}
      monthKwh={1234}
      invoice={{
        id: "bill-1",
        amount: "5600",
        period: "2026-10",
        status: "paid",
        paymentStatus: "paid",
      }}
    />,
  );
  assert.match(html, /196.4/);
  assert.match(html, /1,234/);
  assert.match(html, /5,600/);
  assert.match(html, /\/records\/billing\/bill-1/);
  assert.doesNotMatch(html, /15 October|42.8 kW.*school consumption/);
});
test("unknown power does not imply live generation or zero and measured zero remains valid", () => {
  const html = renderToStaticMarkup(
    <SchoolDashboard
      data={{ ...data, stats: { ...data.stats, currentMw: null } }}
      locale="en"
    />,
  );
  assert.match(html, /No recent production reading/);
  assert.doesNotMatch(html, /42.8|Producing solar power/);
  const zero = renderToStaticMarkup(
    <SchoolDashboard
      data={{ ...data, stats: { ...data.stats, currentMw: 0 } }}
      locale="en"
    />,
  );
  assert.match(zero, /No power being generated/);
});

test("payment proof awaiting verification is not reported as paid and blank amounts remain unknown", () => {
  const html = renderToStaticMarkup(
    <SchoolDashboard
      data={data}
      locale="en"
      invoice={{
        id: "pending",
        amount: "",
        status: "pending_verification",
        paymentStatus: "pending_verification",
      }}
    />,
  );
  assert.match(html, /Awaiting verification/);
  assert.match(html, /Unavailable/);
  assert.doesNotMatch(html, />Paid<|>0 <|>Awaiting payment</);
});

test("billing service failure is distinguished from no invoices", () => {
  const html = renderToStaticMarkup(
    <SchoolDashboard data={data} locale="en" billingUnavailable />,
  );
  assert.match(html, /Billing is unavailable/);
  assert.doesNotMatch(html, /No billing records/);
});

test("invoice status appears in its header and review is the current step after proof submission", () => {
  const html = renderToStaticMarkup(
    <SchoolDashboard
      data={data}
      locale="en"
      invoice={{
        id: "pending",
        amount: 5600,
        status: "pending_verification",
        paymentStatus: "pending_verification",
      }}
    />,
  );
  const titleAt = html.indexOf("Latest invoice");
  const header = html.slice(
    titleAt,
    html.indexOf('data-slot="card-content"', titleAt),
  );
  assert.match(header, /Awaiting verification/);
  assert.match(html, /aria-label="Payment steps"/);
  assert.match(html, /aria-current="step"[^]*Awaiting verification/);
});

test("schools without bills can still see the payment flow without an active or completed step", () => {
  const html = renderToStaticMarkup(
    <SchoolDashboard data={data} locale="en" />,
  );
  assert.match(html, /aria-label="Payment steps"/);
  assert.match(html, /Review invoice/);
  assert.match(html, /Upload proof/);
  assert.match(html, /Awaiting verification/);
  assert.doesNotMatch(html, /aria-current="step"|data-state="complete"/);
});
