import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CustomerSettingsView } from './customer-settings-view';
import { CustomerProfileModal } from './customer-profile-modal';
import { LocaleProvider } from '../../providers/locale-provider';

test('CustomerSettingsView renders frameless layout with avatar and without redundant sign out button', () => {
  const html = renderToStaticMarkup(
    <LocaleProvider initialLocale="th">
      <CustomerSettingsView />
    </LocaleProvider>
  );

  // Main page title
  assert.ok(html.includes('ข้อมูลองค์กรและบัญชี'));

  // Section 1: Legal Organization & Tax Info (Frameless with Notice)
  assert.ok(html.includes('ข้อมูลนิติบุคคลสำหรับเอกสาร'));
  assert.ok(html.includes('ข้อมูลนิติบุคคลเป็นข้อมูลตามสัญญาทางกฎหมาย'));
  // Stray "เปิดเอกสาร" link eliminated
  assert.ok(!html.includes('เปิดเอกสาร'));

  // Section 2: User Account Profile with Edit Profile modal button
  assert.ok(html.includes('บัญชีผู้ใช้งานของฉัน'));
  assert.ok(html.includes('ผู้ใช้งานองค์กรลูกค้า'));
  assert.ok(html.includes('แก้ไขโปรไฟล์'));

  // Section 3: Notifications with Switch toggles
  assert.ok(html.includes('การรับเอกสารและการแจ้งเตือน'));
  assert.ok(html.includes('data-slot="switch"') || html.includes('role="switch"'));

  // Sign out button removed from page (delegated to profile popover)
  assert.ok(!html.includes('ออกจากระบบ'));
});

test('CustomerSettingsView renders English text when locale is en', () => {
  const html = renderToStaticMarkup(
    <LocaleProvider initialLocale="en">
      <CustomerSettingsView />
    </LocaleProvider>
  );

  assert.ok(html.includes('Organization &amp; Account') || html.includes('Organization & Account'));
  assert.ok(html.includes('Legal Organization &amp; Tax Info') || html.includes('Legal Organization & Tax Info'));
  assert.ok(html.includes('My Account Profile'));
  assert.ok(html.includes('Customer Organization User'));
  assert.ok(html.includes('Edit Profile'));
  assert.ok(!html.includes('Sign out'));
});

test('CustomerProfileModal renders edit profile inputs and avatar upload trigger', () => {
  const html = renderToStaticMarkup(
    <LocaleProvider initialLocale="th">
      <CustomerProfileModal inline open={true} onOpenChange={() => {}} />
    </LocaleProvider>
  );

  assert.ok(html.includes('แก้ไขโปรไฟล์'));
  assert.ok(html.includes('ชื่อที่แสดง'));
  assert.ok(html.includes('อีเมลเข้าสู่ระบบ'));
  assert.ok(html.includes('เลือกรูปภาพใหม่'));
});
