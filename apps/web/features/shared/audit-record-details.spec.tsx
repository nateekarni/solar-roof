import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuditRecordDetails } from "./audit-record-details";

test("AuditRecordDetails renders localized action badge, actor, entity type and diff viewer", () => {
  const row = {
    id: "30a73cb8-00c2-4c79-a879-125fbd7d3165",
    time: "2026-10-16T07:13:00.000Z",
    action: "technical.employee.deactivated",
    entityType: "employee_permission",
    entityId: "6a0ddbbf-7a8a-4bcb-bd75-f31c97ea2f50",
    actor: "Platform Administrator",
    correlationId: "cf5534c1-c4c3-4418-a955-3e07605642c1",
    reason: "Deactivated on user request",
    beforeJson: { status: "active", activeSessions: 2 },
    afterJson: { status: "inactive", sessionsRevoked: 2 },
  };

  const html = renderToStaticMarkup(<AuditRecordDetails row={row} locale="th" />);

  // Check Thai localization
  assert.ok(html.includes("ระงับการใช้งานพนักงาน"));
  assert.ok(html.includes("สิทธิ์พนักงาน"));
  assert.ok(html.includes("ผู้ดูแลระบบแพลตฟอร์ม"));
  assert.ok(html.includes("การเปลี่ยนแปลงข้อมูล (Changes)"));
  assert.ok(html.includes("Deactivated on user request"));

  // Check diff rendering
  assert.ok(html.includes("status:"));
  assert.ok(html.includes("active"));
  assert.ok(html.includes("inactive"));
  assert.ok(html.includes("py-3.5 [.border-b]:pb-3.5 border-b border-border/60"));
});

test("AuditRecordDetails renders English labels when locale is en", () => {
  const row = {
    id: "30a73cb8-00c2-4c79-a879-125fbd7d3165",
    time: "2026-10-16T07:13:00.000Z",
    action: "technical.employee.deactivated",
    entityType: "employee_permission",
    entityId: "6a0ddbbf-7a8a-4bcb-bd75-f31c97ea2f50",
    actor: "Platform Administrator",
    correlationId: "cf5534c1-c4c3-4418-a955-3e07605642c1",
    beforeJson: null,
    afterJson: null,
  };

  const html = renderToStaticMarkup(<AuditRecordDetails row={row} locale="en" />);

  assert.ok(html.includes("Deactivate employee"));
  assert.ok(html.includes("Employee permission"));
  assert.ok(html.includes("Platform Administrator"));
  assert.ok(html.includes("Log ID:"));
  assert.ok(html.includes("Resource Type"));
  assert.ok(html.includes("Changes"));
});
