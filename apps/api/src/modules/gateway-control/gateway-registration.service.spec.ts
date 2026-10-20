import assert from 'node:assert/strict';
import test from 'node:test';
import type { GatewayRegisterPayload } from '@solar/api-contracts';
import type { DatabaseService } from '../../database/database.service.js';
import { GatewayRegistrationService } from './gateway-registration.service.js';

const broker = '11111111-1111-4111-8111-111111111111';
const discoveryId = '22222222-2222-4222-8222-222222222222';
const sentAt = '2026-10-19T08:00:00+07:00';
function report(messageId = 'reg-1'): GatewayRegisterPayload {
  return {
    schemaVersion: '1.1', messageType: 'register', messageId, sentAt,
    gateway: { gatewayId: 'GW-001', model: 'Gateway-X', firmwareVersion: '2.4' },
    reportedSiteId: 'UNCONFIRMED',
    devices: [{ deviceId: 'M1', manufacturer: ' Schneider Electric ', model: 'PM-2230',
      profileId: 'Schneider_PM2230', profileVersion: '9.9.9', firmwareVersion: '7.0', serialNumber: 'SERIAL-42',
      deviceType: 'energy-meter', protocol: 'modbus-tcp', connection: { host: '192.0.2.10', port: 502, slaveId: 3 },
      pollGroups: ['energy'], mappings: [{ tag: 'energy.active.import.total', registerAddress: '3204',
        registerCount: 2, dataType: 'uint32', byteOrder: 'big_endian', wordOrder: 'big_word_first',
        scale: 0.01, offset: 2, displayName: 'Import', pollGroup: 'energy', sourceUnit: 'Wh', targetUnit: 'kWh', conversion: 'wh-to-kwh' }] },
    { deviceId: 'UNKNOWN', model: 'Uncatalogued', profileVersion: 'future', connection: { serialPort: '/dev/ttyS9' } }],
  };
}
function row(payload = report(), revision = 1) {
  return { id: discoveryId, externalGatewayId: 'GW-001', mqttBrokerId: broker, clientId: 'GW-001',
    reportedSiteId: payload.reportedSiteId, reportedDeviceId: 'M1', manufacturer: ' Schneider Electric ',
    model: 'Gateway-X', firmwareVersion: '2.4', profileId: 'Schneider_PM2230', protocol: 'modbus-tcp',
    status: 'unassigned', assignedSiteId: null, assignedGatewayId: null, assignedAt: null,
    sourceAddress: '192.0.2.20', firstSeenAt: '2026-10-19T01:00:00Z', lastSeenAt: '2026-10-19T01:00:00Z',
    discoveryRevision: revision, rawPayload: payload, devices: payload.devices, onboardingState: 'ready' as const };
}
type Step = { sql: RegExp; rows?: unknown[]; check?: (values: unknown[], sql: string) => void };
function database(steps: Step[]) {
  let transactions = 0;
  const query = async (sql: string, values: unknown[] = []) => {
    const step = steps.shift();
    assert.ok(step, `Unexpected query: ${sql}`);
    assert.match(sql, step.sql);
    step.check?.(values, sql);
    return { rows: structuredClone(step.rows ?? []) };
  };
  const db = { query, transaction: async (work: (client: { query: typeof query }) => Promise<unknown>) => {
    transactions++;
    return work({ query });
  } };
  return { service: new GatewayRegistrationService(db as unknown as DatabaseService),
    done() { assert.equal(steps.length, 0, 'All required database operations ran'); },
    get transactions() { return transactions; } };
}
const input = (payload = report()) => ({ brokerId: broker, clientId: 'GW-001', sourceAddress: '192.0.2.20', payload });
function lockingSteps(existing: ReturnType<typeof row> | null = null, brokerId: string | null = broker): Step[] {
  return [
    { sql: /pg_advisory_xact_lock/, check: values => assert.deepEqual(values, [JSON.stringify([brokerId ?? 'default', 'GW-001'])]) },
    { sql: /FROM discovered_gateways[\s\S]*FOR UPDATE/, rows: existing ? [existing] : [], check: values => assert.deepEqual(values, [brokerId, 'GW-001']) },
  ];
}
function loadSteps(payload = report(), revision = 1): Step[] {
  return [
    { sql: /FROM discovered_gateways/, rows: [{ ...row(payload, revision), snapshot: payload }] },
    { sql: /FROM meter_presets[\s\S]*payload_profile_revisions/, rows: [] },
    { sql: /FROM meter_presets[\s\S]*payload_profile_revisions/, rows: [] },
  ];
}

