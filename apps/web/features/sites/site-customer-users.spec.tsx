import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteCustomerUsers } from "./site-customer-users";
import { LocaleProvider } from "../../providers/locale-provider";
import { renderStatusBadge } from "../../lib/status-badge";

test("SiteCustomerUsers renders section with title and add user button without description card", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider initialLocale="th">
      <SiteCustomerUsers siteId="site-123" />
    </LocaleProvider>
  );

  assert.match(html, /ผู้ใช้งานของไซต์งาน/);
  assert.doesNotMatch(html, /บัญชีผู้ใช้งานลูกค้าสำหรับไซต์งานนี้/);
  assert.match(html, /เพิ่มผู้ใช้/);
  assert.match(html, /ค้นหาผู้ใช้งาน/);
  assert.match(html, /สถานะผู้ใช้งาน/);
});

test("SiteCustomerUsers renders English labels when locale is en", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider initialLocale="en">
      <SiteCustomerUsers siteId="site-123" />
    </LocaleProvider>
  );

  assert.match(html, /Site Users/);
  assert.doesNotMatch(html, /Customer accounts assigned to this site/);
  assert.match(html, /Add user/);
  assert.match(html, /Search users/);
  assert.match(html, /User status/);
});

test("renderStatusBadge formats invited, disabled, and active badges correctly", () => {
  const invitedTh = renderToStaticMarkup(renderStatusBadge("invited", "th"));
  assert.match(invitedTh, /รอการตอบรับ/);

  const invitedEn = renderToStaticMarkup(renderStatusBadge("invited", "en"));
  assert.match(invitedEn, /Invited/);

  const disabledTh = renderToStaticMarkup(renderStatusBadge("disabled", "th"));
  assert.match(disabledTh, /ถูกระงับ/);

  const disabledEn = renderToStaticMarkup(renderStatusBadge("disabled", "en"));
  assert.match(disabledEn, /Disabled/);

  const activeTh = renderToStaticMarkup(renderStatusBadge("active", "th"));
  assert.match(activeTh, /ใช้งานอยู่/);

  const activeEn = renderToStaticMarkup(renderStatusBadge("active", "en"));
  assert.match(activeEn, /Active/);
});
