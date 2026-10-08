import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { SchoolDashboard } from "./school-dashboard";
import type { DashboardSummaryResponse } from "@solar/api-contracts";
const data: DashboardSummaryResponse = {
  range: { start: "2026-10-01", end: "2026-10-08" },
  availableSites: [],
  sites: [],
  stats: {
    totalSites: 0,
    onlineSites: 0,
    installedMwp: 0,
    currentMw: null,
    periodKwh: 123,
    periodAmount: 50,
    billCount: 1,
    paidBillCount: 0,
  },
  production: [],
  revenue: [],
  rankings: [],
  alerts: [],
  collection: { total: 1, paid: 0, pending: 1, paidPercent: 0 },
};
test("Home identifies unpaid invoices as a list and keeps totals independent of latest bill", () => {
  const html = renderToStaticMarkup(
    <SchoolDashboard data={data} locale="en" />,
  );
  assert.match(html, /Outstanding invoices/);
  assert.match(html, /Generated energy/);
  assert.match(html, /123/);
  assert.doesNotMatch(html, /Latest invoice|school’s|School documents/);
});
