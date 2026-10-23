import assert from 'node:assert/strict';import test from 'node:test';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {GatewayIndex,gatewayIndexPartitions,type GatewayRow} from './gateway-index';
import {gatewayPrimaryStatus,gatewayStatusClassName} from './gateway-operational-status';
import {GatewayDiscoveryError} from './gateway-workspace';
test('gateway index exposes registered gateway and lifecycle without customer billing identity',()=>{
const html=renderToStaticMarkup(<GatewayIndex rows={[{id:'gw',siteId:'site',siteName:'Roof A',siteCode:'S1',name:'Gateway A',externalGatewayId:'G1',status:'offline',lifecycleState:'active',configState:'applied',desiredVersion:3,publishedVersion:2,acknowledgedVersion:1,appliedVersion:1}]} locale="en" onSelect={()=>{}}/>);
for(const label of ['Gateway A','Roof A','G1','Devices','Billing meter reading','Last received','Gateway actions: Gateway A'])assert.ok(html.includes(label),label);
assert.doesNotMatch(html,/Production power/);
assert.doesNotMatch(html,/Pending application|Not published/);
assert.doesNotMatch(html,/Customer|Tax|Invoice|>Configuration</);
assert.doesNotMatch(html,/All sites|aria-label="Site"/);
assert.doesNotMatch(html,/No data/);
});

test('gateway index shows the cumulative billing meter reading in kWh',()=>{
  const html=renderToStaticMarkup(<GatewayIndex rows={[{id:'gw',siteId:'site',siteName:'Roof A',siteCode:'S1',name:'Gateway A',externalGatewayId:'G1',status:'online',billingEnergyKwh:29140,lifecycleState:'active',configState:'applied',desiredVersion:1,publishedVersion:1,acknowledgedVersion:1,appliedVersion:1}]} locale="th" onSelect={()=>{}}/>);
  assert.match(html,/ค่ามิเตอร์สะสม/);
  assert.match(html,/29,140 kWh/);
  assert.doesNotMatch(html,/กำลังผลิต/);
});

test('gateway index exposes 3 tabs (All, Connected, Not connected) with counts and discovered pairing action',()=>{
const registered:GatewayRow[] = [{id:'gw1',siteId:'site1',siteName:'Roof Alpha',siteCode:'S1',name:'Gateway Alpha',externalGatewayId:'GW-001',status:'online',lifecycleState:'active',configState:'applied',desiredVersion:1,publishedVersion:1,acknowledgedVersion:1,appliedVersion:1}];
const discovered = [{id:'disc-1',externalGatewayId:'GW-DISC-99',reportedSiteId:'SITE-TEST',reportedDeviceId:'INV-01',manufacturer:'Huawei',model:'SUN2000',profileId:null,protocol:'mqtt',status:'unassigned' as const,onboardingState:'ready' as const,assignedSiteId:null,assignedGatewayId:null,firstSeenAt:'2026-10-17T10:00:00Z',lastSeenAt:'2026-10-17T12:00:00Z',rawPayload:{}}];

const htmlTh = renderToStaticMarkup(<GatewayIndex rows={registered} discoveredRows={discovered} locale="th" onSelect={()=>{}} onPairDiscovered={()=>{}}/>);
assert.match(htmlTh, /ทั้งหมด/);
assert.match(htmlTh, /เชื่อมต่อแล้ว/);
assert.match(htmlTh, /ยังไม่เชื่อมต่อ/);
assert.match(htmlTh, /เชื่อมต่อไซต์งาน/);
assert.match(htmlTh, /GW-DISC-99/);
assert.match(htmlTh, /Gateway Alpha/);

const htmlEn = renderToStaticMarkup(<GatewayIndex rows={registered} discoveredRows={discovered} locale="en" onSelect={()=>{}} onPairDiscovered={()=>{}}/>);
assert.match(htmlEn, /All/);
assert.match(htmlEn, /Connected/);
assert.match(htmlEn, /Not connected/);
assert.match(htmlEn, /Pair site/);
});

