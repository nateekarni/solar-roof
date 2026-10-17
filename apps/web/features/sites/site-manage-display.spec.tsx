import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteBillingDisplayCard } from './site-billing-display-card';
import { SiteDetailTabs } from './site-detail-tabs';
import { SiteManageModal, SiteManageHeaderButton } from './site-manage-modal';

test('SiteBillingDisplayCard renders read-only display card without submit forms', () => {
  const html = renderToStaticMarkup(<SiteBillingDisplayCard siteId="site-123" />);
  assert.match(html, /การเรียกเก็บเงินของไซต์งาน/);
  // Initial loading state or card container
  assert.doesNotMatch(html, /<form/);
  assert.doesNotMatch(html, /type="submit"/);
});

test('SiteDetailTabs renders direct children without tabs container when canManageUsers is false', () => {
  const html = renderToStaticMarkup(
    <SiteDetailTabs siteId="site-123" canManageUsers={false}>
      <div id="test-child">Child Content</div>
    </SiteDetailTabs>
  );
  // Must render child directly
  assert.match(html, /id="test-child"/);
  assert.match(html, /Child Content/);
  // Must NOT render any tab list or tab triggers (eliminating single orange button)
  assert.doesNotMatch(html, /role="tablist"/);
  assert.doesNotMatch(html, /role="tab"/);
  assert.doesNotMatch(html, /จัดการข้อมูล/);
});

test('SiteDetailTabs renders compact tabs for site overview and manage users when canManageUsers is true', () => {
  const html = renderToStaticMarkup(
    <SiteDetailTabs siteId="site-123" canManageUsers={true}>
      <div id="test-child">Site Data</div>
    </SiteDetailTabs>
  );
  assert.match(html, /role="tablist"/);
  assert.match(html, /ข้อมูลไซต์งาน/);
  assert.match(html, /จัดการผู้ใช้งาน/);
  assert.doesNotMatch(html, />จัดการข้อมูล</);
});

test('SiteManageHeaderButton renders right-aligned manage details button', () => {
  const html = renderToStaticMarkup(<SiteManageHeaderButton siteId="site-123" />);
  assert.match(html, /<button[^>]*type="button"/);
  assert.match(html, /จัดการข้อมูล/);
});

test('SiteManageModal renders 3-tab stepper dialog with full placeholders matching site creation modal', () => {
  const htmlGeneral = renderToStaticMarkup(
    <SiteManageModal inline={true} open={true} onOpenChange={() => {}} siteId="site-123" />
  );
  // Modal title & description
  assert.match(htmlGeneral, /จัดการข้อมูลไซต์งาน/);
  assert.match(htmlGeneral, /แก้ไขข้อมูลไซต์งาน ข้อมูลลูกค้า และตั้งค่าบริการเพื่ออัปเดตระบบทันที/);

  // Tabs structure: 3 tabs matching SiteServiceDialog
  assert.match(htmlGeneral, /ข้อมูลไซต์งาน/);
  assert.match(htmlGeneral, /ข้อมูลลูกค้า/);
  assert.match(htmlGeneral, /ตั้งค่าบริการ/);
  assert.match(htmlGeneral, /flex-1 justify-center px-3.5 py-2 rounded-lg border border-border bg-card/);

  // Tab 1 Decoupled buttons: NO type="submit", renders "ยกเลิก" and "ถัดไป"
  assert.doesNotMatch(htmlGeneral, /type="submit"/);
  assert.match(htmlGeneral, /type="button"[^>]*>ยกเลิก<\/button>/);
  assert.match(htmlGeneral, /type="button"[^>]*>ถัดไป<\/button>/);
  assert.doesNotMatch(htmlGeneral, />ย้อนกลับ<\/button>/);

  // Verify placeholders exist for key inputs in Tab 1
  assert.match(htmlGeneral, /placeholder="เช่น อาคารสำนักงาน A"/);
  assert.match(htmlGeneral, /placeholder="เช่น 0.25"/);
  assert.match(htmlGeneral, /placeholder="เช่น 13.7563"/);
  assert.match(htmlGeneral, /placeholder="เช่น 100.5018"/);

  // Tab 2: Customer tab placeholders
  const htmlCustomer = renderToStaticMarkup(
    <SiteManageModal inline={true} initialTab="customer" open={true} onOpenChange={() => {}} siteId="site-123" />
  );
  assert.match(htmlCustomer, /placeholder="เช่น บริษัท แสงอาทิตย์"/);
  assert.match(htmlCustomer, /placeholder="เลขประจำตัวผู้เสียภาษี 13 หลัก"/);
  assert.match(htmlCustomer, /placeholder="เช่น 00000 \(สำนักงานใหญ่\)"/);
  assert.match(htmlCustomer, /placeholder="เช่น 0812345678"/);
  assert.match(htmlCustomer, /placeholder="เช่น billing@example.com"/);

  // Tab 3 Decoupled buttons and placeholders: renders "ย้อนกลับ" and "บันทึกข้อมูล"
  const htmlBilling = renderToStaticMarkup(
    <SiteManageModal inline={true} initialTab="billing" open={true} onOpenChange={() => {}} siteId="site-123" />
  );
  assert.doesNotMatch(htmlBilling, /type="submit"/);
  assert.match(htmlBilling, /type="button"[^>]*>ย้อนกลับ<\/button>/);
  assert.match(htmlBilling, /type="button"[^>]*>บันทึกข้อมูล<\/button>/);
  assert.match(htmlBilling, /placeholder="เช่น 30"/);
  assert.match(htmlBilling, /placeholder="เช่น 7.00"/);
  assert.match(htmlBilling, /การทวงชำระ/);
  assert.match(htmlBilling, /ผู้รับเอกสาร/);
});
