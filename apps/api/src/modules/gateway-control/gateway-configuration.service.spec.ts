import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';
import type { GatewayDeviceConfig, GatewayEnabledDeviceConfig } from '@solar/api-contracts';
import { DatabaseService } from '../../database/database.service.js';
import { GatewayCredentialService } from './gateway-credential.service.js';
import { GatewayConfigurationService } from './gateway-configuration.service.js';
import { PayloadIngestion } from '../telemetry/payload-ingestion.js';
import { BillingSourceBindingService } from '../billing/billing-source-binding.service.js';
import { AssetsController } from '../assets/assets.controller.js';
import { MqttIngestionService } from '../telemetry/mqtt-ingestion.service.js';
import { MeasurementComparisons } from '../assets/measurement-comparisons.js';
import { TelemetryController } from '../telemetry/telemetry.controller.js';
import { PayloadReceptionSettings } from '../telemetry/payload-reception-settings.js';
import { gatewayConfigHash } from './gateway-control-payload.js';

const discoveryId = '11111111-1111-4111-8111-111111111111';
const siteId = '22222222-2222-4222-8222-222222222222';
const actor = '33333333-3333-4333-8333-333333333333';
const broker = '44444444-4444-4444-8444-444444444444';
const gatewayId = '55555555-5555-4555-8555-555555555555';
const presetId = '66666666-6666-4666-8666-666666666666';
const now = '2026-10-19T01:00:00Z';
const http = (status: number) => (e: unknown) => e instanceof HttpException && e.getStatus() === status;
function device(): GatewayEnabledDeviceConfig {
  return { deviceId: 'M1', enabled: true, mappingSource: 'manual', deviceType: 'energy-meter',
    model: 'Verified Model', serialNumber: 'SERIAL-1', protocol: 'modbus-tcp',
    connection: { host: '192.0.2.10', port: 502, slaveId: 3 }, pollGroups: ['energy'],
    mappings: [{ tag: 'energy.active.import.total', displayName: 'Import energy', pollGroup: 'energy',
      sourceUnit: 'Wh', targetUnit: 'kWh', conversion: 'wh-to-kwh', role: 'billing-import',
      registerAddress: '3204', registerCount: 2, dataType: 'uint32', byteOrder: 'big_endian',
      wordOrder: 'big_word_first', scale: 0.01, offset: 2 }] };
}
type Write = { sql: string; values: unknown[] };
function fixture(options: { revision?: number; status?: string; occupied?: boolean; duplicate?: boolean; fail?: RegExp;
  preset?: unknown; registerPreset?:unknown; active?: number; desired?: number; hash?: string; proposalStatus?: string; base?: number;
  duplicateEvent?: boolean; existingDevice?: boolean; missing?: boolean; connection?: string; retiredDuplicate?: boolean;
  proposalDevices?: GatewayDeviceConfig[]; desiredDevices?: GatewayDeviceConfig[]; activeDevices?: GatewayDeviceConfig[];
  existingRows?: Record<string, unknown>[] } = {}) {
  const calls: Write[] = [], pending: Write[] = [], committed: Write[] = [];
  let rolledBack = false;
  const gateway = { id: gatewayId, site_id: siteId, external_gateway_id: 'GW-001', external_site_id: 'SELECTED',
    mqtt_broker_id: broker, retired_at: null, protocol: 'mqtt', lifecycle_state: 'active', config_state: 'applied',config_publication_epoch:'0',
    desired_config_version: options.desired ?? 1, applied_config_version: options.active ?? 1,
    desired_config_hash: options.hash ?? 'a'.repeat(64), active_config_hash: 'a'.repeat(64), connection_state: options.connection ?? 'unknown' };
  const query = async (sql: string, values: unknown[] = []) => {
    calls.push({ sql, values });
    if (sql === 'BEGIN') return { rows: [] };
    if (sql === 'ROLLBACK') { pending.length = 0; rolledBack = true; return { rows: [] }; }
    if (sql === 'COMMIT') { committed.push(...pending); pending.length = 0; return { rows: [] }; }
    if (options.fail?.test(sql)) throw new Error('injected SQL failure');
    if (/^(INSERT|UPDATE)/.test(sql.trim())) {
      if (options.duplicateEvent && /INSERT INTO gateway_(config_proposals|config_status_events|connection_events)/.test(sql)) return { rows: [] };
      pending.push({ sql, values });
      return { rows: /RETURNING/.test(sql) ? [{ id: gatewayId }] : [], rowCount: 1 };
    }
    if (/pg_advisory_xact_lock/.test(sql)) return { rows: [] };
    if (/FROM discovered_gateways/.test(sql)) return { rows: [{ id: discoveryId, external_gateway_id: 'GW-001',
      client_id: 'GW-001', mqtt_broker_id: broker, discovery_revision: options.revision ?? 2,
      status: options.status ?? 'unassigned', reported_site_id: 'REPORTED', raw_payload: { reportedSiteId: 'REPORTED' } }] };
    if (/FROM sites/.test(sql)) return { rows: [{ id: siteId, external_site_id: 'SELECTED', status: 'online' }] };
    if (/FROM payload_profile_revisions/.test(sql)) return { rows: options.preset ? [options.preset] : [] };
    if (/FROM meter_presets/.test(sql)) return { rows: options.registerPreset?[options.registerPreset]:[] };
    if (/FROM gateway_config_proposals/.test(sql)) return { rows: [{ id: presetId, gateway_id: gatewayId,
      proposal_id: 'proposal-1', base_config_version: options.base ?? 1, status: options.proposalStatus ?? 'pending',
      payload: { ...proposal(), devices: options.proposalDevices ?? [device()] }, received_at: now,
      applied_config_version:options.active??1,active_config:{schemaVersion:'1.1',messageType:'config',messageId:'active-1',
        gatewayId:'GW-001',siteId:'SELECTED',configVersion:options.active??1,configHash:'a'.repeat(64),issuedAt:now,
        approvedBy:actor,devices:options.activeDevices??[device()]} }] };
    if (/FROM gateway_configuration_revisions/.test(sql)) return { rows: [{ version: options.desired ?? 1,
      config_hash: options.hash ?? 'a'.repeat(64), config: { schemaVersion: '1.1', messageType: 'config', messageId: 'cfg-1',
        gatewayId: 'GW-001', siteId: 'SELECTED', configVersion: options.desired ?? 1, configHash: 'a'.repeat(64), issuedAt: now,
        approvedBy: actor, devices: values[1] === (options.active ?? 1) && options.activeDevices ? options.activeDevices : options.desiredDevices ?? [device()] } }] };
    if (/FROM devices/.test(sql)) return { rows: options.existingRows ?? (options.existingDevice ? [{ id: presetId, external_device_id: 'M1' }] : []) };
    if (/SELECT id,external_gateway_id,retired_at,protocol FROM gateways/.test(sql)) {
      const inserted = pending.find(w => /INSERT INTO gateways\(/.test(w.sql));
      return { rows: [{ ...gateway, id: inserted?.values[0] ?? gatewayId }] };
    }
    if (/^SELECT id FROM gateways/.test(sql) && /site_id=\$1|external_gateway_id=\$1/.test(sql)) {
      return { rows: options.occupied || options.duplicate || options.retiredDuplicate && !sql.includes('retired_at IS NULL')
        ? [{ id: gatewayId }] : [] };
    }
    if (/FROM gateways/.test(sql)) return { rows: options.missing ? [] : [gateway] };
    throw new Error(`Unhandled SQL boundary: ${sql}`);
  };
  const db = { query, pool: { connect: async () => ({ query, release() {} }) },
    transaction: DatabaseService.prototype.transaction } as unknown as DatabaseService;
  return { service: new GatewayConfigurationService(db, new GatewayCredentialService(db)), db, calls, committed,
    get rolledBack() { return rolledBack; } };
}
const confirm = (devices:GatewayDeviceConfig[] = [device()]) => ({ discoveryRevision: 2, siteId, devices });
function proposal() { return { schemaVersion: '1.1', messageType: 'configUpdate', messageId: 'update-1', gatewayId: 'GW-001',
  siteId: 'SELECTED', proposalId: 'proposal-1', baseConfigVersion: 1, sentAt: now, devices: [device()] }; }
const write = (f: ReturnType<typeof fixture>, pattern: RegExp) => {
  const found = f.committed.find(w => pattern.test(w.sql)); assert.ok(found, `Missing committed ${pattern}`); return found;
};

function publishingFixture(change?:'hash'|'version'|'identity'){
 const attempts=new Map<unknown,unknown>();
 const f=fixture();const config={schemaVersion:'1.1',messageType:'config',messageId:'config-1',gatewayId:'GW-001',siteId:'SELECTED',configVersion:1,
  configHash:'',issuedAt:now,approvedBy:actor,devices:[]};
 config.configHash=gatewayConfigHash(config);
 const hash=config.configHash;
 if(change==='hash')config.configHash='b'.repeat(64);
 if(change==='version')config.configVersion=2;
 if(change==='identity')config.gatewayId='OTHER';
 const connect=f.db.pool.connect.bind(f.db.pool);
 f.db.pool.connect=(async()=>{const client=await connect();const query=client.query.bind(client);return {...client,query:async(sql:string,values:unknown[]=[])=>{
  if(sql.includes('FROM gateway_configuration_publications'))return {rows:attempts.has(values[1])?[attempts.get(values[1])]:[]};
  if(sql.startsWith('INSERT INTO gateway_configuration_publications'))attempts.set(values[0],{id:values[0],version:values[2],config_hash:values[3],mqtt_broker_id:values[4],publication_epoch:values[5]});
  const result=await query(sql,values);
  if(/FROM gateway_configuration_revisions/.test(sql))return {rows:[{config,config_hash:hash}]};
  if(/FROM gateways g/.test(sql))return {rows:result.rows.map(row=>({...row,desired_config_hash:hash}))};
  return result;
 }}}) as typeof f.db.pool.connect;
 return {...f,config,hash};
}

test('desired publish loads the exact validated immutable snapshot and trusted broker',async()=>{
 const f=publishingFixture();assert.equal(typeof f.service.desiredForPublish,'function');
 const result=await f.service.desiredForPublish(gatewayId,1);
 assert.equal(result.brokerId,broker);assert.deepEqual(result.payload,f.config);
 assert.equal(f.committed.length,0);
});
for(const corruption of ['hash','version','identity'] as const)test(`desired publish rejects stored ${corruption} corruption`,async()=>{
 const f=publishingFixture(corruption);assert.equal(typeof f.service.desiredForPublish,'function');
 await assert.rejects(f.service.desiredForPublish(gatewayId,1));assert.equal(f.committed.length,0);
});
test('superseded desired version cannot load or mark published',async()=>{
 const f=publishingFixture();assert.equal(typeof f.service.desiredForPublish,'function');
 await assert.rejects(f.service.desiredForPublish(gatewayId,2),http(409));
 await assert.rejects(f.service.beginPublication(gatewayId,2,f.hash,broker,'0'),http(409));assert.equal(f.committed.length,0);
});
test('published bookkeeping commits timestamp and monotonic compatibility version without activation',async()=>{
 const f=publishingFixture();assert.equal(typeof f.service.recordPublished,'function');
 const attempt=await f.service.beginPublication(gatewayId,1,f.hash,broker,'0');
 assert.deepEqual(await f.service.recordPublished(gatewayId,attempt),{delivery:'published'});
 const revision=write(f,/UPDATE gateway_configuration_revisions/),gateway=write(f,/UPDATE gateways/);
 assert.match(revision.sql,/published_at=coalesce\(published_at,now\(\)\)/);assert.deepEqual(revision.values,[gatewayId,1,broker]);
 assert.match(gateway.sql,/published_config_version=GREATEST\(published_config_version,\$2\)/);
 assert.ok(!f.committed.some(w=>/acknowledged|applied|lifecycle_state/.test(w.sql)));
});

// Breaks caught: site auto-pairing, missing local profile, changed decoder, wrong broker,
// premature activation, absent hash, credential leak, or a missing transaction boundary.
test('confirms manual configuration atomically with trusted identity, local profile and desired-only state', async () => {
  const f = fixture();
  const response = await f.service.confirm(discoveryId, confirm(), actor);
  const g = write(f, /INSERT INTO gateways\(/);
  assert.deepEqual(g.values.slice(1, 6), [siteId, 'Gateway GW-001', 'solar/v1/sites/SELECTED/gateways/GW-001/devices/+/telemetry', 'GW-001', broker]);
  assert.match(g.sql, /'offline'[\s\S]*'configuring'[\s\S]*'pending_sync'/);
  const p = write(f, /INSERT INTO payload_profile_revisions/);
  const config = JSON.parse(String(p.values[3]));
  assert.equal(config.deviceType, 'energy-meter');
  assert.equal(config.fields[0].registerAddress, '3204');
  assert.equal(p.values[4], write(f, /INSERT INTO devices/).values[0]);
  assert.equal(write(f, /INSERT INTO devices/).values[8], p.values[0]);
  const revision = write(f, /INSERT INTO gateway_configuration_revisions/);
  const snapshot = JSON.parse(String(revision.values[3]));
  assert.deepEqual(snapshot.devices[0].connection, { host: '192.0.2.10', port: 502, slaveId: 3 });
  assert.deepEqual(snapshot.devices[0].mappings, device().mappings);
  assert.equal(snapshot.configHash, response.configHash);
  function canonical(v: unknown): string { return Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : v !== null && typeof v === 'object'
    ? '{' + Object.keys(v).filter(k => k !== 'configHash').sort().map(k => JSON.stringify(k) + ':' + canonical((v as Record<string, unknown>)[k])).join(',') + '}' : JSON.stringify(v); }
  assert.equal(response.configHash, createHash('sha256').update(canonical(snapshot)).digest('hex'));
  assert.equal(response.configVersion, 1);
  assert.equal(response.syncState.activeConfigVersion, 0);
  assert.equal(response.syncState.activeConfigHash, null);
  const credential = write(f, /INSERT INTO gateway_mqtt_credentials/);
  assert.equal(credential.values[1], 'GW-001');
  assert.ok(await argon2.verify(String(credential.values[2]), response.credential.password));
  assert.ok(!JSON.stringify(f.calls).includes(response.credential.password));
  assert.match(write(f, /UPDATE discovered_gateways/).sql, /'configuring'/);
  assert.equal(f.calls.at(-1)?.sql, 'COMMIT');
  assert.equal(f.calls.filter(c => c.sql === 'BEGIN').length, 1);
});

for (const options of [{ revision: 3 }, { status: 'configuring' }, { occupied: true }, { duplicate: true }]) {
  test(`rejects stale, already confirmed, occupied or conflicting identity ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    await assert.rejects(f.service.confirm(discoveryId, confirm(), actor), http(409));
    assert.deepEqual(f.committed, []); assert.equal(f.rolledBack, true);
  });
}

test('only a stale discovery revision uses the stable stale code; other conflicts retain their own errors',async()=>{
  const stale=fixture({revision:3});
  await assert.rejects(stale.service.confirm(discoveryId,confirm(),actor),(error:unknown)=>{
    if(!(error instanceof HttpException))return false;
    assert.equal((error.getResponse() as {code?:string}).code,'GATEWAY_DISCOVERY_STALE');return true;
  });
  const occupied=fixture({occupied:true});
  await assert.rejects(occupied.service.confirm(discoveryId,confirm(),actor),(error:unknown)=>{
    if(!(error instanceof HttpException))return false;
    assert.notEqual((error.getResponse() as {code?:string}).code,'GATEWAY_DISCOVERY_STALE');
    assert.match(String((error.getResponse() as {message?:string}).message),/active gateway|identity is already registered/i);return true;
  });
});

test('register presets reject invalid enum values and never accept a partial address match',async()=>{
  const revision='2026-10-19T01:00:00.000Z';
  for(const registers of [
    [{registerAddress:'9999',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1}],
    [{registerAddress:'3204',registerCount:2,dataType:'invalid',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1}],
    [{registerAddress:'3204',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1},{registerAddress:'9999',registerCount:2,dataType:'invalid',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1}],
    [{registerAddress:'3204',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1},{registerAddress:'R3204',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1}],
    [{registerAddress:'1',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1},{registerAddress:'R1',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1},{registerAddress:'0x1',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1},{registerAddress:'0001',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1}],
    [{registerAddress:'0x0C84',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1},{registerAddress:'0C84h',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1}],
    'not-an-array',
  ]){
    const f=fixture({registerPreset:{id:presetId,updated_at:revision,registers}});
    await assert.rejects(f.service.confirm(discoveryId,confirm([{...device(),mappingSource:'preset',presetId,presetVersion:revision}]),actor),http(400));
    assert.deepEqual(f.committed,[]);
  }
});

test('register presets reject duplicate canonical identities in selected mappings',async()=>{
  const revision='2026-10-19T01:00:00.000Z';
  const duplicate=device();
  duplicate.mappingSource='preset';duplicate.presetId=presetId;duplicate.presetVersion=revision;
  duplicate.mappings.push({...duplicate.mappings[0]!,tag:'another.field',registerAddress:'R3204'});
  const f=fixture({registerPreset:{id:presetId,updated_at:revision,registers:[{registerAddress:'3204',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1}]}});
  await assert.rejects(f.service.confirm(discoveryId,confirm([duplicate]),actor),http(400));
  assert.deepEqual(f.committed,[]);
});

test('confirmation rejects a changed register preset revision instead of applying values not reviewed by the admin',async()=>{
  const reviewed={...device(),mappingSource:'preset' as const,presetId,presetVersion:'2026-10-19T01:00:00.000Z'};
  const f=fixture({registerPreset:{id:presetId,updated_at:'2026-10-19T01:01:00.000Z',registers:[
    {registerAddress:'3204',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:2},
  ]}});
  await assert.rejects(f.service.confirm(discoveryId,confirm([reviewed]),actor),http(409));
  assert.deepEqual(f.committed,[]);
});

test('confirmation rejects a malformed register preset revision without throwing an internal error',async()=>{
  const reviewed={...device(),mappingSource:'preset' as const,presetId,presetVersion:'not-a-date'};
  const f=fixture({registerPreset:{id:presetId,updated_at:'2026-10-19T01:01:00.000Z',registers:[
    {registerAddress:'3204',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:2},
  ]}});
  await assert.rejects(f.service.confirm(discoveryId,confirm([reviewed]),actor),http(409));
  assert.deepEqual(f.committed,[]);
});

test('confirmation accepts the locked register preset revision and snapshots its reviewed decoder values',async()=>{
  const revision='2026-10-19T01:00:00.000Z';
  const reviewed={...device(),mappingSource:'preset' as const,presetId,presetVersion:revision};
  const f=fixture({registerPreset:{id:presetId,updated_at:revision,registers:[
    {registerAddress:'3204',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:0.01,offset:2},
  ]}});
  await f.service.confirm(discoveryId,confirm([reviewed]),actor);
  const snapshot=JSON.parse(String(write(f,/INSERT INTO gateway_configuration_revisions/).values[3]));
  assert.equal(snapshot.devices[0].presetVersion,revision);
  assert.equal(snapshot.devices[0].mappings[0].scale,0.01);
});

// Each late SQL failure must discard every previously written resource, including credentials.
for (const fail of [/INSERT INTO gateways/, /INSERT INTO payload_profile_revisions/, /INSERT INTO devices/,
  /INSERT INTO register_mapping_versions/, /INSERT INTO gateway_configuration_revisions/,
  /INSERT INTO gateway_mqtt_credentials/, /UPDATE discovered_gateways/, /INSERT INTO audit_events/]) {
  test(`rolls back all onboarding resources on ${fail}`, async () => {
    const f = fixture({ fail });
    await assert.rejects(f.service.confirm(discoveryId, confirm(), actor), /injected SQL failure/);
    assert.equal(f.rolledBack, true); assert.deepEqual(f.committed, []);
    assert.equal(f.calls.at(-1)?.sql, 'ROLLBACK');
  });
}

test('retains disabled incomplete devices in the snapshot without creating device rows', async () => {
  const f = fixture(); const disabled:GatewayDeviceConfig = { deviceId: 'UNKNOWN', enabled: false,
    mappingSource: 'gateway', pollGroups: [], mappings: [{tag:'admin-note',displayName:'Reported but not configured'}] };
  await f.service.confirm(discoveryId, confirm([device(), disabled]), actor);
  assert.equal(f.committed.filter(w => /INSERT INTO devices/.test(w.sql)).length, 1);
  const snapshot = JSON.parse(String(write(f, /INSERT INTO gateway_configuration_revisions/).values[3]));
  assert.deepEqual(snapshot.devices[1], disabled);
});

test('rejects out-of-storage disabled decoder values before any onboarding writes', async () => {
  for (const patch of [{registerCount:2_147_483_648},{scale:1e12},{scale:0.123456789}]) {
    const f=fixture();
    const disabled:GatewayDeviceConfig={deviceId:'UNKNOWN',enabled:false,mappingSource:'manual',pollGroups:[],mappings:[{registerAddress:'3204',...patch}]};
    await assert.rejects(f.service.confirm(discoveryId,confirm([device(),disabled]),actor),http(400),JSON.stringify(patch));
    assert.deepEqual(f.committed,[]);
  }
});

for (const [name, change] of [
  ['mappings', (d: GatewayDeviceConfig) => { d.mappings = []; }],
  ['serial', (d: GatewayDeviceConfig) => { delete d.serialNumber; }],
  ['connection', (d: GatewayDeviceConfig) => { delete d.connection; }],
  ['byte order', (d: GatewayDeviceConfig) => { delete d.mappings[0]!.byteOrder; }],
] as const) {
  test(`rejects incomplete enabled device ${name}`, async () => {
    const f = fixture();
    const changed = device(); change(changed);
    await assert.rejects(f.service.confirm(discoveryId, confirm([changed]), actor), http(400));
    assert.deepEqual(f.committed, []);
  });
}

test('copies an explicitly chosen immutable preset into a device-owned local revision', async () => {
  const source = { id: presetId, config: { id: 'verified-meter', version: '1.2.0', schemaVersion: '1.1',
    displayName: 'Verified meter', deviceType: 'energy-meter', pollGroups: ['energy'],
    fields: [{ tag: 'energy.active.import.total', displayName: 'Import energy', pollGroup: 'energy', sourceUnit: 'Wh',
      targetUnit: 'kWh', conversion: 'wh-to-kwh', role: 'billing-import', registerAddress: '3204' }] } };
  const f = fixture({ preset: source });
  await f.service.confirm(discoveryId, confirm([{ ...device(), mappingSource: 'preset', presetId }]), actor);
  const p = write(f, /INSERT INTO payload_profile_revisions/);
  assert.notEqual(p.values[0], presetId); assert.equal(p.values[5], presetId);
  assert.deepEqual(JSON.parse(String(p.values[3])).sourceProfile, { id: 'verified-meter', version: '1.2.0' });
});

test('rejects a missing explicitly selected preset', async () => {
  const f = fixture(); await assert.rejects(f.service.confirm(discoveryId,
    confirm([{ ...device(), mappingSource: 'preset', presetId }]), actor), http(400));
  assert.deepEqual(f.committed, []);
});

const control = (payload: unknown) => ({ brokerId: broker, gatewayId: 'GW-001', payload });
const status = (state: string, hash = 'a'.repeat(64), version = 1) => ({ schemaVersion: '1.1', messageType: 'configStatus',
  messageId: 'status-' + state, gatewayId: 'GW-001', configVersion: version, configHash: hash, status: state, reportedAt: now,
  ...(state === 'failed' ? { error: { code: 'DEVICE_READ', deviceId: 'M1' } } : {}) });

// Breaks caught: treating a proposal as approved, overwriting the full report, or accepting a foreign broker/site identity.
test('records a full immutable pending proposal without publishing or changing desired/active config', async () => {
  const f = fixture(); await f.service.recordProposal(control(proposal()));
  const p = write(f, /INSERT INTO gateway_config_proposals/);
  assert.deepEqual(p.values.slice(0, 4), [gatewayId, 'proposal-1', 'update-1', 1]);
  assert.deepEqual(JSON.parse(String(p.values[4])), proposal());
  assert.match(p.sql, /ON CONFLICT DO NOTHING/);
  assert.ok(!f.committed.some(w => /UPDATE gateways|gateway_configuration_revisions/.test(w.sql)));
});

test('deduplicates proposal message/proposal identities without a second state change', async () => {
  const f = fixture({ duplicateEvent: true }); await f.service.recordProposal(control(proposal()));
  assert.equal(f.committed.length, 0);
});

test('rejects control identity mismatch before SQL and unknown trusted broker scope with 404', async () => {
  const f = fixture(); await assert.rejects(f.service.recordProposal(control({ ...proposal(), gatewayId: 'OTHER' })), http(400));
  assert.equal(f.calls.length, 0);
  const missing = fixture({ missing: true }); await assert.rejects(missing.service.recordProposal(control(proposal())), http(404));
  assert.match(missing.calls.find(c => /FROM gateways/.test(c.sql))!.sql, /mqtt_broker_id IS NOT DISTINCT FROM/);
  assert.deepEqual(missing.committed, []);
});

test('approval uses active base and writes only the next desired revision plus reviewer evidence', async () => {
  const f = fixture({ desired: 3, active: 1 }); await f.service.approveProposal(gatewayId, presetId,{expectedProposalId:'proposal-1',expectedBaseConfigVersion:1}, actor);
  const revision = write(f, /INSERT INTO gateway_configuration_revisions/);
  assert.equal(revision.values[2], 4); assert.equal(revision.values[5], actor);
  const update = write(f, /UPDATE gateway_config_proposals/);
  assert.match(update.sql, /reviewed_at=now\(\)/); assert.ok(update.values.includes(actor));
  assert.ok(!f.committed.some(w => /INSERT INTO devices|UPDATE devices|INSERT INTO payload_profile_revisions/.test(w.sql)));
  assert.ok(!f.committed.some(w => /UPDATE gateways/.test(w.sql) && /active_config_hash|applied_config_version/.test(w.sql)));
});

test('approval rejects optimistic proposal identity or base mismatches before writing a revision',async()=>{
  for(const expected of [{expectedProposalId:'other',expectedBaseConfigVersion:1},{expectedProposalId:'proposal-1',expectedBaseConfigVersion:2}]){
    const f=fixture();
    await assert.rejects(f.service.approveProposal(gatewayId,presetId,expected,actor),http(409));
    assert.deepEqual(f.committed,[]);
  }
});

for (const options of [{ base: 2 }, { proposalStatus: 'approved' }, { proposalStatus: 'rejected' }]) {
  test(`rejects stale/nonpending proposal approval ${JSON.stringify(options)}`, async () => {
    const f = fixture(options); await assert.rejects(f.service.approveProposal(gatewayId, presetId,{expectedProposalId:'proposal-1',expectedBaseConfigVersion:options.base??1}, actor), http(409));
    assert.deepEqual(f.committed, []);
  });
}

test('rejection requires a reason and persists reviewer/time without config mutation', async () => {
  const invalid = fixture(); await assert.rejects(invalid.service.rejectProposal(gatewayId, presetId, '   ', actor), http(400));
  assert.equal(invalid.calls.length, 0);
  const f = fixture(); await f.service.rejectProposal(gatewayId, presetId, 'Wrong wiring', actor);
  const update = write(f, /UPDATE gateway_config_proposals/);
  assert.ok(update.values.includes('Wrong wiring')); assert.ok(update.values.includes(actor));
  assert.match(update.sql, /reviewed_at=now\(\)/);
  assert.ok(!f.committed.some(w => /UPDATE gateways|gateway_configuration_revisions/.test(w.sql)));
});

for (const mismatch of [status('applied', 'b'.repeat(64)), status('applied', 'a'.repeat(64), 9)]) {
  test(`records mismatched config evidence without activation ${mismatch.configVersion}/${mismatch.configHash.slice(0, 1)}`, async () => {
    const f = fixture(); const result = await f.service.recordConfigStatus(control(mismatch));
    assert.equal(result.activated, false); write(f, /INSERT INTO gateway_config_status_events/);
    assert.ok(!f.committed.some(w => /UPDATE gateways/.test(w.sql) && /active_config_hash|applied_config_version/.test(w.sql)));
  });
}

test('received status acknowledges a matching revision without activating device profiles', async () => {
  const f = fixture(); const result = await f.service.recordConfigStatus(control(status('received')));
  assert.equal(result.activated, false);
  assert.match(write(f, /UPDATE gateway_configuration_revisions/).sql, /acknowledged_at/);
  assert.ok(!f.committed.some(w => /UPDATE devices|INSERT INTO devices|active_config_hash=/.test(w.sql)));
});

test('applied matching status atomically advances active state and device bindings', async () => {
  const f = fixture({ existingDevice: true, active: 0 }); const result = await f.service.recordConfigStatus(control(status('applied')));
  assert.equal(result.activated, true);
  const update = write(f, /UPDATE gateways[\s\S]*active_config_hash/);
  assert.deepEqual(update.values.slice(0, 3), [gatewayId, 1, 'a'.repeat(64)]);
  assert.match(update.sql, /lifecycle_state='active'/);
  assert.match(write(f, /UPDATE devices[\s\S]*payload_profile_revision_id=\$2/).sql, /gateway_id=\$/);
  assert.ok(!f.committed.some(w => /INSERT INTO devices/.test(w.sql)));
  assert.match(write(f, /UPDATE discovered_gateways/).sql, /'assigned'/);
});

test('failed desired status records error and retains the active revision', async () => {
  const f = fixture({ active: 0 }); await f.service.recordConfigStatus(control(status('failed')));
  const update = write(f, /UPDATE gateways/); assert.match(update.sql, /config_state='failed'/);
  assert.ok(!/active_config_hash|applied_config_version/.test(update.sql));
  assert.deepEqual(JSON.parse(String(write(f, /INSERT INTO gateway_config_status_events/).values[6])), { code: 'DEVICE_READ', deviceId: 'M1' });
});

test('duplicate applied status never rebinds profiles', async () => {
  const f = fixture({ duplicateEvent: true }); await f.service.recordConfigStatus(control(status('applied')));
  assert.equal(f.committed.length, 0);
});

test('status activation rolls back evidence and bindings on a profile update failure', async () => {
  const f = fixture({ existingDevice: true, active: 0, fail: /UPDATE devices/ });
  await assert.rejects(f.service.recordConfigStatus(control(status('applied'))), /injected SQL failure/);
  assert.equal(f.rolledBack, true); assert.deepEqual(f.committed, []);
});

test('connection status records presence and drift without activating configuration', async () => {
  const f = fixture(); await f.service.recordConnectionStatus(control({ schemaVersion: '1.1', messageType: 'status',
    messageId: 'presence-1', gatewayId: 'GW-001', sessionId: 'session-1', firmwareVersion: '2.4', status: 'online',
    appliedConfigVersion: 9, appliedConfigHash: 'b'.repeat(64), reportedAt: now }));
  write(f, /INSERT INTO gateway_connection_events/);
  assert.ok(!f.committed.some(w => /UPDATE gateways/.test(w.sql) && /active_config_hash=|lifecycle_state=/.test(w.sql)));
  assert.match(write(f, /UPDATE gateways/).sql, /drifted/);
});

test('sync state separates desired and active and computes proposal staleness with bounded ordering', async () => {
  const f = fixture({ desired: 3, active: 1, connection: 'offline' });
  const sync = await f.service.syncState(gatewayId);
  assert.equal(sync.desiredConfigVersion, 3); assert.equal(sync.activeConfigVersion, 1);
  assert.equal(sync.connectionState, 'offline');
  const proposals=await f.service.proposals(gatewayId);
  assert.equal(proposals[0]?.activeConfigVersion,1);
  assert.equal(proposals[0]?.activeSnapshot?.messageId,'active-1');
  assert.equal(proposals[0]?.status,'pending');
  assert.match(f.calls.find(c => /FROM gateway_config_proposals/.test(c.sql))!.sql, /ORDER BY[\s\S]*received_at DESC[\s\S]*id[\s\S]*LIMIT 100/);
});

test('rotation is transactional, one-time and audits no plaintext or hash', async () => {
  const f = fixture(); const secret = await f.service.rotateCredential(gatewayId, actor);
  assert.equal(secret.username, 'GW-001');
  assert.ok(await argon2.verify(String(write(f, /INSERT INTO gateway_mqtt_credentials/).values[2]), secret.password));
  assert.ok(!JSON.stringify(f.calls).includes(secret.password));
  const audit = write(f, /INSERT INTO audit_events/); assert.ok(!String(audit.values[4]).includes('argon2'));
  const fail = fixture({ fail: /INSERT INTO audit_events/ });
  await assert.rejects(fail.service.rotateCredential(gatewayId, actor), /injected SQL failure/);
  assert.deepEqual(fail.committed, []); assert.equal(fail.rolledBack, true);
});

test('rejects invalid Modbus slave identity before creating resources', async () => {
  for (const slaveId of ['3', 0, 248]) {
    const f = fixture(); const d = device(); d.connection!.slaveId = slaveId;
    await assert.rejects(f.service.confirm(discoveryId, confirm([d]), actor), http(400));
    assert.deepEqual(f.committed, []);
  }
});

test('persists signed physical decoding for an admin-confirmed int32 mapping', async () => {
  const f = fixture(); const d = device(); d.mappings[0]!.dataType = 'int32';
  await f.service.confirm(discoveryId, confirm([d]), actor);
  const mapping = write(f, /INSERT INTO register_mapping_versions/);
  assert.match(mapping.sql, /signed/); assert.equal(mapping.values.at(-1), true);
});

test('matching reapplied active config clears drift without creating another profile revision', async () => {
  const f = fixture(); await f.service.recordConfigStatus(control(status('applied')));
  assert.ok(f.committed.some(w => /UPDATE gateways[\s\S]*config_state='applied'/.test(w.sql)));
  assert.ok(!f.committed.some(w => /INSERT INTO payload_profile_revisions/.test(w.sql)));
});

test('rejects malformed status vocabularies and half-present applied identity before SQL', async () => {
  const f = fixture(); await assert.rejects(f.service.recordConfigStatus(control(status('acknowledged'))), http(400));
  await assert.rejects(f.service.recordConnectionStatus(control({ schemaVersion: '1.1', messageType: 'status',
    messageId: 'presence', gatewayId: 'GW-001', sessionId: 'session', firmwareVersion: '2.4', status: 'online',
    appliedConfigVersion: 1, appliedConfigHash: null })), http(400));
  assert.equal(f.calls.length, 0);
});

test('SQL uniqueness rejection becomes conflict after rolling back onboarding writes', async () => {
  const f = fixture();
  const original = f.db.transaction.bind(f.db);
  f.db.transaction = work => original(async client => {
    const query = client.query.bind(client);
    client.query = (async (sql: string, values: unknown[]) => {
      if (/INSERT INTO devices/.test(sql)) throw Object.assign(new Error('unique serial'), { code: '23505' });
      return query(sql, values);
    }) as typeof client.query;
    return work(client);
  });
  await assert.rejects(f.service.confirm(discoveryId, confirm(), actor), http(409));
  assert.equal(f.rolledBack, true); assert.deepEqual(f.committed, []);
});

test('onboarding cannot recycle a retired external gateway identity retained by authentication', async () => {
  const f = fixture({ retiredDuplicate: true });
  await assert.rejects(f.service.confirm(discoveryId, confirm(), actor), http(409));
  assert.equal(f.rolledBack, true); assert.deepEqual(f.committed, []);
});

const invalidConnections: { protocol: string; connection: GatewayDeviceConfig['connection'] }[] = [
 { protocol:'unsupported', connection:{host:'192.0.2.10',port:502,slaveId:3} },
 { protocol:'modbus-tcp', connection:{note:'x'} },
 { protocol:'modbus-tcp', connection:{host:' ',port:502,slaveId:3} },
 { protocol:'modbus-tcp', connection:{host:'192.0.2.10',slaveId:3} },
 { protocol:'modbus-tcp', connection:{host:'192.0.2.10',port:'502',slaveId:3} },
 { protocol:'modbus-tcp', connection:{host:'192.0.2.10',port:0,slaveId:3} },
 { protocol:'modbus-tcp', connection:{host:'192.0.2.10',port:65536,slaveId:3} },
 { protocol:'modbus-tcp', connection:{host:'192.0.2.10',port:502} },
 { protocol:'modbus-tcp', connection:{host:'192.0.2.10',port:502,slaveId:3,note:'x'} },
 { protocol:'modbus-rtu', connection:{serialPort:'/dev/ttyS1',slaveId:3} },
 { protocol:'modbus-rtu', connection:{serialPort:' ',baudRate:9600,dataBits:8,parity:'none',stopBits:1,slaveId:3} },
 { protocol:'modbus-rtu', connection:{serialPort:'/dev/ttyS1',baudRate:0,dataBits:8,parity:'none',stopBits:1,slaveId:3} },
 { protocol:'modbus-rtu', connection:{serialPort:'/dev/ttyS1',baudRate:9600,dataBits:9,parity:'none',stopBits:1,slaveId:3} },
 { protocol:'modbus-rtu', connection:{serialPort:'/dev/ttyS1',baudRate:9600,dataBits:8,parity:'invalid',stopBits:1,slaveId:3} },
];
for (const [index, connection] of invalidConnections.entries()) {
  test(`confirmation and approval reject invalid explicit connection ${index}`, async () => {
    const d = { ...device(), ...connection } as GatewayEnabledDeviceConfig;
    const f = fixture(); await assert.rejects(f.service.confirm(discoveryId, confirm([d]), actor), http(400));
    const p = fixture({ proposalDevices: [d] }); await assert.rejects(p.service.approveProposal(gatewayId, presetId,{expectedProposalId:'proposal-1',expectedBaseConfigVersion:1}, actor), http(400));
    assert.deepEqual(f.committed, []); assert.deepEqual(p.committed, []);
  });
}

test('accepts a complete explicit RTU connection without inventing serial defaults', async () => {
  const connection = { serialPort:'/dev/ttyS1',baudRate:9600,dataBits:8,parity:'even',stopBits:1,slaveId:3 };
  const f = fixture(); await f.service.confirm(discoveryId, confirm([{ ...device(), protocol:'modbus-rtu', connection }]), actor);
  const snapshot = JSON.parse(String(write(f, /INSERT INTO gateway_configuration_revisions/).values[3]));
  assert.deepEqual(snapshot.devices[0].connection, connection);
});

const meterProfileId='77777777-7777-4777-8777-777777777777';
function meter() { return { ...device(), profileId:'sender-meter',profileVersion:'1.0.0' }; }
function existingMeter() {
  return { id:presetId,external_device_id:'M1',payload_profile_revision_id:meterProfileId,device_type:'meter',
    model:'Verified Model',serial_number:'SERIAL-1',slave_id:3,billing:true,billing_bound:true,
    profile_config:{id:'local-original',version:'1.0.0',sourceProfile:{id:'sender-meter',version:'1.0.0'},schemaVersion:'1.1',
      displayName:'Verified Model',deviceType:'energy-meter',pollGroups:['energy'],fields:[{tag:'energy.active.import.total',
        displayName:'Import energy',pollGroup:'energy',sourceUnit:'Wh',targetUnit:'kWh',conversion:'wh-to-kwh',role:'billing-import',registerAddress:'3204'}]},
    registers:[{tag:'energy.active.import.total',registerAddress:'3204',registerCount:2,dataType:'uint32',byteOrder:'big_endian',
      wordOrder:'big_word_first',scale:0.01,offset:2,pollGroup:'energy',sourceUnit:'Wh'}] };
}

// Break caught: a gateway-wide apply must not reassign an unchanged billing profile,
// otherwise the real ingestion boundary silently stops producing billable energy.
test('a change to another device preserves unchanged meter profile and billing source acceptance',async()=>{
  const unchanged=meter(),other={...meter(),deviceId:'M2',serialNumber:'SERIAL-2'};
  other.mappings=structuredClone(other.mappings);other.mappings[0]!.scale=0.02;
  const second={...existingMeter(),id:discoveryId,external_device_id:'M2',payload_profile_revision_id:discoveryId,
    serial_number:'SERIAL-2',billing:false,billing_bound:false};
  const f=fixture({active:1,desired:2,existingRows:[existingMeter(),second],activeDevices:[unchanged,{...meter(),deviceId:'M2',serialNumber:'SERIAL-2'}],desiredDevices:[unchanged,other]});
  await f.service.recordConfigStatus(control(status('applied','a'.repeat(64),2)));
  const meterUpdates=f.committed.filter(w=>/UPDATE devices[\s\S]*payload_profile_revision_id=\$2/.test(w.sql)&&w.values[0]===presetId);
  assert.equal(meterUpdates.length,0);
  assert.equal(f.committed.filter(w=>/INSERT INTO payload_profile_revisions/.test(w.sql)).length,1);
  assert.ok(!f.committed.some(w=>/billing_source_bindings|UPDATE billing_meters/.test(w.sql)));
  const current=meterUpdates.at(-1)?.values[1]??meterProfileId;const raws:unknown[][]=[];
  const query=async(sql:string,values:unknown[]=[])=>{
    if(sql.includes('FROM sites WHERE'))return {rows:[{id:siteId}]};
    if(sql.startsWith('UPDATE gateways')||sql.startsWith('SELECT id FROM gateways'))return {rows:[{id:gatewayId}]};
    if(sql.includes('FROM devices d'))return {rows:[{deviceId:presetId,siteId,gatewayId,externalSiteId:'SELECTED',externalGatewayId:'GW-001',
      externalDeviceId:'M1',revisionId:current,config:existingMeter().profile_config,billing:true,billingSource:{id:'binding',siteId,
        deviceId:presetId,profileRevisionId:meterProfileId,sourceTag:'energy.active.import.total',canonicalTag:'energy.active.import.total',sourceUnit:'Wh',targetUnit:'kWh',conversion:'wh-to-kwh'}}]};
    if(sql.includes('FROM devices WHERE'))return {rows:[{revisionId:current}]};
    if(sql.includes('SELECT billing_source_binding_id'))return {rows:[{id:'binding'}]};
    if(sql.includes('INSERT INTO payload_messages'))return {rows:[{id:'message'}]};
    if(sql.includes('INSERT INTO telemetry_raw'))raws.push(values);
    return {rows:[]};
  };
  const ingestion=new PayloadIngestion({query,pool:{connect:async()=>({query,release(){}})}} as unknown as DatabaseService);
  const ack=await ingestion.accept('solar/v1/sites/SELECTED/gateways/GW-001/devices/M1/telemetry',{
    schemaVersion:'1.1',messageType:'telemetry',messageId:'billing-after-apply',sequence:1,lotNumber:1,siteId:'SELECTED',gatewayId:'GW-001',
    device:{deviceId:'M1',deviceType:'energy-meter',profileId:'sender-meter',profileVersion:'1.0.0'},pollGroup:'energy',
    timestamps:{polledAt:now,sentAt:now},data:{values:{'energy.active.import.total':123000},units:{'energy.active.import.total':'Wh'}},
    quality:{status:'good',communication:'online'}});
  assert.ok(ack);assert.equal(raws[0]?.[6],123);assert.equal(raws[0]?.[9],meterProfileId);assert.equal(raws[0]?.[17],'binding');
});

for(const mutation of ['mapping','connection','disable'] as const){
  test(`bound billing device ${mutation} change rejects approval and application without rebinding history`,async()=>{
    let changed:GatewayDeviceConfig=structuredClone(meter());
    if(mutation==='mapping'&&changed.enabled)changed.mappings[0]!.scale=0.02;
    if(mutation==='connection')changed.connection!.host='192.0.2.11';
    if(mutation==='disable')changed={...changed,enabled:false};
    const approval=fixture({existingRows:[existingMeter()],activeDevices:[meter()],proposalDevices:[changed]});
    await assert.rejects(approval.service.approveProposal(gatewayId,presetId,{expectedProposalId:'proposal-1',expectedBaseConfigVersion:1},actor),http(409));
    assert.deepEqual(approval.committed,[]);
    const applied=fixture({active:1,desired:2,existingRows:[existingMeter()],activeDevices:[meter()],desiredDevices:[changed]});
    await assert.rejects(applied.service.recordConfigStatus(control(status('applied','a'.repeat(64),2))),http(409));
    assert.deepEqual(applied.committed,[]);assert.equal(applied.rolledBack,true);
  });
}

test('existing external device identity cannot change its deployed payload type on approval or apply',async()=>{
 const changed={...meter(),deviceType:'solar-logger'};
 const approval=fixture({existingRows:[{...existingMeter(),billing:false,billing_bound:false}],proposalDevices:[changed]});
 await assert.rejects(approval.service.approveProposal(gatewayId,presetId,{expectedProposalId:'proposal-1',expectedBaseConfigVersion:1},actor),http(400));
 const applied=fixture({active:1,desired:2,existingRows:[{...existingMeter(),billing:false,billing_bound:false}],desiredDevices:[changed]});
 await assert.rejects(applied.service.recordConfigStatus(control(status('applied','a'.repeat(64),2))),http(400));
 assert.deepEqual(approval.committed,[]);assert.deepEqual(applied.committed,[]);
});

test('new devices retain their validated non-meter classification',async()=>{
 const f=fixture();await f.service.confirm(discoveryId,confirm([{...device(),deviceType:'environmental_sensor'}]),actor);
 assert.equal(write(f,/INSERT INTO devices/).values[6],'environmental_sensor');
});

for(const value of [0.123456789,1e-9,1000000000000,-1000000000000])for(const phase of ['confirm','approve','apply'] as const){
 test(`${phase} rejects scale ${value} that numeric(20,8) cannot store exactly`,async()=>{
  const d=meter();d.mappings[0]!.scale=value;
  const f=fixture({active:1,desired:2,proposalDevices:[d],desiredDevices:[d]});
  const operation=phase==='confirm'?f.service.confirm(discoveryId,confirm([d]),actor):phase==='approve'?
    f.service.approveProposal(gatewayId,presetId,{expectedProposalId:'proposal-1',expectedBaseConfigVersion:1},actor):f.service.recordConfigStatus(control(status('applied','a'.repeat(64),2)));
  await assert.rejects(operation,http(400));assert.deepEqual(f.committed,[]);
 });
}

test('exact eight-decimal scale survives storage and unchanged billing comparison without rounding',async()=>{
 const d=meter();d.mappings[0]!.scale=0.12345678;d.mappings[0]!.offset=0.123456789;
 const f=fixture();await f.service.confirm(discoveryId,confirm([d]),actor);
 const stored=write(f,/INSERT INTO register_mapping_versions/);
 assert.equal(stored.values[8],0.12345678);assert.equal(JSON.parse(String(stored.values[10])).offset,0.123456789);
 const row=existingMeter();row.registers[0]!.scale=Number('0.12345678');row.registers[0]!.offset=0.123456789;
 const same=fixture({active:1,desired:2,existingRows:[row],activeDevices:[d],desiredDevices:[d]});
 await same.service.recordConfigStatus(control(status('applied','a'.repeat(64),2)));
 assert.ok(!same.committed.some(w=>/INSERT INTO payload_profile_revisions/.test(w.sql)));
});

for(const phase of ['confirm','approve','apply'] as const)test(`${phase} rejects register count outside PostgreSQL integer storage`,async()=>{
 const d=meter();d.mappings[0]!.registerCount=2147483648;
 const f=fixture({active:1,desired:2,proposalDevices:[d],desiredDevices:[d]});
 const operation=phase==='confirm'?f.service.confirm(discoveryId,confirm([d]),actor):phase==='approve'?
  f.service.approveProposal(gatewayId,presetId,{expectedProposalId:'proposal-1',expectedBaseConfigVersion:1},actor):f.service.recordConfigStatus(control(status('applied','a'.repeat(64),2)));
 await assert.rejects(operation,http(400));assert.deepEqual(f.committed,[]);
});

function deferred() { let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve}; }
function bindingApplyRace(addDevice=false) {
 const changed=meter();changed.mappings[0]!.scale=0.02;
 const base=fixture({active:1,desired:2,activeDevices:[meter()],desiredDevices:addDevice?[meter(),{...meter(),deviceId:'M2',serialNumber:'SERIAL-2'}]:[changed]});
 const state=existingMeter();state.billing_bound=false;
 let bindingId:string|null=null,binding:Record<string,unknown>|null=null,owner:number|null=null,sequence=0,firstGated=false;
 const firstLocked=deferred(),secondWaiting=deferred(),continueFirst=deferred(),waiters:(()=>void)[]=[];
 const traces:{tx:number;sql:string}[]=[];let siteUpdateOwner:number|null=null,addedDevices=0;
 const lock=async(tx:number)=>{
  if(owner===tx)return;
  while(owner!==null){secondWaiting.resolve();await new Promise<void>(done=>waiters.push(done));}
  owner=tx;
  if(!firstGated){firstGated=true;firstLocked.resolve();await continueFirst.promise;}
 };
 const unlock=(tx:number)=>{if(owner===tx){owner=null;waiters.shift()?.();}};
 const meterRow=()=>({id:'billing-meter',device_id:presetId,payload_profile_revision_id:state.payload_profile_revision_id,
  config:structuredClone(state.profile_config),billing_source_binding_id:bindingId});
 const db=base.db;
 db.pool.connect=(async()=>{
  const tx=++sequence,actions:(()=>void)[]=[],profiles=new Map<string,typeof state.profile_config>();
  const query=async(sql:string,values:unknown[]=[])=>{
   traces.push({tx,sql});
   if(sql==='BEGIN')return {rows:[]};
   if(sql==='COMMIT'){actions.forEach(action=>action());if(siteUpdateOwner===tx)siteUpdateOwner=null;unlock(tx);return {rows:[]};}
   if(sql==='ROLLBACK'){if(siteUpdateOwner===tx)siteUpdateOwner=null;unlock(tx);return {rows:[]};}
   if(sql.startsWith('SELECT id FROM sites')){
    if(sql.includes('FOR UPDATE'))siteUpdateOwner=tx;
    return {rows:[{id:siteId}]};
   }
   if(/INSERT INTO devices\(/.test(sql)){
    // PostgreSQL takes a site KEY SHARE for the new row's FK. An UPDATE site
    // lock held by the binder waiting on this transaction's device is a cycle.
    if(siteUpdateOwner!==null&&siteUpdateOwner!==tx)throw Object.assign(new Error('simulated site/device FK deadlock'),{code:'40P01'});
    actions.push(()=>{addedDevices++;});return {rows:[]};
   }
   if(/FROM devices d/.test(sql)){
    // Model PostgreSQL's statement snapshot: a combined lock/read begins its
    // correlated reads before waiting; only a second statement sees the commit.
    const captured=structuredClone(state);if(/FOR UPDATE OF d/.test(sql))await lock(tx);
    return {rows:[captured]};
   }
   if(/SELECT id FROM devices[\s\S]*FOR UPDATE/.test(sql)){await lock(tx);return {rows:[{id:presetId}]};}
   if(/FROM billing_meters/.test(sql)){
    const captured=meterRow();if(/FOR UPDATE OF b,d/.test(sql))await lock(tx);
    return {rows:[captured]};
   }
   if(/SELECT \* FROM billing_source_bindings/.test(sql))return {rows:binding?[binding]:[]};
   if(/INSERT INTO payload_profile_revisions/.test(sql)){profiles.set(String(values[0]),JSON.parse(String(values[3])));return {rows:[]};}
   if(/UPDATE devices[\s\S]*payload_profile_revision_id=\$2/.test(sql))actions.push(()=>{
    state.payload_profile_revision_id=String(values[1]);state.profile_config=profiles.get(String(values[1]))!;
   });
   if(/INSERT INTO register_mapping_versions/.test(sql)&&values[1]===presetId)actions.push(()=>{state.registers=[{tag:String(values[2]),registerAddress:String(values[3]),
    dataType:String(values[4]),byteOrder:String(values[5]),wordOrder:String(values[6]),registerCount:Number(values[7]),scale:Number(values[8]),
    sourceUnit:String(values[9]),pollGroup:JSON.parse(String(values[10])).pollGroup,offset:JSON.parse(String(values[10])).offset??0}];});
   if(/INSERT INTO billing_source_bindings/.test(sql)){
    const created={id:values[0],meter_id:values[1],site_id:values[2],device_id:values[3],profile_revision_id:values[4],source_tag:values[5],
     canonical_tag:values[6],source_unit:values[7],target_unit:values[8],conversion:values[9],measurement_purpose:values[10]};
    actions.push(()=>{binding=created;});return {rows:[created]};
   }
   if(/UPDATE billing_meters/.test(sql))actions.push(()=>{bindingId=String(values[1]);state.billing_bound=true;});
   if(/^(INSERT|UPDATE)/.test(sql.trim()))return {rows:/RETURNING/.test(sql)?[{id:'event'}]:[]};
   return db.query(sql,values);
  };
  return {query,release(){}};
 }) as typeof db.pool.connect;
 return {apply:()=>base.service.recordConfigStatus(control(status('applied','a'.repeat(64),2))),
  bind:(profileRevisionId:string)=>new BillingSourceBindingService(db).bind(siteId,{deviceId:presetId,profileRevisionId,
   sourceTag:'energy.active.import.total',canonicalTag:'energy.active.import.total',sourceUnit:'Wh',targetUnit:'kWh',conversion:'wh-to-kwh',
   measurementPurpose:'solar-delivered'},actor),firstLocked,secondWaiting,continueFirst,state,traces,get binding(){return binding;},get addedDevices(){return addedDevices;}};
}

test('bind-first commits before waiting apply rereads billing state and rejects changed decoder',{timeout:5000},async()=>{
 const f=bindingApplyRace();const binding=f.bind(meterProfileId);await f.firstLocked.promise;
 const applied=f.apply().then(value=>({value,error:undefined}),error=>({value:undefined,error}));
 await f.secondWaiting.promise;f.continueFirst.resolve();await binding;
 const result=await applied;assert.ok(http(409)(result.error));assert.equal(f.state.payload_profile_revision_id,meterProfileId);
 assert.equal(f.binding?.profile_revision_id,meterProfileId);
});

test('apply-first makes a waiting bind reject stale input then bind only the post-apply profile',{timeout:5000},async()=>{
 const f=bindingApplyRace();const applied=f.apply();await f.firstLocked.promise;
 const binding=f.bind(meterProfileId).then(value=>({value,error:undefined}),error=>({value:undefined,error}));
 await f.secondWaiting.promise;f.continueFirst.resolve();assert.equal((await applied).activated,true);
 const result=await binding;assert.ok(http(409)(result.error));assert.equal(f.binding,null);
 assert.notEqual(f.state.payload_profile_revision_id,meterProfileId);
 const retried=await f.bind(f.state.payload_profile_revision_id);
 assert.equal(retried?.profileRevisionId,f.state.payload_profile_revision_id);
});

test('waiting bind site lock permits apply new-device FK key share so both transactions finish',{timeout:5000},async()=>{
 const f=bindingApplyRace(true);const applied=f.apply().then(value=>({value,error:undefined}),error=>({value:undefined,error}));
 await f.firstLocked.promise;
 const binding=f.bind(meterProfileId).then(value=>({value,error:undefined}),error=>({value:undefined,error}));
 await f.secondWaiting.promise;f.continueFirst.resolve();
 const appliedResult=await applied,bindingResult=await binding;
 assert.equal(appliedResult.error,undefined);assert.equal(appliedResult.value?.activated,true);assert.equal(f.addedDevices,1);
 assert.equal(bindingResult.error,undefined);assert.equal(bindingResult.value?.profileRevisionId,meterProfileId);
 assert.equal(f.state.payload_profile_revision_id,meterProfileId);assert.equal(f.binding?.profile_revision_id,meterProfileId);
});

// Break caught: gateway-first application can deadlock against the real archive
// route's site-first updates when a device INSERT checks its site foreign key.
function archiveApplyRace() {
 const base=fixture({active:0,desired:1});let sequence=0,archived=false,activated=false,addedDevices=0,gated=false;
 const firstLocked=deferred(),secondWaiting=deferred(),continueFirst=deferred();
 const owners=new Map<string,Map<number,'share'|'update'>>(),waiting=new Map<number,number[]>(),wakeups:(()=>void)[]=[];
 const reaches=(from:number,target:number,seen=new Set<number>()):boolean=>from===target||!seen.has(from)&&
  (seen.add(from),Boolean(waiting.get(from)?.some(next=>reaches(next,target,seen))));
 const lock=async(tx:number,key:string,mode:'share'|'update')=>{
  while(true){
   const holders=owners.get(key)??new Map<number,'share'|'update'>();
   const blockers=[...holders].filter(([id,held])=>id!==tx&&(mode==='update'||held==='update')).map(([id])=>id);
   if(!blockers.length){waiting.delete(tx);holders.set(tx,mode);owners.set(key,holders);break;}
   waiting.set(tx,blockers);secondWaiting.resolve();
   if(blockers.some(id=>reaches(id,tx)))throw Object.assign(new Error('simulated archive/apply lock deadlock'),{code:'40P01'});
   await new Promise<void>(done=>wakeups.push(done));
  }
  if(!gated){gated=true;firstLocked.resolve();await continueFirst.promise;}
 };
 const release=(tx:number)=>{waiting.delete(tx);for(const held of owners.values())held.delete(tx);wakeups.splice(0).forEach(wake=>wake());};
 const db=base.db;
 db.pool.connect=(async()=>{
  const tx=++sequence,actions:(()=>void)[]=[];
  const query=async(sql:string,values:unknown[]=[])=>{
   if(sql==='BEGIN')return {rows:[]};
   if(sql==='COMMIT'){actions.forEach(action=>action());release(tx);return {rows:[]};}
   if(sql==='ROLLBACK'){release(tx);return {rows:[]};}
   if(/FROM sites/.test(sql)){
    if(/FOR (UPDATE|KEY SHARE)/.test(sql))await lock(tx,'site',sql.includes('FOR UPDATE')?'update':'share');
    return {rows:archived&&sql.includes("status<>'archived'")?[]:[{id:siteId,name:'Selected',external_site_id:'SELECTED'}]};
   }
   if(/FROM gateways g/.test(sql)){
    if(sql.includes('FOR UPDATE'))await lock(tx,'gateway','update');
    if(archived&&sql.includes("status<>'archived'"))return {rows:[]};
   }
   if(/FROM contracts/.test(sql))return {rows:[{count:1}]};
   if(/FROM billing_cycles/.test(sql))return {rows:[{count:0}]};
   if(/UPDATE sites SET status = 'archived'/.test(sql)){actions.push(()=>{archived=true;});return {rows:[]};}
   if(/UPDATE gateways SET status = 'offline'/.test(sql)){await lock(tx,'gateway','update');return {rows:[]};}
   if(/INSERT INTO devices\(/.test(sql)){await lock(tx,'site','share');actions.push(()=>{addedDevices++;});}
   if(/UPDATE gateways SET applied_config_version=/.test(sql))actions.push(()=>{activated=true;});
   return db.query(sql,values);
  };
  return {query,release(){}};
 }) as typeof db.pool.connect;
 return {apply:()=>base.service.recordConfigStatus(control(status('applied'))),
  archive:()=>new AssetsController(db,{} as MqttIngestionService).deleteSite(siteId,'archive'),
  firstLocked,secondWaiting,continueFirst,get archived(){return archived;},get activated(){return activated;},get addedDevices(){return addedDevices;}};
}

test('archive-first serializes application before its gateway lock and rejects archived site',{timeout:5000},async()=>{
 const f=archiveApplyRace();const archived=f.archive();await f.firstLocked.promise;
 const applied=f.apply().then(value=>({value,error:undefined}),error=>({value:undefined,error}));
 await f.secondWaiting.promise;f.continueFirst.resolve();
 assert.equal((await archived).archived,true);const result=await applied;
 assert.ok(http(404)(result.error));assert.equal(f.archived,true);assert.equal(f.activated,false);assert.equal(f.addedDevices,0);
});

test('apply-first holds compatible site lock before gateway so archive waits without cycle',{timeout:5000},async()=>{
 const f=archiveApplyRace();const applied=f.apply();await f.firstLocked.promise;
 const archived=f.archive().then(value=>({value,error:undefined}),error=>({value:undefined,error}));
 await f.secondWaiting.promise;f.continueFirst.resolve();
 assert.equal((await applied).activated,true);const result=await archived;
 assert.equal(result.error,undefined);assert.equal(result.value?.archived,true);
 assert.equal(f.archived,true);assert.equal(f.activated,true);assert.equal(f.addedDevices,1);
});

for(const operation of ['proposal','approve','reject','applied','connection','rotate'] as const){
 test(`${operation} locks its nonarchived site before gateway or device mutation locks`,async()=>{
  const f=fixture({active:operation==='applied'?0:1});let siteLocked=false;
  const connect=f.db.pool.connect.bind(f.db.pool);
  f.db.pool.connect=(async()=>{
   const client=await connect();const query=client.query.bind(client);
   return {...client,query:async(sql:string,values:unknown[]=[])=>{
    if(/FROM sites/.test(sql)&&sql.includes('FOR KEY SHARE')&&sql.includes("status<>'archived'"))siteLocked=true;
    if(/FOR UPDATE OF g|SELECT id FROM devices[\s\S]*FOR UPDATE/.test(sql))assert.ok(siteLocked,'gateway/device lock preceded site key share');
    return query(sql,values);
   }};
  }) as typeof f.db.pool.connect;
  if(operation==='proposal')await f.service.recordProposal(control(proposal()));
  if(operation==='approve')await f.service.approveProposal(gatewayId,presetId,{expectedProposalId:'proposal-1',expectedBaseConfigVersion:1},actor);
  if(operation==='reject')await f.service.rejectProposal(gatewayId,presetId,'Not accepted',actor);
  if(operation==='applied')await f.service.recordConfigStatus(control(status('applied')));
  if(operation==='connection')await f.service.recordConnectionStatus(control({schemaVersion:'1.1',messageType:'status',messageId:'presence',
   gatewayId:'GW-001',sessionId:'session',firmwareVersion:'2.4',status:'online',appliedConfigVersion:1,appliedConfigHash:'a'.repeat(64)}));
  if(operation==='rotate')await f.service.rotateCredential(gatewayId,actor);
  assert.equal(siteLocked,true);assert.ok(f.committed.length>0);
 });
}

test('read-only configuration state and proposals do not acquire transaction row locks',async()=>{
 const f=fixture();await f.service.syncState(gatewayId);await f.service.proposals(gatewayId);
 assert.ok(!f.calls.some(c=>/FOR (UPDATE|KEY SHARE|SHARE)|BEGIN/.test(c.sql)));
});

for(const change of ['moved','retired','external identity','broker'] as const){
 test(`mutation revalidates gateway ${change} after selecting and locking its original site`,async()=>{
  const f=fixture();let siteLocked=false;
  const connect=f.db.pool.connect.bind(f.db.pool);
  f.db.pool.connect=(async()=>{
   const client=await connect();const query=client.query.bind(client);
   return {...client,query:async(sql:string,values:unknown[]=[])=>{
    if(/FROM sites/.test(sql)&&sql.includes('FOR KEY SHARE'))siteLocked=true;
    if(siteLocked&&/FROM gateways g/.test(sql)){
     const result=await query(sql,values);const row={...result.rows[0],
      ...(change==='moved'?{site_id:discoveryId}:change==='retired'?{retired_at:now}:
       change==='external identity'?{external_gateway_id:'OTHER'}:{mqtt_broker_id:discoveryId})};
     const matches=(column:string,actual:unknown)=>{const match=new RegExp(`g\\.${column}=\\$(\\d+)`).exec(sql);
      return !match||values[Number(match[1])-1]===actual;};
     const brokerMatch=/g\.mqtt_broker_id IS NOT DISTINCT FROM \$(\d+)::uuid/.exec(sql);
     return {rows:matches('site_id',row.site_id)&&matches('external_gateway_id',row.external_gateway_id)&&
      !(row.retired_at&&sql.includes('g.retired_at IS NULL'))&&
      (!brokerMatch||values[Number(brokerMatch[1])-1]===row.mqtt_broker_id)?[row]:[]};
    }
    return query(sql,values);
   }};
  }) as typeof f.db.pool.connect;
  await assert.rejects(f.service.recordProposal(control(proposal())),http(404));
  assert.deepEqual(f.committed,[]);assert.equal(f.rolledBack,true);
 });
}

// Break caught: late legacy rejection after a device lock can deadlock against
// approved configuration's gateway-first device planning, even with rollback.
function legacyControlRace(route:'upgrade'|'register'|'reception'|'ingestion'|'comparison'|'legacy ingestion',phase:'approve'|'apply',order:'legacy'|'control'){
 const current={...existingMeter(),billing:false,billing_bound:false};
 const base=fixture({active:1,desired:2,existingRows:[current],desiredDevices:[meter()],proposalDevices:[meter()]});
 const firstLocked=deferred(),secondWaiting=deferred(),continueFirst=deferred();
 const holders=new Map<string,number>(),waiting=new Map<number,number>(),wakeups:(()=>void)[]=[];
 let sequence=0,gated=false,controlCommitted=false,legacyWrites=0;
 const lock=async(tx:number,key:string)=>{
  while(holders.has(key)&&holders.get(key)!==tx){
   const blocker=holders.get(key)!;waiting.set(tx,blocker);secondWaiting.resolve();
   let next:number|undefined=blocker;const seen=new Set<number>();
   while(next!==undefined&&!seen.has(next)){if(next===tx)throw Object.assign(new Error('simulated legacy/control device-gateway deadlock'),{code:'40P01'});seen.add(next);next=waiting.get(next);}
   await new Promise<void>(done=>wakeups.push(done));
  }
  waiting.delete(tx);holders.set(key,tx);
  if(!gated){gated=true;firstLocked.resolve();await continueFirst.promise;}
 };
 const release=(tx:number)=>{waiting.delete(tx);for(const [key,id]of holders)if(id===tx)holders.delete(key);wakeups.splice(0).forEach(wake=>wake());};
 const db=base.db,original=db.query.bind(db);
 const context={gatewayId,id:gatewayId,site_id:siteId,externalSiteId:'SELECTED',externalGatewayId:'GW-001',
  endpoint:'solar/v1/sites/SELECTED/gateways/GW-001/devices/+/telemetry'};
 db.query=(async(sql:string,values:unknown[]=[])=>{
  if(route==='comparison'&&sql.includes('FROM system_settings'))return {rows:[]};
  if(route==='legacy ingestion'&&sql.includes('FROM register_mapping_versions'))return {rows:[]};
  if(route==='legacy ingestion'&&sql.includes('FROM devices d JOIN gateways g'))return {rows:[{deviceId:presetId,siteId,gatewayId,gatewayName:'GW-001',endpoint:'energy/GW-001/#'}]};
  if(route==='ingestion'&&sql.includes('FROM devices d JOIN gateways g'))return {rows:[{deviceId:presetId,siteId,gatewayId,
   externalSiteId:'SELECTED',externalGatewayId:'GW-001',externalDeviceId:'M1',revisionId:meterProfileId,config:current.profile_config,billing:false}]};
  if(route==='ingestion'&&/FROM (device_profile_assignments|payload_messages)/.test(sql))return {rows:[]};
  if(sql.includes('AS "gatewayId"')&&sql.includes('FROM gateways g'))return {rows:[context]};
  if(sql.includes('FROM devices d'))return {rows:[{externalDeviceId:'M1',config:current.profile_config}]};
  return original(sql,values);
 }) as typeof db.query;
 db.pool.connect=(async()=>{
  const tx=++sequence,kind=tx===1?order:order==='legacy'?'control':'legacy';
  const query=async(sql:string,values:unknown[]=[])=>{
   if(sql==='BEGIN')return {rows:[]};
   if(sql==='COMMIT'){if(kind==='control')controlCommitted=true;release(tx);return {rows:[]};}
   if(sql==='ROLLBACK'){release(tx);return {rows:[]};}
   if(sql.includes('FROM gateway_payload_receive_revisions'))return {rows:[]};
   if(/FROM gateways[\s\S]*FOR (UPDATE|KEY SHARE)|^UPDATE gateways/.test(sql))await lock(tx,'gateway');
   if(/FROM devices[\s\S]*FOR (UPDATE|SHARE)/.test(sql))await lock(tx,'device');
   if(route==='ingestion'&&sql.includes('INSERT INTO payload_messages')){await lock(tx,'gateway');await lock(tx,'device');}
   if(route==='comparison'&&sql.includes('INSERT INTO measurement_comparison_pairs'))await lock(tx,'gateway');
   // energy_raw_dirty inserts energy_dirty_days, whose device FK takes a
   // reference lock before the legacy ingestion transaction updates gateway.
   if(route==='legacy ingestion'&&sql.includes('INSERT INTO telemetry_raw'))await lock(tx,'device');
   if(kind==='legacy'&&/^(INSERT|UPDATE|DELETE)/.test(sql.trim()))legacyWrites++;
   if(route==='legacy ingestion'&&sql.includes('FROM gateways WHERE'))return {rows:[{id:gatewayId,site_id:siteId,protocol:'mqtt',mqtt_broker_id:broker,endpoint:'energy/GW-001/#'}]};
   if(sql.includes('AS "controlManaged"'))return {rows:[{...context,version:1,controlManaged:true}]};
   if(route==='ingestion'&&sql.includes('SELECT payload_profile_revision_id'))return {rows:[{revisionId:meterProfileId}]};
   if(route==='ingestion'&&sql.includes('SELECT billing_source_binding_id'))return {rows:[]};
   if(route==='comparison'&&sql.startsWith('SELECT d.id,p.config'))return {rows:[{id:presetId,config:current.profile_config},{id:discoveryId,config:current.profile_config}]};
   if(sql.includes('FROM devices')&&!sql.includes('JOIN payload_profile_revisions'))return {rows:[{...current,profile_device_type:'energy-meter'}]};
   return original(sql,values);
  };
  return {query,release(){}};
 }) as typeof db.pool.connect;
 const assets=new AssetsController(db,{} as MqttIngestionService),telemetry=new TelemetryController(db,{} as MqttIngestionService);
 return {legacy:()=>route==='upgrade'?assets.upgradePayloadProfile(presetId,{localOverrideConfig:current.profile_config}):
  route==='register'?telemetry.saveDeviceRegisterMapping(presetId,{semanticField:'voltage',registerAddress:'1',dataType:'uint16',scale:1,unit:'V'}):
  route==='reception'?new PayloadReceptionSettings(db).save(siteId,{baseVersion:0,config:{}}):
  route==='comparison'?new MeasurementComparisons(db).create(gatewayId,{leftDeviceId:presetId,rightDeviceId:discoveryId,
   leftTag:'energy.active.import.total',rightTag:'energy.active.import.total',kind:'energy'}):
  route==='legacy ingestion'?new MqttIngestionService(db,db as unknown as import('../telemetry/ingestion-database.service.js').IngestionDatabaseService)
   .handleIncomingMessage('energy/GW-001/telemetry',JSON.stringify({deviceId:presetId,gateway:'GW-001',timestamp:now,metrics:{totalEnergy:100}}),undefined,broker):
  new PayloadIngestion(db).accept('solar/v1/sites/SELECTED/gateways/GW-001/devices/M1/telemetry',{
   schemaVersion:'1.1',messageType:'telemetry',messageId:'concurrent-ingest',sequence:1,lotNumber:1,siteId:'SELECTED',gatewayId:'GW-001',
   device:{deviceId:'M1',deviceType:'energy-meter',profileId:'sender-meter',profileVersion:'1.0.0'},pollGroup:'energy',
   timestamps:{polledAt:now,sentAt:now},data:{values:{'energy.active.import.total':123000},units:{'energy.active.import.total':'Wh'}},
   quality:{status:'good',communication:'online'}},broker),
  control:()=>phase==='approve'?base.service.approveProposal(gatewayId,presetId,{expectedProposalId:'proposal-1',expectedBaseConfigVersion:1},actor):base.service.recordConfigStatus(control(status('applied','a'.repeat(64),2))),
  firstLocked,secondWaiting,continueFirst,get legacyWrites(){return legacyWrites;},get controlCommitted(){return controlCommitted;}};
}

for(const order of ['legacy','control'] as const)test(`registered ingestion and real apply serialize ${order}-first without device/gateway FK cycle`,{timeout:5000},async()=>{
 const f=legacyControlRace('ingestion','apply',order),settle=<T>(work:Promise<T>)=>work.then(value=>({value,error:undefined}),error=>({value:undefined,error}));
 const first=settle(order==='legacy'?f.legacy():f.control());await f.firstLocked.promise;
 const second=settle(order==='legacy'?f.control():f.legacy());await f.secondWaiting.promise;f.continueFirst.resolve();
 const results=await Promise.all([first,second]);
 assert.equal(results[0]!.error,undefined);assert.equal(results[1]!.error,undefined);
 assert.ok(results[order==='legacy'?0:1]!.value);assert.equal(f.controlCommitted,true);
});

for(const route of ['comparison','legacy ingestion'] as const)for(const order of ['legacy','control'] as const)test(`${route} and real apply serialize ${order}-first without device/gateway reference cycle`,{timeout:5000},async()=>{
 const f=legacyControlRace(route,'apply',order),settle=<T>(work:Promise<T>)=>work.then(value=>({value,error:undefined}),error=>({value:undefined,error}));
 const first=settle(order==='legacy'?f.legacy():f.control());await f.firstLocked.promise;
 const second=settle(order==='legacy'?f.control():f.legacy());await f.secondWaiting.promise;f.continueFirst.resolve();
 const results=await Promise.all([first,second]);
 assert.equal(results[0]!.error,undefined);assert.equal(results[1]!.error,undefined);assert.equal(f.controlCommitted,true);
});

for(const route of ['upgrade','register','reception'] as const)for(const phase of ['approve','apply'] as const)for(const order of ['legacy','control'] as const){
 test(`${route} versus ${phase}, ${order}-first rejects managed legacy before writes without a device/gateway cycle`,{timeout:5000},async()=>{
  const f=legacyControlRace(route,phase,order);
  const settle=<T>(work:Promise<T>)=>work.then(value=>({value,error:undefined}),error=>({value:undefined,error}));
  const first=settle(order==='legacy'?f.legacy():f.control());await f.firstLocked.promise;
  const second=settle(order==='legacy'?f.control():f.legacy());await f.secondWaiting.promise;
  f.continueFirst.resolve();const results=await Promise.all([first,second]);
  const legacy=results[order==='legacy'?0:1],applied=results[order==='legacy'?1:0];
  assert.ok(http(409)(legacy!.error));assert.equal(applied!.error,undefined);
  assert.equal(f.legacyWrites,0);assert.equal(f.controlCommitted,true);
 });
}
