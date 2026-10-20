import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GatewayDetailPageView,GatewayOperationalStatus } from './gateway-detail-page-view';
import { getTelemetryTagLabel, TELEMETRY_TAG_LABELS } from './telemetry-tag-labels';
import { LocaleProvider } from '../../providers/locale-provider';
import { SessionUserProvider } from '../../providers/session-user-provider';

const authorization = {
  revision: 1,
  permissions: ['technical.gateways.view', 'technical.gateways.edit', 'technical.brokers.view'],
  scopes: {
    business: { mode: 'selected' as const, siteIds: [] },
    technical: { mode: 'all' as const, siteIds: [] },
  },
};

const user = {
  id: 'staff-1',
  email: 'staff@example.test',
  displayName: 'Staff Engineer',
  role: 'operator' as const,
  authorization,
};

test('telemetry tag labels map known solar and electrical tags to Thai and English', () => {
  assert.equal(getTelemetryTagLabel('solar.active_power', 'th'), 'กำลังผลิตไฟฟ้าจริง');
  assert.equal(getTelemetryTagLabel('solar.active_power', 'en'), 'Solar Active Power');
  assert.equal(getTelemetryTagLabel('energy.active.import.total', 'th'), 'พลังงานนำเข้ารวม (คิดบิล)');
  assert.equal(getTelemetryTagLabel('electrical.voltage.l1_n', 'th'), 'แรงดันไฟฟ้า L1-N');
  assert.equal(getTelemetryTagLabel('electrical.frequency', 'th'), 'ความถี่ไฟฟ้า');

  // Fallback for custom or unknown tags
  assert.equal(getTelemetryTagLabel('custom.sensor.ambient_light', 'th'), 'Ambient Light');
});

test('GatewayDetailPageView renders initial loading skeleton without crashing', () => {
  const html = renderToStaticMarkup(
    <SessionUserProvider user={user}>
      <LocaleProvider initialLocale="th">
        <GatewayDetailPageView gatewayId="gw-123" />
      </LocaleProvider>
    </SessionUserProvider>
  );

  assert.ok(html.includes('animate-pulse'));
  assert.ok(html.includes('ops-content'));
  assert.ok(html.includes('ring-1 ring-foreground/10 rounded-xl'));
});

test('operational view renders one primary status and leaves configuration diagnostics to detail sections',()=>{
  const html=renderToStaticMarkup(<LocaleProvider initialLocale="en"><GatewayOperationalStatus gateway={{status:'offline',connectionState:'online',lifecycleState:'active',configState:'drifted',appliedVersion:4,lastReceivedAt:'2026-10-19T00:00:00Z',pollingIntervalSeconds:10}} now={new Date('2026-10-19T00:10:00Z').getTime()}/></LocaleProvider>);
  assert.equal((html.match(/data-slot="badge"/g)??[]).length,1);
  assert.match(html,/>Offline</);
  assert.doesNotMatch(html,/Assignment|Active|Configuration|Drifted|Connection|Telemetry|Stale|Last received/);
});
