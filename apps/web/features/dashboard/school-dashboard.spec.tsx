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
test("Organization Home converts actual power and retains real organization name and unknown daily readings", () => {
  const html = renderToStaticMarkup(
    <SchoolDashboard data={data} locale="en" />,
  );
  assert.doesNotMatch(html, /42.8/);
  assert.match(html, /School A/);
  assert.match(html, /Unavailable/);
  assert.match(html, /Power by site/);
  assert.doesNotMatch(html, /Latest invoice|school’s|Gateway/);
});
test("Home lists all outstanding evidence states while excluding paid invoices", () => {
  const html = renderToStaticMarkup(
    <SchoolDashboard
      data={data}
      locale="en"
      todayKwh={196.4}
      monthKwh={1234}
      invoices={[
        {
          id: "pending",
          amount: 5600,
          status: "pending_verification",
          paymentStatus: "pending_verification",
        },
        {
          id: "rejected",
          amount: "",
          status: "issued",
          paymentStatus: "rejected",
        },
        { id: "paid", status: "paid" },
      ]}
    />,
  );
  assert.match(html, /196.4/);
  assert.match(html, /1,234/);
  assert.match(html, /Awaiting verification/);
  assert.match(html, /Please review payment proof/);
  assert.match(html, /\/records\/billing\/pending/);
  assert.match(html, /\/records\/billing\/rejected/);
  assert.doesNotMatch(html, /\/records\/billing\/paid/);
});
test("billing failure is distinct from an empty result and incomplete pages are explicit", () => {
  const failed = renderToStaticMarkup(
    <SchoolDashboard data={data} locale="en" billingUnavailable />,
  );
  assert.match(failed, /Billing is unavailable/);
  assert.doesNotMatch(failed, /No outstanding invoices/);
  const partial = renderToStaticMarkup(
    <SchoolDashboard data={data} locale="en" billingHasMore />,
  );
  assert.match(partial, /More invoices may be available/);
  assert.match(partial, /See all documents/);
});
test("missing power is unavailable and measured zero remains valid", () => {
  const missing = renderToStaticMarkup(
    <SchoolDashboard
      data={{ ...data, stats: { ...data.stats, currentMw: null } }}
      locale="en"
    />,
  );
  assert.doesNotMatch(missing, /42.8/);
  assert.match(missing, /Unavailable/);
  const zero = renderToStaticMarkup(
    <SchoolDashboard
      data={{ ...data, stats: { ...data.stats, currentMw: 0, periodKwh: 0 } }}
      locale="en"
    />,
  );
  assert.match(zero, />0 <span[^>]*>kWh/);
});

test("Home never labels generic summary meter power as solar generation", () => {
  const html = renderToStaticMarkup(
    <SchoolDashboard data={data} locale="en" />,
  );
  assert.doesNotMatch(html, /Solar power now/);
});

test("Home invoice title fallback localizes its billing month for each locale", () => {
  const props = {
    data,
    invoices: [{ id: "month", period: "2026-10", status: "issued" }],
  };
  assert.match(
    renderToStaticMarkup(<SchoolDashboard {...props} locale="th" />),
    /ตุลาคม 2569/,
  );
  assert.match(
    renderToStaticMarkup(<SchoolDashboard {...props} locale="en" />),
    /October 2026/,
  );
});
