import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {GatewayDetailModal} from './gateway-detail-modal';
import {GatewayFormDialog} from './gateway-form-dialog';
import {GatewayEditDialog} from './gateway-edit-dialog';
import {DeviceProfileEditor, parseDeviceFieldsJsonStrict, composeAutoDeviceTopic} from './device-profile-editor';
import {GatewayInstallationHistory} from './gateway-installation-history';
import {newDeviceDraft} from './site-form-values';
import {LocaleProvider} from '../../providers/locale-provider';
import {SessionUserProvider} from '../../providers/session-user-provider';

const authorization = {
  revision: 1,
  permissions: ['technical.gateways.view', 'technical.gateways.edit', 'technical.brokers.view'],
  scopes: {
    business: {mode: 'selected' as const, siteIds: []},
    technical: {mode: 'all' as const, siteIds: []},
  },
};
const user = {
  id: 'staff',
  email: 'staff@example.test',
  displayName: 'Staff',
  role: 'operator' as const,
  authorization,
};

const sampleGateway = {
  id: 'gw-1',
  siteId: 'site-1',
  siteName: 'Bangkok Factory 1',
  siteCode: 'BK-01',
  name: 'Gateway Inverter Zone A',
  externalGatewayId: 'GW-INV-001',
  status: 'online',
  deviceCount: 2,
  currentProductionKw: 125.4,
  lastReceivedAt: new Date().toISOString(),
  lastMeasuredAt: new Date().toISOString(),
  lastSeenAt: new Date().toISOString(),
  pollingIntervalSeconds: 10,
  subscriptionTopic: 'solar/v1/site-1/telemetry',
  desiredVersion: 2,
  publishedVersion: 2,
  acknowledgedVersion: 2,
  appliedVersion: 2,
};

test('GatewayDetailModal renders details and metrics when open without measurement comparisons card', () => {
  const html = renderToStaticMarkup(
    <SessionUserProvider user={user}>
      <LocaleProvider initialLocale="th">
        <GatewayDetailModal
          inline
          gateway={sampleGateway}
          open={true}
          onOpenChange={() => {}}
          onConfigure={() => {}}
        />
      </LocaleProvider>
    </SessionUserProvider>
  );

  assert.ok(html.includes('Gateway Inverter Zone A'));
  assert.ok(html.includes('GW-INV-001'));
  assert.ok(html.includes('Bangkok Factory 1'));
  assert.ok(html.includes('กำลังผลิตปัจจุบัน'));
  assert.ok(html.includes('ตั้งค่าเกตเวย์'));
  assert.ok(!html.includes('คู่ตรวจเทียบการวัด'));
  assert.ok(!html.includes('gap-2 w-full'));
});

test('GatewayFormDialog renders full-width tabs, frameless billing meter, and omits subscribe box', () => {
  const html = renderToStaticMarkup(
    <SessionUserProvider user={user}>
      <LocaleProvider initialLocale="th">
        <GatewayFormDialog
          inline
          open={true}
          onOpenChange={() => {}}
          sites={[{id: 'site-1', name: 'Site Alpha', code: 'SA-01', active: true}]}
          onSaved={() => {}}
        />
      </LocaleProvider>
    </SessionUserProvider>
  );

  assert.ok(html.includes('เพิ่มเกตเวย์ใหม่'));
  assert.ok(html.includes('เกตเวย์และการเชื่อมต่อ'));
  assert.ok(html.includes('อุปกรณ์และการรับข้อมูล'));
  assert.ok(html.includes('มิเตอร์หลักสำหรับคิดบิล'));
  assert.ok(html.includes('อุปกรณ์เพิ่มเติม'));
  assert.ok(html.includes('Site Alpha'));
  assert.ok(html.includes('บันทึกและสร้างเกตเวย์'));
  assert.ok(html.includes('data-slot="dialog-body"'));

  // Full-width flex-1 tabs
  assert.ok(html.includes('flex-1 justify-center'));
  // Subscribe filter box removed
  assert.ok(!html.includes('ตัวกรอง Subscribe'));
  // Billing meter card has no border/padding box
  assert.ok(html.includes('id="new-gw-main-device-card"'));
  assert.ok(!html.includes('id="new-gw-main-device-card" class="rounded-xl border bg-card p-4"'));
  // Inline footer has no w-full
  assert.ok(!html.includes('gap-2 w-full'));
});