test('gateway index reduces discovery and persisted lifecycle to one primary status',()=>{
const rows:GatewayRow[]=[
 {id:'pending',siteId:'s1',siteName:'Roof Pending',siteCode:'S1',name:'Gateway Pending',externalGatewayId:'GW-P',status:'offline',lifecycleState:'configuring',configState:'pending_sync',desiredVersion:2,publishedVersion:1,acknowledgedVersion:1,appliedVersion:1},
 {id:'failed',siteId:'s2',siteName:'Roof Failed',siteCode:'S2',name:'Gateway Failed',externalGatewayId:'GW-F',status:'offline',lifecycleState:'configuring',configState:'failed',desiredVersion:2,publishedVersion:2,acknowledgedVersion:2,appliedVersion:1},
];
const discovered=[{id:'disc',externalGatewayId:'GW-D',reportedSiteId:null,reportedDeviceId:null,manufacturer:null,model:null,profileId:null,protocol:'mqtt',status:'unassigned' as const,onboardingState:'telemetry_required' as const,assignedSiteId:null,assignedGatewayId:null,firstSeenAt:'2026-10-19T01:00:00Z',lastSeenAt:'2026-10-19T01:01:00Z',rawPayload:{}}];
const html=renderToStaticMarkup(<GatewayIndex rows={rows} discoveredRows={discovered} locale="en" onSelect={()=>{}}/>);
assert.equal((html.match(/aria-label="Gateway status: Connecting"/g)??[]).length,4);
assert.equal((html.match(/aria-label="Gateway status: Not connected"/g)??[]).length,2);
assert.doesNotMatch(html,/>Draft<|Pending synchronization|Configuration failed|>Unknown<|>Stale</);
});

test('active gateway uses server recency as its only status even when the stored connection event is online',()=>{
 const row:GatewayRow={id:'active-pending',siteId:'s',siteName:'Roof',siteCode:'S',name:'Gateway',externalGatewayId:'GW-1',status:'offline',connectionState:'online',lifecycleState:'active',configState:'pending_sync',desiredVersion:5,publishedVersion:5,acknowledgedVersion:5,appliedVersion:4,lastReceivedAt:'2026-10-19T00:00:00Z',pollingIntervalSeconds:10};
 const partitions=gatewayIndexPartitions([row],[],false);
 assert.deepEqual(partitions.connectedItems.map(item=>item.id),['active-pending']);
 const html=renderToStaticMarkup(<GatewayIndex rows={[row]} locale="en" now={new Date('2026-10-19T00:10:00Z').getTime()} onSelect={()=>{}}/>);
 assert.equal(gatewayPrimaryStatus(row),'offline');
 assert.equal((html.match(/aria-label="Gateway status: Offline"/g)??[]).length,2);
 assert.doesNotMatch(html,/aria-label="Gateway status: (Online|Connecting|Not connected)"|Pending synchronization|>Stale</);
});

test('primary status follows the operator lifecycle in a fixed order',()=>{
 assert.equal(gatewayPrimaryStatus({lifecycleState:'discovered',status:'unconnected'}),'unconnected');
 assert.equal(gatewayPrimaryStatus({lifecycleState:'configuring',status:'offline'}),'connecting');
 assert.equal(gatewayPrimaryStatus({lifecycleState:'disabled',status:'online'}),'connecting');
 assert.equal(gatewayPrimaryStatus({status:'online'}),'connecting');
 assert.equal(gatewayPrimaryStatus({lifecycleState:'active',status:'online'}),'online');
 assert.equal(gatewayPrimaryStatus({lifecycleState:'active',status:'offline',connectionState:'online'}),'offline');
 assert.equal(gatewayPrimaryStatus({lifecycleState:'active',status:'invalid'}),'offline');
});

test('primary statuses use distinct semantic colours',()=>{
 const classes=(['online','offline','unconnected','connecting'] as const).map(status=>gatewayStatusClassName(status));
 assert.equal(new Set(classes).size,4);
 assert.match(classes[0]!,/emerald/);
 assert.match(classes[1]!,/red/);
 assert.match(classes[2]!,/amber/);
 assert.match(classes[3]!,/blue/);
});

test('discovery failures render a retryable system alert instead of looking like an empty result',()=>{
let retried=false;
const html=renderToStaticMarkup(<GatewayDiscoveryError locale="en" error={new Error('broker unavailable')} onRetry={()=>{retried=true;}}/>);
assert.match(html,/data-slot="alert"/);
assert.match(html,/Could not refresh discovered gateways/);
assert.match(html,/Retry/);
assert.equal(retried,false);
});

