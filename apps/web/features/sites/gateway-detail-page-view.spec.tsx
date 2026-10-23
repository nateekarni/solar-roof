import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as gatewayDetail from './gateway-detail-page-view';
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

test('device telemetry renders one row per gateway payload and keeps field details in a JSON dialog',()=>{
  const components=gatewayDetail as unknown as {
    GatewayTelemetryPayloadTable?:React.ComponentType<{payloads:any[];locale:'th'|'en';onSelect:(payload:any)=>void}>;
    GatewayTelemetryPayloadDialog?:React.ComponentType<{payload:any;deviceName:string;locale:'th'|'en';open:boolean;onOpenChange:(open:boolean)=>void}>;
    GatewayTelemetryPayloadJson?:React.ComponentType<{payload:any;deviceName:string;locale:'th'|'en'}>;
  };
  assert.ok(components.GatewayTelemetryPayloadTable,'GatewayTelemetryPayloadTable must be exported');
  assert.ok(components.GatewayTelemetryPayloadDialog,'GatewayTelemetryPayloadDialog must be exported');
  assert.ok(components.GatewayTelemetryPayloadJson,'GatewayTelemetryPayloadJson must be exported');
  const payload={id:'payload-1',deviceId:'device-1',messageId:'message-1',lotNumber:3,sequence:8,polledAt:'2026-10-19T00:00:00.000Z',sentAt:'2026-10-19T00:00:01.000Z',receivedAt:'2026-10-19T00:00:02.000Z',quality:'good',communication:'online',pollGroup:'realtime',sampleCount:2,payload:{messageId:'message-1',data:{values:{'power.active.total':1200,'energy.active.import.total':29140}}}};
  const table=renderToStaticMarkup(<LocaleProvider initialLocale="th"><components.GatewayTelemetryPayloadTable payloads={[payload]} locale="th" onSelect={()=>{}}/></LocaleProvider>);
  assert.equal((table.match(/<tr/g)??[]).length,2);
  assert.match(table,/message-1/);
  assert.match(table,/2 ค่า/);
  assert.doesNotMatch(table,/power\.active\.total/);
  const json=renderToStaticMarkup(<LocaleProvider initialLocale="th"><components.GatewayTelemetryPayloadJson payload={payload} deviceName="September meter" locale="th"/></LocaleProvider>);
  assert.match(json,/รายละเอียด JSON ที่เกตเวย์ส่ง/);
  assert.match(json,/power\.active\.total/);
  assert.match(json,/energy\.active\.import\.total/);
});
