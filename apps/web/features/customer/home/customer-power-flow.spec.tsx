import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CustomerPowerFlow,
  type CustomerPowerFlowMeasurements,
} from "./customer-power-flow";

const now = Date.parse("2026-10-23T08:00:00.000Z");
const fresh: CustomerPowerFlowMeasurements = {
  observedAt: "2026-10-23T07:59:30.000Z",
  solarKw: 5.2,
  loadKw: 8,
  gridImportKw: 2.8,
  gridExportKw: 0,
  solarToLoadKw: 5.2,
};

test("unavailable power flow renders Solar, centered Load and Grid as dashes without particles", () => {
  const html = renderToStaticMarkup(
    <CustomerPowerFlow locale="en" measurements={null} now={now} />,
  );

  assert.ok(html.indexOf("Solar") < html.indexOf("Load"));
  assert.ok(html.indexOf("Load") < html.indexOf("Grid"));
  assert.match(html, /Power flow is unavailable/);
  assert.equal((html.match(/data-power-value="unavailable"/g) ?? []).length, 3);
  assert.doesNotMatch(html, /data-flow-particles=/);
  assert.doesNotMatch(html, /kWh/);
});

test("fresh explicit directional power animates only verified flows into Load", () => {
  const html = renderToStaticMarkup(
    <CustomerPowerFlow locale="en" measurements={fresh} now={now} />,
  );

  assert.match(html, /5\.2/);
  assert.match(html, /8/);
  assert.match(html, /2\.8/);
  assert.match(html, /data-flow-particles="solar-load"/);
  assert.match(html, /data-flow-particles="grid-load"/);
  assert.match(html, /aria-label="Solar to Load: 5\.2 kW"/);
  assert.match(html, /aria-label="Grid to Load: 2\.8 kW"/);
});

test("fresh verified zero readings stay available without implying directional flow", () => {
  const html = renderToStaticMarkup(
    <CustomerPowerFlow
      locale="en"
      measurements={{
        ...fresh,
        solarKw: 0,
        loadKw: 0,
        gridImportKw: 0,
        gridExportKw: 0,
        solarToLoadKw: 0,
      }}
      now={now}
    />,
  );

  assert.equal((html.match(/data-power-value="available"/g) ?? []).length, 3);
  assert.match(html, />Live</);
  assert.match(html, /no active inbound flow/i);
  assert.doesNotMatch(html, /data-flow-particles=/);
  assert.doesNotMatch(html, /Power flow is unavailable/);
});

test("fresh grid export is shown instead of a zero import without animating inbound grid flow", () => {
  const html = renderToStaticMarkup(
    <CustomerPowerFlow
      locale="en"
      measurements={{
        ...fresh,
        solarKw: 2,
        loadKw: 1,
        gridImportKw: 0,
        gridExportKw: 1,
        solarToLoadKw: 1,
      }}
      now={now}
    />,
  );

  assert.match(html, /Grid export/);
  assert.match(html, /data-flow-particles="solar-load"/);
  assert.doesNotMatch(html, /data-flow-particles="grid-load"/);
});

test("stale power is hidden and never leaves moving traces", () => {
  const html = renderToStaticMarkup(
    <CustomerPowerFlow
      locale="th"
      measurements={{ ...fresh, observedAt: "2026-10-23T07:57:59.999Z" }}
      now={now}
    />,
  );

  assert.match(html, /ข้อมูลการไหลของกำลังไฟฟ้าไม่พร้อมใช้งาน/);
  assert.equal((html.match(/data-power-value="unavailable"/g) ?? []).length, 3);
  assert.doesNotMatch(html, /data-flow-particles=/);
});