test('initial discovery loading does not present a false empty result',()=>{
const html=renderToStaticMarkup(<GatewayIndex rows={[]} discoveryLoading locale="en" onSelect={()=>{}}/>);
assert.match(html,/Loading discovered gateways/);
assert.doesNotMatch(html,/No gateways found|No data|No results|No records match|ไม่พบข้อมูล|ไม่มีรายการข้อมูล/);
});

test('every persisted gateway is connected to a site while only discoveries are unconnected',()=>{
  const rows:GatewayRow[]=[
    {id:'active',siteId:'s1',siteName:'Active site',siteCode:'A',name:'Active',externalGatewayId:'GW-A',status:'offline',lifecycleState:'active',configState:'applied',desiredVersion:1,publishedVersion:1,acknowledgedVersion:1,appliedVersion:1},
    {id:'draft',siteId:'s2',siteName:'Draft site',siteCode:'D',name:'Draft',externalGatewayId:'GW-D',status:'online',lifecycleState:'configuring',configState:'draft',desiredVersion:1,publishedVersion:null,acknowledgedVersion:null,appliedVersion:null},
    {id:'pending',siteId:'s3',siteName:'Pending site',siteCode:'P',name:'Pending',externalGatewayId:'GW-P',status:'online',lifecycleState:'active',configState:'pending_sync',desiredVersion:2,publishedVersion:1,acknowledgedVersion:1,appliedVersion:1},
    {id:'failed',siteId:'s4',siteName:'Failed site',siteCode:'F',name:'Failed',externalGatewayId:'GW-F',status:'online',lifecycleState:'active',configState:'failed',desiredVersion:2,publishedVersion:2,acknowledgedVersion:2,appliedVersion:1},
  ];
  const discovered=[
    {id:'duplicate',externalGatewayId:'GW-P',reportedSiteId:null,reportedDeviceId:null,status:'unassigned' as const,onboardingState:'ready' as const,assignedSiteId:null,assignedGatewayId:'pending',firstSeenAt:'2026-10-19T01:00:00Z',lastSeenAt:'2026-10-19T01:01:00Z',rawPayload:{}},
    {id:'unassigned-duplicate',externalGatewayId:'GW-P',reportedSiteId:null,reportedDeviceId:null,status:'unassigned' as const,onboardingState:'ready' as const,assignedSiteId:null,assignedGatewayId:null,firstSeenAt:'2026-10-19T01:00:00Z',lastSeenAt:'2026-10-19T01:02:00Z',rawPayload:{}},
    {id:'serial-collision',externalGatewayId:'GW-P',gatewaySerial:'GW-SN-OTHER',reportedSiteId:null,reportedDeviceId:null,status:'unassigned' as const,onboardingState:'ready' as const,identityConflict:true,assignedSiteId:null,assignedGatewayId:null,firstSeenAt:'2026-10-19T01:00:00Z',lastSeenAt:'2026-10-19T01:01:00Z',rawPayload:{}},
    {id:'new',externalGatewayId:'GW-N',reportedSiteId:null,reportedDeviceId:null,status:'unassigned' as const,onboardingState:'ready' as const,assignedSiteId:null,assignedGatewayId:null,firstSeenAt:'2026-10-19T01:00:00Z',lastSeenAt:'2026-10-19T01:01:00Z',rawPayload:{}},
  ];
  const partitions=gatewayIndexPartitions(rows,discovered,false);
  assert.deepEqual(partitions.connectedItems.map(item=>item.id),['active','draft','pending','failed']);
  assert.deepEqual(partitions.unconnectedItems.map(item=>item.id),['serial-collision','new']);
  assert.equal(partitions.allItems.filter(item=>item.externalGatewayId==='GW-P').length,2);
});

test('initial discovery failure is explicitly unavailable while registered rows remain visible',()=>{
  const rows:GatewayRow[]=[{id:'active',siteId:'s1',siteName:'Roof A',siteCode:'A',name:'Gateway A',externalGatewayId:'GW-A',status:'online',lifecycleState:'active',configState:'applied',desiredVersion:1,publishedVersion:1,acknowledgedVersion:1,appliedVersion:1}];
  const html=renderToStaticMarkup(<GatewayIndex rows={rows} discoveryUnavailable locale="en" onSelect={()=>{}}/>);
  assert.match(html,/Discovered gateways unavailable/);
  assert.match(html,/Gateway A/);
  assert.doesNotMatch(html,/No gateways found|No results|No records match/);
});

