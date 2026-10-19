import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { gatewayConfigHash, gatewayControlTopic, parseGatewayControlPayload, parseGatewayControlTopic } from './gateway-control-payload.js';

const sentAt = '2026-10-19T08:00:00+07:00';
const mapping = { tag: 'energy.active.import.total', registerAddress: '3204', registerCount: 2, dataType: 'uint32', byteOrder: 'big_endian', wordOrder: 'big_word_first', scale: 0.01, displayName: 'Import energy', sourceUnit: 'Wh', targetUnit: 'kWh', conversion: 'wh-to-kwh', pollGroup: 'energy' };
const device = { deviceId: 'M1', deviceType: 'energy-meter', enabled: true, protocol: 'modbus-tcp', connection: { host: '192.0.2.1', port: 502 }, mappingSource: 'manual', pollGroups: ['energy'], mappings: [mapping] };
const register = { schemaVersion: '1.1', messageType: 'register', messageId: 'msg-1', sentAt, gateway: { gatewayId: 'GW-001', model: 'reported-model', firmwareVersion: 'reported-firmware' }, devices: [{ deviceId: 'M1' }, { deviceId: 'M2' }] };
const config = { schemaVersion: '1.1', messageType: 'config', messageId: 'msg-2', gatewayId: 'GW-001', siteId: 'S1', configVersion: 1, configHash: 'a'.repeat(64), issuedAt: sentAt, approvedBy: 'admin-1', devices: [device] };
const update = { schemaVersion: '1.1', messageType: 'configUpdate', messageId: 'msg-3', gatewayId: 'GW-001', siteId: 'S1', proposalId: 'proposal-1', baseConfigVersion: 1, sentAt, devices: [device] };
const configStatus = { schemaVersion: '1.1', messageType: 'configStatus', messageId: 'msg-4', gatewayId: 'GW-001', configVersion: 1, configHash: 'a'.repeat(64), status: 'applied', reportedAt: sentAt };
const status = { schemaVersion: '1.1', messageType: 'status', messageId: 'msg-5', gatewayId: 'GW-001', sessionId: 'boot-1', firmwareVersion: 'reported-firmware', status: 'online', appliedConfigVersion: 1, appliedConfigHash: 'a'.repeat(64), reportedAt: sentAt };

test('builds and parses only the five exact gateway control topics', () => {
  for (const kind of ['register', 'config', 'configUpdate', 'configStatus', 'status'] as const) {
    assert.equal(gatewayControlTopic('GW-001', kind), `solar/v1/gateways/GW-001/${kind}`);
    assert.deepEqual(parseGatewayControlTopic(`solar/v1/gateways/GW-001/${kind}`), { gatewayId: 'GW-001', kind });
  }
  for (const topic of ['solar/v1/sites/S1/gateways/GW-001/configStatus', 'solar/v1/gateways/GW-001/configAck', 'solar/v1/gateways/GW-001/status/extra', 'solar/v1/gateways//register', 'solar/v1/gateways/GW.001/register', 'solar/v1/gateways/+/register', `solar/v1/gateways/${'G'.repeat(129)}/status`]) assert.equal(parseGatewayControlTopic(topic), null);
  for (const id of ['', 'a/b', '+', '#', 'GW-001\n', 'G'.repeat(129)]) assert.throws(() => gatewayControlTopic(id, 'register'));
  assert.throws(() => gatewayControlTopic('GW-001', 'configAck' as never));
});

test('parses all five payloads and requires their matching discriminator', () => {
  assert.equal(parseGatewayControlPayload('register', register).devices.length, 2);
  assert.equal(parseGatewayControlPayload('config', config).devices[0]?.mappings[0]?.scale, 0.01);
  assert.equal(parseGatewayControlPayload('configUpdate', update).proposalId, 'proposal-1');
  assert.equal(parseGatewayControlPayload('configStatus', configStatus).status, 'applied');
  assert.equal(parseGatewayControlPayload('status', status).sessionId, 'boot-1');
  for (const kind of ['register', 'config', 'configUpdate', 'status'] as const) assert.throws(() => parseGatewayControlPayload(kind, configStatus));
});

test('registration requires the complete device array and strict valid envelope fields', () => {
  for (const patch of [{ devices: undefined }, { schemaVersion: '1.0' }, { sentAt: '2026-10-19T08:00:00' }, { extra: true }, { gateway: { ...register.gateway, gatewayId: 'bad/id' } }]) assert.throws(() => parseGatewayControlPayload('register', { ...register, ...patch }));
  assert.deepEqual(parseGatewayControlPayload('register', { ...register, devices: [] }).devices, []);
  assert.throws(() => parseGatewayControlPayload('register', { ...register, gateway: { ...register.gateway, secret: 'no' } }));
});