// Break caught: dropping a reported field, writing the wrong identity/revision, or
// creating active resources instead of a discovery snapshot must fail this test.
test('persists a complete anonymous snapshot in one transaction under the broker identity lock', async () => {
  const payload = report();
  const f = database([
    ...lockingSteps(),
    { sql: /INSERT INTO discovered_gateways/, rows: [row()], check: (values, sql) => {
      assert.match(sql, /ON CONFLICT\s*\(\(coalesce\(mqtt_broker_id::text,\s*'default'\)\),\s*external_gateway_id\)/i);
      assert.deepEqual(values.slice(0, 10), [broker, 'GW-001', 'GW-001', 'UNCONFIRMED', 'M1', ' Schneider Electric ', 'Gateway-X', 'Schneider_PM2230', 'modbus-tcp', '2.4']);
      assert.deepEqual(JSON.parse(String(values[10])), payload);
      assert.deepEqual(JSON.parse(String(values[11])), payload.devices);
      assert.equal(values[12], '192.0.2.20');
    } },
    { sql: /FROM gateway_discovery_snapshots[\s\S]*message_id/, rows: [] },
    { sql: /FROM gateway_discovery_snapshots[\s\S]*received_at[\s\S]*LIMIT 12/, rows: [] },
    { sql: /INSERT INTO gateway_discovery_snapshots/, check: values => {
      assert.deepEqual(values.slice(0, 3), [discoveryId, 1, 'reg-1']);
      assert.deepEqual(JSON.parse(String(values[3])), payload);
      assert.equal(values[4], '192.0.2.20');
    } },
    ...loadSteps(),
  ]);
  const detail = await f.service.record(input(payload));
  assert.equal(detail.discoveryRevision, 1);
  assert.equal(detail.status, 'unassigned');
  assert.deepEqual(detail.snapshot, payload);
  assert.deepEqual(detail.devices, payload.devices);
  assert.deepEqual(detail.draftDevices, payload.devices.map(device => ({ ...device, mappingSource: 'gateway' })));
  assert.equal(f.transactions, 1);
  f.done();
});

// Break caught: replay must not hit quota, write a new revision, or return a newer snapshot.
test('duplicate message IDs return the original logical revision even after a newer report', async () => {
  const newer = report('reg-2');
  newer.gateway.firmwareVersion = '3.0';
  const detailSteps = loadSteps();
  detailSteps[0]!.check = (values, sql) => {
    assert.deepEqual(values, [discoveryId, 1]);
    assert.match(sql, /s\.revision[\s\S]*\$2/);
  };
  const f = database([
    ...lockingSteps(row(newer, 2)),
    { sql: /FROM gateway_discovery_snapshots[\s\S]*message_id/, rows: [{ revision: 1 }] },
    ...detailSteps,
  ]);
  const result = await f.service.record(input());
  assert.equal(result.discoveryRevision, 1);
  assert.equal(result.snapshot.gateway.firmwareVersion, '2.4');
  f.done();
});

function existingWriteSteps(payload: GatewayRegisterPayload, count = 0): Step[] {
  return [
    ...lockingSteps(row()),
    { sql: /FROM gateway_discovery_snapshots[\s\S]*message_id/, rows: [] },
    { sql: /FROM gateway_discovery_snapshots[\s\S]*received_at[\s\S]*LIMIT 12/, rows: Array.from({ length: count }, () => ({ id: 'accepted' })),
      check: (values, sql) => {
        assert.deepEqual(values, [discoveryId, '192.0.2.20']);
        assert.match(sql, /source_address/);
        assert.match(sql, /interval '1 minute'/);
      } },
    { sql: /UPDATE discovered_gateways/, rows: [row(payload, 2)], check: (values, sql) => {
      assert.match(sql, /discovery_revision\s*=\s*discovery_revision\s*\+\s*1/);
      assert.match(sql, /status\s*=\s*'unassigned'/);
      assert.deepEqual(JSON.parse(String(values[1])), payload);
      assert.deepEqual(JSON.parse(String(values[2])), payload.devices);
      assert.equal(values[0], discoveryId);
      assert.equal(values[3], '192.0.2.20');
    } },
    { sql: /INSERT INTO gateway_discovery_snapshots/, check: values => {
      assert.deepEqual(values.slice(0, 3), [discoveryId, 2, payload.messageId]);
      assert.deepEqual(JSON.parse(String(values[3])), payload);
    } },
    ...loadSteps(payload, 2),
  ];
}