test('desktop table uses discovery-unavailable copy instead of its built-in empty result',()=>{
  const html=renderToStaticMarkup(<GatewayIndex rows={[]} discoveryUnavailable locale="en" onSelect={()=>{}}/>);
  assert.match(html,/Discovered gateways unavailable/);
  assert.doesNotMatch(html,/No results|No records match|ไม่พบข้อมูล|ไม่มีรายการข้อมูล/);
});

test('discovered rows do not expose a pairing control without onboarding capability',()=>{
  const discovered=[{id:'disc',externalGatewayId:'GW-D',reportedSiteId:null,reportedDeviceId:null,status:'unassigned' as const,onboardingState:'ready' as const,assignedSiteId:null,assignedGatewayId:null,firstSeenAt:'2026-10-19T01:00:00Z',lastSeenAt:'2026-10-19T01:01:00Z',rawPayload:{}}];
  const html=renderToStaticMarkup(<GatewayIndex rows={[]} discoveredRows={discovered} locale="en" onSelect={()=>{}}/>);
  assert.match(html,/GW-D/);
  assert.doesNotMatch(html,/Pair site/);
});

test('external gateway reconciliation is exact and case-sensitive',()=>{
  const rows:GatewayRow[]=[{id:'persisted',siteId:'s1',siteName:'Roof A',siteCode:'A',name:'Gateway lowercase',externalGatewayId:'gw-01',status:'online',lifecycleState:'active',configState:'applied',desiredVersion:1,publishedVersion:1,acknowledgedVersion:1,appliedVersion:1}];
  const discovered=[{id:'discovered',externalGatewayId:'GW-01',reportedSiteId:null,reportedDeviceId:null,status:'unassigned' as const,onboardingState:'ready' as const,assignedSiteId:null,assignedGatewayId:null,firstSeenAt:'2026-10-19T01:00:00Z',lastSeenAt:'2026-10-19T01:01:00Z',rawPayload:{}}];
  const partitions=gatewayIndexPartitions(rows,discovered,false);
  assert.deepEqual(partitions.allItems.map(item=>item.id),['persisted','discovered']);
});

test('repeated non-conflicting discoveries keep only the newest exact gateway identity',()=>{
  const base={reportedSiteId:'SITE-1',reportedDeviceId:null,status:'unassigned' as const,onboardingState:'ready' as const,assignedSiteId:null,assignedGatewayId:null,firstSeenAt:'2026-10-19T01:00:00Z',rawPayload:{}};
  const discovered=[
    {...base,id:'older',externalGatewayId:'GW-DUP',lastSeenAt:'2026-10-19T01:01:00Z'},
    {...base,id:'newer',externalGatewayId:'GW-DUP',lastSeenAt:'2026-10-19T01:03:00Z'},
    {...base,id:'conflict',externalGatewayId:'GW-DUP',gatewaySerial:'OTHER',identityConflict:true,lastSeenAt:'2026-10-19T01:02:00Z'},
  ];
  const partitions=gatewayIndexPartitions([],discovered,false);
  assert.deepEqual(partitions.unconnectedItems.map(item=>item.id),['newer','conflict']);
});

test('discovery readiness routes operators to pairing or telemetry guidance',()=>{
  const base={reportedSiteId:null,reportedDeviceId:null,status:'unassigned' as const,assignedSiteId:null,assignedGatewayId:null,firstSeenAt:'2026-10-19T01:00:00Z',lastSeenAt:'2026-10-19T01:01:00Z',rawPayload:{}};
  const discovered=[
    {...base,id:'ready',externalGatewayId:'GW-READY',onboardingState:'ready' as const},
    {...base,id:'legacy',externalGatewayId:'GW-LEGACY',onboardingState:'telemetry_required' as const},
  ];
  const html=renderToStaticMarkup(<GatewayIndex rows={[]} discoveredRows={discovered} locale="en" onSelect={()=>{}} onPairDiscovered={()=>{}} onTelemetryRequired={()=>{}}/>);
  assert.match(html,/Pair site/);
  assert.match(html,/Publish telemetry/);
});
