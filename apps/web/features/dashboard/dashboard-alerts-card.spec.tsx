import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { DashboardAlertsCard, TechnicalAlertGuidanceDialog } from './dashboard-alerts-card';

const alerts = [
  {
    id: 'alert-1',
    siteName: 'Bangkok Solar Roof 1',
    title: 'Gateway requires attention',
    detail: 'Actual shared alert content',
    severity: 'warning',
    status: 'warning',
    occurred_at: '2026-10-07T00:00:00Z',
    destination: '/alerts',
    kind: 'alert',
  },
];

test('rendered Owner alert card retains shared content, displays siteName, and hides forbidden alert destination', () => {
  const html = renderToStaticMarkup(
    <DashboardAlertsCard role="owner" locale="en" alerts={alerts} />
  );
  assert.match(html, /Bangkok Solar Roof 1/);
  assert.match(html, /Gateway requires attention/);
  assert.match(html, /Actual shared alert content/);
  assert.doesNotMatch(html, /href="\/alerts"/);
  // Contains button trigger for technical alert guidance modal
  assert.match(html, /<button/);
});

test('rendered Owner alert card in Thai contains official technical guidance wording when dialog open', () => {
  const html = renderToStaticMarkup(
    <DashboardAlertsCard
      role="owner"
      locale="th"
      alerts={alerts}
      initialAlert={alerts[0]!}
      inlineDialog={true}
    />
  );
  assert.match(html, /การแจ้งเตือนทางเทคนิค/);
  assert.match(
    html,
    /การแจ้งเตือนนี้เป็นข้อมูลทางเทคนิคของอุปกรณ์ในไซต์งาน กรุณาประสานงานเจ้าหน้าที่เทคนิคหรือผู้ดูแลระบบเพื่อตรวจสอบและดำเนินการแก้ไข/
  );
  assert.match(html, /รับทราบ/);
});

test('TechnicalAlertGuidanceDialog renders Thai guidance notice and alert details', () => {
  const html = renderToStaticMarkup(
    <TechnicalAlertGuidanceDialog
      alert={alerts[0]!}
      open={true}
      onOpenChange={() => {}}
      locale="th"
      inline={true}
    />
  );
  assert.match(html, /Bangkok Solar Roof 1/);
  assert.match(html, /การแจ้งเตือนทางเทคนิค/);
  assert.match(
    html,
    /การแจ้งเตือนนี้เป็นข้อมูลทางเทคนิคของอุปกรณ์ในไซต์งาน กรุณาประสานงานเจ้าหน้าที่เทคนิคหรือผู้ดูแลระบบเพื่อตรวจสอบและดำเนินการแก้ไข/
  );
  assert.match(html, /รับทราบ/);
});

test('TechnicalAlertGuidanceDialog renders English guidance notice and alert details', () => {
  const html = renderToStaticMarkup(
    <TechnicalAlertGuidanceDialog
      alert={alerts[0]!}
      open={true}
      onOpenChange={() => {}}
      locale="en"
      inline={true}
    />
  );
  assert.match(html, /Bangkok Solar Roof 1/);
  assert.match(html, /Technical Alert/);
  assert.match(html, /This is a technical equipment alert/);
  assert.match(html, /Acknowledge/);
});

test('rendered Admin alert card preserves permitted All destination', () => {
  const html = renderToStaticMarkup(
    <DashboardAlertsCard role="admin" locale="en" alerts={alerts} />
  );
  assert.match(html, /href="\/alerts"/);
  assert.match(html, /Gateway requires attention/);
});

test('accessible business notification renders clickable link for Owner', () => {
  const businessAlerts = [
    {
      id: 'doc-1',
      siteName: 'Rayong Solar Plant',
      title: 'ออกใบวางบิลแล้ว',
      detail: 'INV-2026-001',
      severity: 'info',
      status: 'active',
      occurred_at: '2026-10-05T10:00:00Z',
      destination: '/records/documents/doc-1',
      kind: 'workflow',
    },
  ];
  const html = renderToStaticMarkup(
    <DashboardAlertsCard role="owner" locale="th" alerts={businessAlerts} />
  );
  assert.match(html, /Rayong Solar Plant/);
  assert.match(html, /ออกใบวางบิลแล้ว/);
  assert.match(html, /INV-2026-001/);
  assert.match(html, /href="\/records\/documents\/doc-1"/);
});

test('empty alerts renders clean bell empty state in both Thai and English', () => {
  const htmlTh = renderToStaticMarkup(
    <DashboardAlertsCard role="owner" locale="th" alerts={[]} />
  );
  assert.match(htmlTh, /ไม่มีการแจ้งเตือนใหม่/);

  const htmlEn = renderToStaticMarkup(
    <DashboardAlertsCard role="owner" locale="en" alerts={[]} />
  );
  assert.match(htmlEn, /No new notifications/);
});
