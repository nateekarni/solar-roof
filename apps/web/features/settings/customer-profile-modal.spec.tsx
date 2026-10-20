import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CustomerProfileModal } from "./customer-profile-modal";
import { LocaleProvider } from "../../providers/locale-provider";

test("CustomerProfileModal renders edit profile inputs and avatar upload trigger", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider initialLocale="th">
      <CustomerProfileModal inline open={true} onOpenChange={() => {}} />
    </LocaleProvider>,
  );

  assert.ok(html.includes("แก้ไขโปรไฟล์"));
  assert.ok(html.includes("ชื่อที่แสดง"));
  assert.ok(html.includes("อีเมลเข้าสู่ระบบ"));
  assert.ok(html.includes("เลือกรูปภาพใหม่"));
  assert.doesNotMatch(html, /เบอร์โทรศัพท์/);
});

test("CustomerProfileModal exposes phone editing only when requested by the customer portal", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider initialLocale="th">
      <CustomerProfileModal inline open={true} showPhone onOpenChange={() => {}} />
    </LocaleProvider>,
  );

  assert.match(html, /เบอร์โทรศัพท์/);
  assert.match(html, /type="tel"/);
});
