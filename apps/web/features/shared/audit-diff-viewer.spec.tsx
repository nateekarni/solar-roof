import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuditDiffViewer } from "./audit-diff-viewer";

test("AuditDiffViewer renders empty state when both before and after are empty", () => {
  const html = renderToStaticMarkup(
    <AuditDiffViewer before={null} after={null} locale="th" />
  );
  assert.ok(html.includes("ไม่มีข้อมูลการเปลี่ยนแปลงโครงสร้าง"));
  assert.ok(!html.includes("border-dashed"));

  const htmlEn = renderToStaticMarkup(
    <AuditDiffViewer before={undefined} after={undefined} locale="en" />
  );
  assert.ok(htmlEn.includes("No structured change data available"));
  assert.ok(!htmlEn.includes("border-dashed"));
});

test("AuditDiffViewer renders created badge and green plus rows when only after exists", () => {
  const html = renderToStaticMarkup(
    <AuditDiffViewer
      before={null}
      after={{ role: "operator", siteId: "site-123" }}
      locale="th"
    />
  );
  assert.ok(html.includes("+ สร้างข้อมูลใหม่"));
  assert.ok(html.includes("role:"));
  assert.ok(html.includes("operator"));
  assert.ok(html.includes("site-123"));
  assert.ok(html.includes("border-emerald-500"));
});

test("AuditDiffViewer renders deleted badge and red minus rows when only before exists", () => {
  const html = renderToStaticMarkup(
    <AuditDiffViewer
      before={{ status: "active", session: "session-abc" }}
      after={null}
      locale="th"
    />
  );
  assert.ok(html.includes("- ลบข้อมูล"));
  assert.ok(html.includes("status:"));
  assert.ok(html.includes("border-red-500"));
});

test("AuditDiffViewer renders diff with modified, added and removed fields", () => {
  const before = {
    status: "active",
    oldField: "to-remove",
    unchanged: "same",
  };
  const after = {
    status: "inactive",
    newField: "added-value",
    unchanged: "same",
  };

  const html = renderToStaticMarkup(
    <AuditDiffViewer before={before} after={after} locale="th" />
  );
  assert.ok(html.includes("แก้ไขข้อมูล"));
  assert.ok(html.includes("border-red-500"));
  assert.ok(html.includes("border-emerald-500"));
  assert.ok(html.includes("active"));
  assert.ok(html.includes("inactive"));
});
