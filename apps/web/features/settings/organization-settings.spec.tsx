import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { CustomerSettingsView } from "./customer-settings-view";
import { validateOrganizationPassword } from "./organization-settings-model";
import AccountSettingsPage from '../../app/(app)/settings/account/page';
test("settings keeps organization legal records read only and exposes account editing", () => {
  const html = renderToStaticMarkup(<CustomerSettingsView />);
  assert.match(html, /ข้อมูลลูกค้าสำหรับเอกสาร|Customer document information/);
  assert.doesNotMatch(html, /PPA Agreement/);
});

test("customer settings points to the merged account without duplicate profile or security forms", () => {
  const html = renderToStaticMarkup(<CustomerSettingsView />);
  assert.match(html,/href="\/settings\/account"/);
  assert.doesNotMatch(html,/type="password"|id="own-display-name"|id="organization-theme"/);
});
test('My Account starts with display values and separate accessible edit controls',()=>{
 const html=renderToStaticMarkup(<AccountSettingsPage/>);
 for(const text of ['บัญชีของฉัน','โปรไฟล์ของคุณ','แก้ไขโปรไฟล์','เลือกภาษา','เลือกธีม','เปลี่ยนรหัสผ่าน','ลืมรหัสผ่าน','เปลี่ยนรูปโปรไฟล์','บัญชีที่เชื่อมต่อ']){
  assert.ok(html.includes(text),`Missing account control ${text}`);
 }
 assert.doesNotMatch(html,/type="password"|id="own-display-name"|device session|ยังไม่รองรับ/);
});
test("password validation is localized and rejects mismatch before submission", () => {
  assert.equal(
    validateOrganizationPassword("short", "short", "en"),
    "New password must contain between 12 and 128 characters.",
  );
  assert.equal(
    validateOrganizationPassword("abcdefghijkl", "mnopqrstuvwx", "en"),
    "Passwords do not match.",
  );
  assert.match(
    validateOrganizationPassword("short", "short", "th") ?? "",
    /12/,
  );
  assert.equal(
    validateOrganizationPassword("abcdefghijkl", "abcdefghijkl", "en"),
    null,
  );
});

test("Settings actions pair semantic filled surfaces with their foreground tokens", () => {
  const html = renderToStaticMarkup(<CustomerSettingsView />);
  assert.match(
    html,
    /<a(?=[^>]*href="\/settings\/account")(?=[^>]*class="[^"]*text-primary)[^>]*>/,
  );
  assert.match(
    html,
    /data-variant="destructive"[^>]*class="[^"]*bg-destructive[^"]*text-destructive-foreground/,
  );
});

test("Filled signout retains its semantic background in dark mode", () => {
  const html = renderToStaticMarkup(<CustomerSettingsView />);
  assert.doesNotMatch(html, /dark:bg-destructive\/20/);
});
