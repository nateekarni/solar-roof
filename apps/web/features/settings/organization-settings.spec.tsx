import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { validateOrganizationPassword } from "./organization-settings-model";
import AccountSettingsPage from '../../app/(app)/settings/account/page';
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
