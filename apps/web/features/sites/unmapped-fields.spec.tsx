import assert from 'node:assert/strict';import test from 'node:test';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {unmappedFields} from './unmapped-fields';import {PayloadConnectionCard} from './payload-connection-card';import {SessionUserProvider} from '../../providers/session-user-provider';import {LocaleProvider} from '../../providers/locale-provider';import type {PayloadConfig} from './payload-contracts';
test('legacy object fields normalize to table rows without losing values',()=>{assert.deepEqual(unmappedFields({voltage:{value:230,unit:'V'},extra:7}),[{tag:'voltage',rawValue:230,rawUnit:'V'},{tag:'extra',rawValue:7,rawUnit:''}]);});
test('legacy object payload renders reception details without crashing',()=>{const config:PayloadConfig={siteId:'s',gatewayId:'g',externalSiteId:'S',externalGatewayId:'G',subscriptionTopic:'energy/G/#',ackTopic:null,devices:[],receiveRevision:{id:null,version:1,createdAt:null,config:{messagesPath:'payloads',fieldPaths:{},deviceAliases:[]}},bundleFixture:null,rejections:[],unmappedMessages:[{deviceId:'d',messageId:'m',receivedAt:'2026-10-09T00:00:00Z',unmapped:{voltage:{value:230,unit:'V'}}}]};const html=renderToStaticMarkup(<SessionUserProvider user={{id:'u',email:'u@example.test',displayName:'U',role:'admin'}}><LocaleProvider initialLocale="en"><PayloadConnectionCard config={config} onRefresh={()=>{}}/></LocaleProvider></SessionUserProvider>);assert.match(html,/voltage/);assert.match(html,/230/);});
test('PayloadConnectionCard overrides device cadence from gateway config, omits nested billing/cadence boxes, and puts formatted receivedAt first in rejections table', () => {
  const config = {
    siteId: 's',
    gatewayId: 'g',
    externalSiteId: 'S',
    externalGatewayId: 'G',
    subscriptionTopic: 'solar/v1/sites/S/gateways/G/devices/+/telemetry',
    ackTopic: null,
    devices: [
      {
        id: 'dev-1',
        name: 'มิเตอร์หลัก',
        model: 'DTSU666',
        serialNumber: 'SN-1',
        externalDeviceId: 'AYA-BPI-004',
        billingMeter: true,
        expectedIntervalSeconds: 60,
        profileRevisionId: 'rev-1',
        profileId: 'prof-1',
        profileVersion: 1,
        profileName: 'Main Meter',
        fields: [],
        registers: [],
      },
    ],
    cadence: [{ id: 'dev-1', expectedIntervalSeconds: 15, pollGroups: { energy: 15 } }],
    receiveRevision: {
      id: null,
      version: 1,
      createdAt: null,
      config: { messagesPath: 'payloads', fieldPaths: {}, deviceAliases: [] },
    },
    bundleFixture: null,
    rejections: [
      {
        id: 'r-1',
        topic: 'solar/v1/sites/S/gateways/G/devices/AYA-BPI-004/telemetry',
        reason: 'unknown_profile_version',
        receivedAt: '2026-04-16T08:11:36.229Z',
      },
    ],
    unmappedMessages: [],
  } as unknown as PayloadConfig;
  const html = renderToStaticMarkup(
    <SessionUserProvider user={{ id: 'u', email: 'u@example.test', displayName: 'U', role: 'admin' }}>
      <LocaleProvider initialLocale="th">
        <PayloadConnectionCard editable config={config} onRefresh={() => {}} />
      </LocaleProvider>
    </SessionUserProvider>
  );
  assert.ok(!html.includes('รอบรับข้อมูล (จากเกตเวย์)'));
  assert.ok(!html.includes('แหล่งข้อมูลสำหรับคำนวณบิล'));
  assert.ok(html.includes('ข้อความที่ถูกปฏิเสธการรับข้อมูล'));
  const rejectionsSection = html.slice(html.indexOf('ข้อความที่ถูกปฏิเสธการรับข้อมูล'));
  const receivedIdx = rejectionsSection.indexOf('เวลารับ');
  const topicIdx = rejectionsSection.indexOf('Topic');
  assert.ok(receivedIdx > -1 && topicIdx > -1 && receivedIdx < topicIdx);
  assert.ok(html.includes('value="15"'));
});
