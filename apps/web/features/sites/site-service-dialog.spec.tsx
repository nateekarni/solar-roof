import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteServiceDialog, SiteBillingSettings } from './site-service-dialog';

test('SiteServiceDialog renders 3 tabs for site, customer, and billing setup', () => {
  const html = renderToStaticMarkup(
    <SiteServiceDialog inline={true} open={true} onOpenChange={() => {}} />
  );

  // Dialog Header
  assert.match(html, /เพิ่มไซต์งาน/);
  assert.match(html, /กรอกข้อมูลไซต์งาน ข้อมูลลูกค้า และตั้งค่าบริการเพื่อเริ่มใช้งานได้ทันที/);

  // 3 Tabs present in tab list
  assert.match(html, /role="tablist"/);
  assert.match(html, /ข้อมูลไซต์งาน/);
  assert.match(html, /ข้อมูลลูกค้า/);
  assert.match(html, /ตั้งค่าบริการ/);

  // Pill styling classes
  assert.match(html, /data-\[state=active\]:bg-primary/);

  // Tab 1 initial inputs
  assert.match(html, /id="service-site-name"/);
  assert.match(html, /id="service-capacity"/);
  assert.match(html, /id="service-latitude"/);
  assert.match(html, /id="service-longitude"/);

  // Legends removed
  assert.doesNotMatch(html, /<legend/);

  // Stepper footer buttons
  assert.match(html, />ยกเลิก<\/button>/);
  assert.match(html, />ถัดไป<\/button>/);
});

test('SiteBillingSettings renders loading state initially', () => {
  const html = renderToStaticMarkup(<SiteBillingSettings siteId="site-123" />);
  assert.match(html, /การเรียกเก็บเงินของไซต์งาน/);
  assert.match(html, /กำลังโหลดการตั้งค่า…/);
});