// Break caught: coalescing device arrays would retain removed devices/mappings.
test('a later pre-approval report replaces the complete draft and increments its revision', async () => {
  const payload = report('reg-2');
  payload.devices = [{ deviceId: 'REPLACEMENT' }];
  const steps = existingWriteSteps(payload);
  steps.pop(); // One suggestion query for the single replacement device.
  const f = database(steps);
  const detail = await f.service.record(input(payload));
  assert.equal(detail.discoveryRevision, 2);
  assert.equal(detail.onboardingState, 'ready');
  assert.deepEqual(detail.devices, [{ deviceId: 'REPLACEMENT' }]);
  assert.deepEqual(detail.draftDevices, [{ deviceId: 'REPLACEMENT', mappingSource: 'gateway' }]);
  f.done();
});

for (const status of ['configuring', 'assigned', 'ignored'] as const)
test(`registration cannot overwrite a ${status} discovery`, async () => {
  const existing = { ...row(), status };
  const f = database([
    ...lockingSteps(existing as ReturnType<typeof row>),
    { sql: /FROM gateway_discovery_snapshots[\s\S]*message_id/, rows: [] },
  ]);
  await assert.rejects(f.service.record(input()), /pre-approval|unassigned|configuration/i);
  f.done();
});

// Break caught: a >=11 check rejects the twelfth, a >12 check permits the thirteenth.
test('accepts the twelfth unique registration in the durable one-minute source window', async () => {
  const f = database(existingWriteSteps(report('twelfth'), 11));
  await f.service.record(input(report('twelfth')));
  f.done();
});
test('rejects the thirteenth registration before changing the draft', async () => {
  const steps = existingWriteSteps(report('thirteenth'), 12).slice(0, 4);
  const f = database(steps);
  await assert.rejects(f.service.record(input(report('thirteenth'))), /rate limit|12 registrations/i);
  f.done();
});

// Break caught: accepting a client/topic mismatch or skipping strict parser validation.
for (const [name, patch] of [
  ['client', { clientId: 'GW-OTHER' }],
  ['topic gateway', { topic: 'solar/v1/gateways/GW-OTHER/register' }],
  ['topic kind', { topic: 'solar/v1/gateways/GW-001/status' }],
  ['topic shape', { topic: 'solar/v1/gateways/GW-001/register/extra' }],
  ['spoofed broker in payload', { payload: { ...report(), brokerId: broker } }],
  ['invalid device snapshot', { payload: { ...report(), devices: [{ deviceId: 'M1', fabricated: true }] } }],
] as const)
test(`rejects ${name} before accessing persistence`, async () => {
  const f = database([]);
  await assert.rejects(f.service.record({ ...input(), ...patch }));
  assert.equal(f.transactions, 0);
  f.done();
});

// Break caught: default scopes must share a lock and row, including a concurrent
// legacy telemetry insertion that wins before this service's ON CONFLICT.
for (const brokerId of [broker, '33333333-3333-4333-8333-333333333333', null, undefined])
test(`resolves an insert race only within broker scope ${brokerId ?? 'default'}`, async () => {
  const steps = existingWriteSteps(report('race'));
  steps.splice(0, 2, ...lockingSteps(null, brokerId ?? null),
    { sql: /INSERT INTO discovered_gateways/, rows: [], check: values => assert.equal(values[0], brokerId ?? null) },
    { sql: /FROM discovered_gateways[\s\S]*FOR UPDATE/, rows: [{ ...row(), mqttBrokerId: brokerId ?? null }],
      check: values => assert.deepEqual(values, [brokerId ?? null, 'GW-001']) });
  const f = database(steps);
  await f.service.record({ ...input(report('race')), brokerId });
  f.done();
});

for (const sourceAddress of [null, undefined, '', '   '])
test(`normalizes absent source ${JSON.stringify(sourceAddress)} for the durable quota`, async () => {
  const steps = existingWriteSteps(report('source'));
  steps[3]!.check = values => assert.deepEqual(values, [discoveryId, null]);
  steps[4]!.check = values => assert.equal(values[3], null);
  steps[5]!.check = values => assert.equal(values[4], null);
  const f = database(steps);
  await f.service.record({ ...input(report('source')), sourceAddress });
  f.done();
});

const candidates = [
  { kind: 'register', id: 'meter-a', manufacturer: 'Schneider Electric', model: 'PM 2230', profileId: null, version: null, deviceType: 'meter' },
  { kind: 'profile', id: 'profile-b', manufacturer: null, model: null, profileId: 'schneider-pm2230', version: '1.0.0', deviceType: 'energy-meter' },
  { kind: 'register', id: 'meter-c', manufacturer: 'SCHNEIDER-ELECTRIC', model: 'pm2230', profileId: null, version: null, deviceType: 'meter' },
  { kind: 'register', id: 'other', manufacturer: 'Other', model: 'Different', profileId: null, version: null, deviceType: 'meter' },
];

