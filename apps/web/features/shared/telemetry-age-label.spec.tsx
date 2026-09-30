import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { TelemetryAgeLabel } from "./telemetry-age-label";

for (const compact of [false, true]) {
  test(`telemetry ${compact ? "card" : "table"} initial markup is stable across clock and freshness boundaries`, () => {
    const originalNow = Date.now;
    const render = () => renderToString(React.createElement(TelemetryAgeLabel, {
      value: "2026-01-01T00:00:00Z", locale: "en", compact,
    }));
    try {
      Date.now = () => Date.parse("2026-01-01T00:00:01Z");
      const serverMarkup = render();
      Date.now = () => Date.parse("2026-01-01T00:02:01Z");
      assert.equal(render(), serverMarkup);
      assert.doesNotMatch(serverMarkup, /Offline|animate-pulse/);
    } finally {
      Date.now = originalNow;
    }
  });
}
