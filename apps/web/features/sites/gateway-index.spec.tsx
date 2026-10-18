import assert from 'node:assert/strict';import test from 'node:test';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {GatewayIndex} from './gateway-index';
test('gateway index exposes registered gateway and lifecycle without customer billing identity',()=>{
const html=renderToStaticMarkup(<GatewayIndex rows={[{id:'gw',siteId:'site',siteName:'Roof A',siteCode:'S1',name:'Gateway A',externalGatewayId:'G1',status:'offline',desiredVersion:3,publishedVersion:2,acknowledgedVersion:1,appliedVersion:1}]} locale="en" onSelect={()=>{}}/>);
for(const label of ['Gateway A','Roof A','G1','Devices','Production power','Last received','Gateway actions: Gateway A'])assert.ok(html.includes(label),label);
assert.doesNotMatch(html,/Pending application|Configuration|Not published/);
assert.doesNotMatch(html,/Customer|Tax|Invoice/);
assert.doesNotMatch(html,/All sites|aria-label="Site"/);
assert.doesNotMatch(html,/No data/);
});

test('gateway index exposes 3 tabs (All, Connected, Not connected) with counts and discovered pairing action',()=>{
const registered = [{id:'gw1',siteId:'site1',siteName:'Roof Alpha',siteCode:'S1',name:'Gateway Alpha',externalGatewayId:'GW-001',status:'online',desiredVersion:1,publishedVersion:1,acknowledgedVersion:1,appliedVersion:1}];
const discovered = [{id:'disc-1',externalGatewayId:'GW-DISC-99',reportedSiteId:'SITE-TEST',reportedDeviceId:'INV-01',manufacturer:'Huawei',model:'SUN2000',profileId:null,protocol:'mqtt',status:'unassigned' as const,assignedSiteId:null,assignedGatewayId:null,firstSeenAt:'2026-10-17T10:00:00Z',lastSeenAt:'2026-10-17T12:00:00Z',rawPayload:{}}];

const htmlTh = renderToStaticMarkup(<GatewayIndex rows={registered} discoveredRows={discovered} locale="th" onSelect={()=>{}}/>);
assert.match(htmlTh, /ทั้งหมด/);
assert.match(htmlTh, /เชื่อมต่อแล้ว/);
assert.match(htmlTh, /ยังไม่เชื่อมต่อ/);
assert.match(htmlTh, /เชื่อมต่อไซต์งาน/);
assert.match(htmlTh, /GW-DISC-99/);
assert.match(htmlTh, /Gateway Alpha/);

const htmlEn = renderToStaticMarkup(<GatewayIndex rows={registered} discoveredRows={discovered} locale="en" onSelect={()=>{}}/>);
assert.match(htmlEn, /All/);
assert.match(htmlEn, /Connected/);
assert.match(htmlEn, /Not connected/);
assert.match(htmlEn, /Pair site/);
});