// Break caught: choosing a preset silently, changing the report, ignoring version
// mismatches, or returning an unrelated model as a match.
test('ranks normalized preset suggestions without selecting one or modifying the reported mapping', async () => {
  const payload = report();
  const steps = loadSteps();
  steps[1] = { sql: /FROM meter_presets[\s\S]*payload_profile_revisions/, rows: candidates,
    check: (values, sql) => {
      assert.deepEqual(values, ['schneiderelectric', 'pm2230', 'schneiderpm2230', '9.9.9']);
      assert.match(sql, /owner_device_id IS NULL/);
      assert.match(sql, /payload_preset_archives/);
      assert.match(sql, /LIMIT 50/);
      assert.match(sql, /ORDER BY/);
    } };
  const f = database(steps);
  const detail = await f.service.detail(discoveryId);
  assert.deepEqual(detail.snapshot, payload);
  assert.deepEqual(detail.draftDevices[0]!.mappings, payload.devices[0]!.mappings);
  assert.equal(detail.draftDevices[0]!.mappingSource, 'gateway');
  assert.equal('presetId' in detail.draftDevices[0]!, false);
  const suggestions = detail.presetSuggestions[0]!.suggestions;
  assert.deepEqual(suggestions.map(suggestion => suggestion.id), ['profile-b', 'meter-a', 'meter-c']);
  assert.deepEqual(suggestions.map(suggestion => suggestion.rank), [100, 80, 80]);
  assert.equal(suggestions[0]!.versionMatch, false);
  assert.deepEqual(suggestions[0]!.matches, ['profileId']);
  assert.deepEqual(detail.presetSuggestions[1], { deviceId: 'UNKNOWN', suggestions: [] });
  f.done();
});

test('unknown model and version retain every supplied field for manual completion', async () => {
  const payload = report();
  const steps = loadSteps();
  // An unknown device must issue its own normalized lookup, not inherit M1's match.
  steps[2]!.check = values => assert.deepEqual(values, ['', 'uncatalogued', '', 'future']);
  const f = database(steps);
  const detail = await f.service.detail(discoveryId);
  assert.deepEqual(detail.devices[1], { deviceId: 'UNKNOWN', model: 'Uncatalogued', profileVersion: 'future', connection: { serialPort: '/dev/ttyS9' } });
  assert.deepEqual(detail.draftDevices[1], { deviceId: 'UNKNOWN', model: 'Uncatalogued', profileVersion: 'future', connection: { serialPort: '/dev/ttyS9' }, mappingSource: 'gateway' });
  assert.equal('mappings' in detail.draftDevices[1]!, false);
  assert.equal('pollGroups' in detail.draftDevices[1]!, false);
  assert.deepEqual(payload, report());
  f.done();
});

test('equal-rank presets remain explicit suggestions in stable order', async () => {
  const steps = loadSteps();
  steps[1]!.rows = [candidates[2], candidates[0]];
  const f = database(steps);
  const detail = await f.service.detail(discoveryId);
  assert.deepEqual(detail.presetSuggestions[0]!.suggestions.map(s => [s.id, s.rank]), [['meter-a', 80], ['meter-c', 80]]);
  assert.equal('presetId' in detail.draftDevices[0]!, false);
  f.done();
});

for (const status of ['unassigned', 'configuring', 'assigned', 'ignored', undefined] as const)
test(`lists bounded discovery summaries for ${status ?? 'all states'} without writing resources`, async () => {
  const registrationRequired={...row(),clientId:'legacy-telemetry-client',onboardingState:'registration_required' as const};
  const f = database([{ sql: /FROM discovered_gateways/, rows: [row(),registrationRequired], check: (values, sql) => {
    assert.deepEqual(values, [status ?? null]);
    assert.match(sql, /status\s*=\s*\$1/);
    assert.match(sql, /ORDER BY d\.last_seen_at DESC,d\.id/);
    assert.match(sql, /LIMIT 200/);
    assert.match(sql, /gateway_discovery_snapshots/);
    assert.match(sql, /"onboardingState"/);
    assert.match(sql, /d\.client_id=d\.external_gateway_id/);
    assert.match(sql, /ready_snapshot\.revision=d\.discovery_revision/);
  } }]);
  const results = await f.service.list(status);
  assert.deepEqual(results[0]?.devices, report().devices);
  assert.equal(results[0]?.mqttBrokerId, broker);
  assert.equal(results[0]?.discoveryRevision, 1);
  assert.equal(results[0]?.onboardingState, 'ready');
  assert.equal(results[1]?.onboardingState, 'registration_required');
  assert.equal(f.transactions, 0);
  f.done();
});