test('GatewayEditDialog renders full-width tabs, footer save button, and omits subscribe box', () => {
  const html = renderToStaticMarkup(
    <SessionUserProvider user={user}>
      <LocaleProvider initialLocale="th">
        <GatewayEditDialog
          inline
          gateway={sampleGateway}
          open={true}
          onOpenChange={() => {}}
          sites={[{id: 'site-1', name: 'Bangkok Factory 1', code: 'BK-01', active: true}]}
          permissions={{gatewayEdit: true, deviceEdit: true, brokerView: true}}
          onSaved={() => {}}
        />
      </LocaleProvider>
    </SessionUserProvider>
  );

  assert.ok(html.includes('ตั้งค่าเกตเวย์'));
  assert.ok(html.includes('เกตเวย์และการเชื่อมต่อ'));
  assert.ok(html.includes('อุปกรณ์และการรับข้อมูล'));
  assert.ok(html.includes('ประวัติและการสลับเปลี่ยน'));
  assert.ok(html.includes('เพิ่มอุปกรณ์'));
  assert.ok(html.includes('ปิด'));
  assert.ok(html.includes('บันทึกการตั้งค่า'));
  assert.ok(!html.includes('บันทึกข้อมูลเกตเวย์'));
  assert.ok(!html.includes('คู่ตรวจเทียบการวัด'));
  assert.ok(!html.includes('ตัวกรอง Subscribe'));
  assert.ok(html.includes('data-slot="dialog-body"'));
  // Full-width flex-1 tabs
  assert.ok(html.includes('flex-1 justify-center'));
  // Footer has no w-full
  assert.ok(!html.includes('gap-2 w-full'));
});

test('GatewayInstallationHistory renders with replacement dialog ready', () => {
  const html = renderToStaticMarkup(
    <SessionUserProvider user={user}>
      <LocaleProvider initialLocale="th">
        <GatewayInstallationHistory
          gatewayId="gw-1"
          onReplaced={() => {}}
        />
      </LocaleProvider>
    </SessionUserProvider>
  );
  assert.ok(html.includes('เปลี่ยนเกตเวย์'));
});

test('composeAutoDeviceTopic only auto-fills topic when all 3 parts exist', () => {
  // Empty when any part is missing
  assert.equal(composeAutoDeviceTopic('', 'GW-001', 'DEV-1'), '');
  assert.equal(composeAutoDeviceTopic('SITE-001', '', 'DEV-1'), '');
  assert.equal(composeAutoDeviceTopic('SITE-001', 'GW-001', ''), '');
  assert.equal(composeAutoDeviceTopic('  ', 'GW-001', 'DEV-1'), '');

  // Returns constructed topic when all 3 parts exist
  assert.equal(
    composeAutoDeviceTopic('SITE-001', 'GW-001', 'PM2230'),
    'solar/v1/sites/SITE-001/gateways/GW-001/devices/PM2230/telemetry'
  );
});

test('DeviceProfileEditor provides instant table and json field views without Apply JSON button', () => {
  const draft = newDeviceDraft();
  draft.name = 'Huawei SmartLogger 3000';
  draft.model = 'SmartLogger 3000';
  draft.config.fields = [
    {
      tag: 'active_power',
      displayName: 'Active Power',
      pollGroup: 'energy',
      sourceUnit: 'kW',
      targetUnit: 'kW',
      conversion: 'identity',
      role: 'active-power',
      sourceTag: 'P_AC',
    },
    {
      tag: 'total_energy',
      displayName: 'Total Energy',
      pollGroup: 'energy',
      sourceUnit: 'kWh',
      targetUnit: 'kWh',
      conversion: 'identity',
      role: 'none',
      sourceTag: 'E_TOTAL',
    },
  ];

  const html = renderToStaticMarkup(
    <SessionUserProvider user={user}>
      <LocaleProvider initialLocale="th">
        <DeviceProfileEditor
          value={draft}
          onChange={() => {}}
          revisions={[]}
          locale="th"
        />
      </LocaleProvider>
    </SessionUserProvider>
  );

  assert.ok(html.includes('ตาราง'));
  assert.ok(html.includes('JSON'));
  assert.ok(!html.includes('นำ JSON ไปใช้'));
  assert.ok(html.includes('Active Power'));
  assert.ok(html.includes('active_power'));
});

test('parseDeviceFieldsJsonStrict throws compiler-style syntax and field errors', () => {
  const draft = newDeviceDraft();
  assert.throws(
    () => parseDeviceFieldsJsonStrict('[\n  { "tag": "p_kw",\n]', draft.config, false, 'th'),
    /SyntaxError/
  );
  assert.throws(
    () => parseDeviceFieldsJsonStrict('[{"displayName": "Power", "pollGroup": "energy"}]', draft.config, false, 'th'),
    /\[item #0\] missing "tag"/
  );
});


