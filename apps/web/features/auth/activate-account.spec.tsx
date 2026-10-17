import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActivateAccount } from './activate-account';

test('ActivateAccount renders prompt when accessed without invitation token', () => {
  const html = renderToStaticMarkup(<ActivateAccount initialReady={true} />);
  assert.match(html, /กรุณาเปิดลิงก์จากอีเมลคำเชิญเพื่อเปิดใช้งานบัญชี/);
  assert.match(html, /Please open the link provided in your invitation email/);
});

test('ActivateAccount renders form with display name, avatar upload, and password fields', () => {
  const html = renderToStaticMarkup(<ActivateAccount initialToken="valid-token-for-testing" />);
  assert.match(html, /เปิดใช้งานบัญชีผู้ใช้ \/ Activate Account/);
  assert.match(html, /รูปโปรไฟล์ \/ Profile Avatar/);
  assert.match(html, /ชื่อ-นามสกุล \/ Display Name/);
  assert.match(html, /รหัสผ่านใหม่ \/ New Password/);
  assert.match(html, /ยืนยันรหัสผ่านใหม่ \/ Confirm New Password/);
});