test('invalid list status cannot accidentally turn a filtered request into an unfiltered query', async () => {
  const f = database([]);
  await assert.rejects(f.service.list('unexpected'), /status/i);
  f.done();
});

test('detail reports a missing registration instead of fabricating a snapshot', async () => {
  const f = database([{ sql: /FROM discovered_gateways/, rows: [] }]);
  await assert.rejects(f.service.detail(discoveryId), /not found/i);
  f.done();
});

test('legacy telemetry discovery without a current registration snapshot reports a stable pairing prerequisite', async () => {
  const f = database([{ sql: /LEFT JOIN gateway_discovery_snapshots/, rows: [{ ...row(), snapshot: null }] }]);
  await assert.rejects(f.service.detail(discoveryId), error => {
    const response=(error as {getResponse?:()=>unknown}).getResponse?.() as {statusCode?:number;code?:string}|undefined;
    assert.equal(response?.statusCode,409);
    assert.equal(response?.code,'GATEWAY_REGISTRATION_REQUIRED');
    return true;
  });
  f.done();
});

test('discovery with a snapshot but mismatched broker client identity also requires registration', async () => {
  const f = database([{ sql: /LEFT JOIN gateway_discovery_snapshots/, rows: [{ ...row(), clientId: 'spoofed-client', snapshot: report() }] }]);
  await assert.rejects(f.service.detail(discoveryId), error => {
    const response=(error as {getResponse?:()=>unknown}).getResponse?.() as {code?:string}|undefined;
    assert.equal(response?.code,'GATEWAY_REGISTRATION_REQUIRED');
    return true;
  });
  f.done();
});

test('GatewayControlModule provides registration through the database module once in AppModule', async () => {
  // Nest consumes this metadata to wire the real provider; no source-text checks.
  const { GatewayControlModule } = await import('./gateway-control.module.js');
  const { AppModule } = await import('../../app.module.js');
  const { DatabaseModule } = await import('../../database/database.module.js');
  assert.ok(Reflect.getMetadata('imports', GatewayControlModule).includes(DatabaseModule));
  assert.ok(Reflect.getMetadata('providers', GatewayControlModule).includes(GatewayRegistrationService));
  assert.ok(Reflect.getMetadata('exports', GatewayControlModule).includes(GatewayRegistrationService));
  assert.equal(Reflect.getMetadata('imports', AppModule).filter((module: unknown) => module === GatewayControlModule).length, 1);
});

// Break caught: historical replay must not combine an old snapshot with current
// gateway metadata or the next device's protocol/manufacturer.
test('replay detail derives all reported metadata from its own historical snapshot', async () => {
  const payload = report();
  const current = report('newer');
  current.gateway.model = 'New-model';
  current.gateway.firmwareVersion = 'New-firmware';
  const steps = loadSteps();
  steps[0]!.rows = [{ ...row(current, 2), model: 'New-model', firmwareVersion: 'New-firmware', manufacturer: 'New-maker',
    profileId: 'new-profile', protocol: 'new-protocol', reportedDeviceId: 'NEW', reportedSiteId: 'NEW-SITE', snapshot: payload, discoveryRevision: 1 }];
  const f = database(steps);
  const detail = await f.service.detail(discoveryId);
  assert.equal(detail.model, 'Gateway-X');
  assert.equal(detail.firmwareVersion, '2.4');
  assert.equal(detail.manufacturer, ' Schneider Electric ');
  assert.equal(detail.profileId, 'Schneider_PM2230');
  assert.equal(detail.protocol, 'modbus-tcp');
  assert.equal(detail.reportedDeviceId, 'M1');
  assert.equal(detail.reportedSiteId, 'UNCONFIRMED');
  f.done();
});

// Break caught: BEGIN's default now() timestamp can be old after waiting on an
// identity lock, allowing accepted registrations to fall outside the quota.
test('snapshot receipt time is measured when it is persisted after the identity lock', async () => {
  const steps = existingWriteSteps(report('fresh-receipt'));
  steps[5]!.check = (_values, sql) => {
    assert.match(sql, /received_at/);
    assert.match(sql, /clock_timestamp\(\)/);
  };
  const f = database(steps);
  await f.service.record(input(report('fresh-receipt')));
  f.done();
});
