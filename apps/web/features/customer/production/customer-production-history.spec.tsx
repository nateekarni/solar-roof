import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CustomerProductionHistory, productionDateBounds } from "./customer-production-history";

const initial = {
  date: "2026-10-23",
  timezone: "Asia/Bangkok" as const,
  source: "telemetry" as const,
  status: "partial" as const,
  site: { id: "site-a", name: "Campus roof" },
  dayTotalKwh: 18.25,
  watermark: "2026-10-23T08:00:00.000Z",
  intervals: [
    { timestamp: "2026-10-23T01:00:00.000Z", valueKwh: 3.5, status: "actual" as const },
    { timestamp: "2026-10-23T02:00:00.000Z", valueKwh: null, status: "unavailable" as const },
    { timestamp: "2026-10-23T03:00:00.000Z", valueKwh: 1.5e-15, status: "actual" as const },
  ],
};

test("production date bounds cover the current and previous five Bangkok calendar months", () => {
  assert.deepEqual(productionDateBounds(new Date("2026-10-23T08:00:00.000Z")), {
    min: "2026-05-01",
    max: "2026-10-23",
  });
});

test("production overview uses measured KPI rows, a composed chart and a readings dialog without disclosure toggles", () => {
  const html = renderToStaticMarkup(<CustomerProductionHistory initial={initial} locale="en" customerName="School A" />);
  assert.match(html, /<h1[^>]*>Dashboard<\/h1>/);
  assert.match(html, /id="production"/);
  assert.match(html, /Asia\/Bangkok · Telemetry source/);
  assert.match(html, /aria-label="Select production date"/);
  assert.match(html, /data-slot="popover-trigger"/);
  assert.match(html, /data-slot="badge"/);
  assert.match(html, /data-slot="dialog-trigger"/);
  assert.match(html, /data-production-kpis="open"/);
  assert.equal((html.match(/data-production-kpi=/g) ?? []).length, 3);
  assert.match(html, /data-customer-hourly-chart="composed"/);
  assert.doesNotMatch(html, /data-production-outer-card/);
  assert.doesNotMatch(html, /type="date"/);
  assert.doesNotMatch(html, /<(?:details|summary)\b/);
  assert.ok(html.indexOf("Recorded energy for selected day") < html.indexOf("Hourly trend"));
  assert.ok(html.indexOf("Hourly trend") < html.indexOf("View hourly readings"));
  assert.match(html, /Partial actual data/);
  assert.match(html, /0\.00.*kWh/);
  assert.doesNotMatch(html, /Unavailable kWh/);
  assert.match(html, /Missing readings are never estimated/);
  assert.doesNotMatch(html, /Estimated|Forecast/);
});

test("missing hourly readings stay empty instead of becoming zero-value bars", () => {
  const html = renderToStaticMarkup(<CustomerProductionHistory initial={{
    ...initial,
    dayTotalKwh: null,
    intervals: initial.intervals.map((point) => ({ ...point, valueKwh: null, status: "unavailable" as const })),
  }} locale="en" />);
  assert.doesNotMatch(html, /data-customer-hourly-chart="composed"/);
  assert.match(html, /No production data for the selected date/);
  assert.match(html, /data-production-kpi="peak-interval"/);
});

test("production overview keeps the dashboard available when telemetry is unavailable", () => {
  const html = renderToStaticMarkup(<CustomerProductionHistory initial={null} locale="en" customerName="School A" />);
  assert.match(html, /<h1[^>]*>Dashboard<\/h1>/);
  assert.match(html, /Production data is unavailable/);
  assert.match(html, /aria-label="Select production date"/);
});