test('accepts discovery without mappings and requires structural configuration arrays', () => {
  assert.equal(parseGatewayControlPayload('register', register).devices[0]?.deviceId, 'M1');
  for (const key of ['enabled', 'mappingSource', 'pollGroups', 'mappings']) {
    assert.throws(() => parseGatewayControlPayload('config', { ...config, devices: [{ ...device, [key]: undefined }] }));
  }
  assert.equal(parseGatewayControlPayload('config', { ...config, devices: [{ ...device, mappings: [] }] }).devices[0]?.mappings.length, 0);
  assert.throws(() => parseGatewayControlPayload('config', { ...config, devices: [{ ...device, mappings: [{ ...mapping, sourceUnit: undefined }] }] }));
});

test('enforces snapshot device limit at 32 and rejects duplicate device IDs', () => {
  const devices = Array.from({ length: 32 }, (_, i) => ({ deviceId: `M${i}` }));
  assert.equal(parseGatewayControlPayload('register', { ...register, devices }).devices.length, 32);
  assert.throws(() => parseGatewayControlPayload('register', { ...register, devices: [...devices, { deviceId: 'M32' }] }));
  assert.throws(() => parseGatewayControlPayload('register', { ...register, devices: [devices[0], devices[0]] }));
  for (const payload of [config, update]) assert.throws(() => parseGatewayControlPayload(payload.messageType as 'config' | 'configUpdate', { ...payload, devices: Array.from({ length: 33 }, (_, i) => ({ ...device, deviceId: `M${i}` })) }));
});

test('enforces per-device group and mapping limits including exact accepted bounds', () => {
  const pollGroups = Array.from({ length: 16 }, (_, i) => `group${i}`);
  const mappings = Array.from({ length: 256 }, (_, i) => ({ ...mapping, tag: `tag${i}`, registerAddress: `${i}`, pollGroup: 'group0' }));
  const bounded = { ...device, pollGroups, mappings };
  assert.equal(parseGatewayControlPayload('config', { ...config, devices: [bounded] }).devices[0]?.mappings.length, 256);
  for (const patch of [{ pollGroups: [...pollGroups, 'group16'] }, { mappings: [...mappings, { ...mapping, tag: 'tag256', registerAddress: '256', pollGroup: 'group0' }] }]) assert.throws(() => parseGatewayControlPayload('config', { ...config, devices: [{ ...bounded, ...patch }] }));
});

test('rejects duplicate groups, tags, and physical register identities on each snapshot kind', () => {
  const patches = [{ pollGroups: [device.pollGroups[0], device.pollGroups[0]] }, { mappings: [mapping, { ...mapping, registerAddress: '3206' }] }, { mappings: [mapping, { ...mapping, tag: 'another.tag' }] }];
  for (const kind of ['register', 'config', 'configUpdate'] as const) {
    const payload = kind === 'register' ? register : kind === 'config' ? config : update;
    const { enabled: _enabled, mappingSource: _source, ...reportedDevice } = device;
    const validDevice = kind === 'register' ? reportedDevice : device;
    assert.equal(parseGatewayControlPayload(kind, { ...payload, devices: [validDevice] }).devices.length, 1);
    for (const patch of patches) assert.throws(() => parseGatewayControlPayload(kind, { ...payload, devices: [{ ...validDevice, ...patch }] }));
  }
});

test('rejects numeric address aliases identifying the same physical register', () => {
  for (const registerAddress of ['R3204', '0xC84', '03204']) assert.throws(() => parseGatewayControlPayload('config', { ...config, devices: [{ ...device, mappings: [mapping, { ...mapping, tag: 'another.tag', registerAddress }] }] }));
});

test('requires valid versions, hashes, timestamps and apply/connection status values', () => {
  for (const patch of [{ configVersion: 0 }, { configVersion: 1.5 }, { configHash: 'invalid' }, { status: 'online' }, { reportedAt: 'yesterday' }]) assert.throws(() => parseGatewayControlPayload('configStatus', { ...configStatus, ...patch }));
  for (const value of ['received', 'applied', 'failed']) assert.equal(parseGatewayControlPayload('configStatus', { ...configStatus, status: value, ...(value === 'failed' ? { error: { code: 'APPLY_FAILED', deviceId: 'M1', tag: mapping.tag } } : {}) }).status, value);
  assert.throws(() => parseGatewayControlPayload('configStatus', { ...configStatus, status: 'failed' }));
  assert.throws(() => parseGatewayControlPayload('status', { ...status, status: 'unknown' }));
  assert.equal(parseGatewayControlPayload('status', { ...status, status: 'offline', reportedAt: undefined, appliedConfigVersion: null, appliedConfigHash: null }).status, 'offline');
});

