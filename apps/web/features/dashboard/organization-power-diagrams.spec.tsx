import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { OrganizationPowerDiagramsView } from "./organization-power-diagrams";
test("each site has its own measured generation with unknown load/grid and stale readings absent", () => {
  const now = Date.parse("2026-10-08T00:00:00Z");
  const html = renderToStaticMarkup(
    <OrganizationPowerDiagramsView
      locale="en"
      now={now}
      error={false}
      sites={[
        {
          siteId: "a",
          siteName: "Site A",
          generationKw: 42,
          generationTimestamp: "2026-10-08T00:00:00Z",
        },
        {
          siteId: "b",
          siteName: "Site B",
          generationKw: 91,
          generationTimestamp: "2026-10-07T00:00:00Z",
        },
      ]}
    />,
  );
  assert.match(html, /Site A/);
  assert.match(html, /Site B/);
  assert.match(html, />42 /);
  assert.doesNotMatch(html, />91 /);
  assert.equal((html.match(/Building load/g) || []).length, 2);
  assert.match(html, /No measurements available/);
  assert.doesNotMatch(html, /Solar to building:/);
});
