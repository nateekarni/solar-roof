import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FinancialReadinessStatus } from '@solar/api-contracts';
import { SetupChecklist } from './setup-checklist';

function createStatus(
  items: FinancialReadinessStatus['items'],
  approval: FinancialReadinessStatus['approval'] = null
): FinancialReadinessStatus {
  return {
    scope: approval ? 'PRODUCTION' : null,
    fingerprint: 'test-fingerprint',
    approval,
    items,
    actions: {
      calculate: { enabled: false, missing: [] },
      issue: { enabled: false, missing: [] },
      approve_payment: { enabled: false, missing: [] },
      adjust: { enabled: false, missing: [] },
      send: { enabled: false, missing: [] },
    },
  };
}

const confirmation = { id: 'approval.confirmation', ready: false, responsibility: 'owner' as const, destination: '/settings/company' };

test('renders card title as "รายการข้อมูลที่ต้องตั้งค่าก่อนเริ่มใช้งาน" in Thai when incomplete', () => {
  const status = createStatus([
    { id: 'company.name', ready: false, responsibility: 'owner', destination: '/settings/company' },
    confirmation,
  ]);
  const html = renderToStaticMarkup(
    <SetupChecklist status={status} locale="th" isOwner={true} confirming={false} onConfirm={() => {}} />
  );
  assert.match(html, /รายการข้อมูลที่ต้องตั้งค่าก่อนเริ่มใช้งาน/);
  assert.match(html, /ตั้งค่า/);
});

test('renders compact site readiness in (X/Y) [siteName] format with direct setup link', () => {
  const status = createStatus([
    { ...confirmation, ready: true },
    { id: 'company.name', ready: true, responsibility: 'owner' },
    { id: 'site.tax', siteId: 'site-bkk', siteName: 'โรงงานสมุทรปราการ', ready: false, responsibility: 'owner', destination: '/sites/site-bkk/settings' },
    { id: 'site.rate', siteId: 'site-bkk', siteName: 'โรงงานสมุทรปราการ', ready: false, responsibility: 'owner', destination: '/sites/site-bkk/settings' },
    { id: 'site.customer', siteId: 'site-bkk', siteName: 'โรงงานสมุทรปราการ', ready: false, responsibility: 'owner', destination: '/sites/site-bkk/settings' },
    { id: 'site.service', siteId: 'site-bkk', siteName: 'โรงงานสมุทรปราการ', ready: false, responsibility: 'owner', destination: '/sites/site-bkk/settings' },
    { id: 'site.meter', siteId: 'site-bkk', siteName: 'โรงงานสมุทรปราการ', ready: false, responsibility: 'technical', destination: '/sites/site-bkk/settings' },
  ]);
  const html = renderToStaticMarkup(
    <SetupChecklist status={status} locale="th" isOwner={true} confirming={false} onConfirm={() => {}} />
  );
  // (0/5) โรงงานสมุทรปราการ
  assert.match(html, /\(0\/5\)/);
  assert.match(html, /โรงงานสมุทรปราการ/);
  assert.match(html, /href="\/records\/sites\/site-bkk"/);
});

test('uses lucide chevron icons instead of +/- for collapsible toggles', () => {
  const status = createStatus([
    { id: 'company.name', ready: false, responsibility: 'owner', destination: '/settings/company' },
    confirmation,
    { id: 'site.tax', siteId: 'site-1', siteName: 'ไซด์งาน 1', ready: false, responsibility: 'owner', destination: '/sites/site-1/settings' },
  ]);
  const html = renderToStaticMarkup(
    <SetupChecklist status={status} locale="th" isOwner={true} confirming={false} onConfirm={() => {}} />
  );
  // Lucide ChevronDown renders an svg with chevron-down path (or lucide-chevron-down class)
  assert.match(html, /lucide-chevron-down/);
  assert.doesNotMatch(html, />\+<|>\−</);
});

test('excludes environment system cards from owner checklist', () => {
  const status = createStatus([
    { id: 'company.name', ready: true, responsibility: 'owner' },
    { ...confirmation, ready: true },
    { id: 'environment.smtp', ready: false, responsibility: 'environment', destination: '/secret-smtp' },
    { id: 'environment.financial_writes', ready: false, responsibility: 'environment' },
  ]);
  const html = renderToStaticMarkup(
    <SetupChecklist status={status} locale="th" isOwner={true} confirming={false} onConfirm={() => {}} />
  );
  assert.doesNotMatch(html, /ระบบการเงินและการส่งเอกสาร|Finance and delivery services/);
});