test('limits the complete UTF-8 payload to exactly 256 KiB', () => {
  const base = { ...register, reportedSiteId: 'S1', devices: [{ deviceId: 'M1', connection: { note: '' } }] };
  const overhead = Buffer.byteLength(JSON.stringify(base), 'utf8');
  const atLimit = { ...base, devices: [{ deviceId: 'M1', connection: { note: 'x'.repeat(262144 - overhead) } }] };
  assert.equal(Buffer.byteLength(JSON.stringify(atLimit)), 262144);
  assert.equal(parseGatewayControlPayload('register', atLimit).devices.length, 1);
  assert.throws(() => parseGatewayControlPayload('register', { ...atLimit, devices: [{ deviceId: 'M1', connection: { note: `${atLimit.devices[0]!.connection.note}x` } }] }));
  assert.throws(() => parseGatewayControlPayload('register', { ...base, devices: [{ deviceId: 'M1', connection: { note: 'ก'.repeat(100000) } }] }));
});

test('hashes canonical UTF-8 JSON, sorting recursively and omitting every configHash', () => {
  // Literal canonical bytes are derived independently from the input traversal.
  const expected = createHash('sha256').update('{"a":{"b":2,"z":"ก"},"devices":[{"id":"B"},{"id":"A"}]}', 'utf8').digest('hex');
  const input = { devices: [{ configHash: 'ignored', id: 'B' }, { id: 'A' }], configHash: 'ignored', a: { z: 'ก', configHash: 'ignored', b: 2 } };
  assert.equal(gatewayConfigHash(input), expected);
  assert.equal(gatewayConfigHash({ a: { b: 2, z: 'ก' }, devices: [{ id: 'B' }, { id: 'A' }] }), expected);
  assert.notEqual(gatewayConfigHash({ ...input, devices: [{ id: 'A' }, { id: 'B' }] }), expected);
  assert.equal(input.configHash, 'ignored');
  assert.equal(input.a.configHash, 'ignored');
});

test('hashes integer-like connection keys in lexical order at every depth', () => {
  const expected = createHash('sha256').update('{"connection":{"10":"ten","2":"two","nested":[{"10":10,"2":2}]}}', 'utf8').digest('hex');
  const input = { connection: { '2': 'two', '10': 'ten', configHash: 'ignored', nested: [{ '2': 2, '10': 10, configHash: 'ignored' }] } };
  assert.equal(gatewayConfigHash(input), expected);
  assert.equal(gatewayConfigHash({ connection: { nested: [{ '10': 10, '2': 2 }], '10': 'ten', '2': 'two' } }), expected);
  assert.deepEqual(input.connection.nested, [{ '2': 2, '10': 10, configHash: 'ignored' }]);
});

test('hashing retains JSON scalar, omission, and array-null semantics', () => {
  const input = {
    omitted: undefined, callable: () => 1, symbol: Symbol('omit'),
    array: [undefined, () => 1, Symbol('null'), NaN, Infinity, -Infinity, , -0],
    values: { nil: null, yes: true, no: false, zero: -0, text: 'line\n"quoted"' },
    configHash: 1n,
  };
  const canonical = '{"array":[null,null,null,null,null,null,null,0],"values":{"nil":null,"no":false,"text":"line\\n\\"quoted\\"","yes":true,"zero":0}}';
  assert.equal(gatewayConfigHash(input), createHash('sha256').update(canonical, 'utf8').digest('hex'));
  for (const [value, bytes] of [[null, 'null'], [true, 'true'], [42, '42'], ['text', '"text"'], [NaN, 'null']] as const) {
    assert.equal(gatewayConfigHash(value), createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(input.configHash, 1n);
  assert.equal(input.array.length, 8);
});

test('hashing rejects non-JSON roots, bigint values, and circular references', () => {
  for (const input of [undefined, () => 1, Symbol('root'), 1n, { nested: 1n }, [1n]]) assert.throws(() => gatewayConfigHash(input), TypeError);
  const circular: { self?: unknown } = {};
  circular.self = circular;
  assert.throws(() => gatewayConfigHash(circular), TypeError);
});
