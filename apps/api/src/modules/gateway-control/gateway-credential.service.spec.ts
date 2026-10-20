import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as argon2 from 'argon2';
import type { PoolClient } from 'pg';
import type { DatabaseService } from '../../database/database.service.js';
import { GatewayCredentialService, GatewayCredentialVerification } from './gateway-credential.service.js';

const gatewayId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
function fixture(verification?: GatewayCredentialVerification) {
  const gateway = { id: gatewayId, external_gateway_id: 'GW-001', lifecycle_state: 'active',
    retired_at: null as string | null, protocol: 'mqtt', gateway_status: 'offline', site_status: 'online',mqtt_access_suspended:false };
  const credentials: { id:string;gateway_id: string; username: string; password_hash: string; revoked_at: string | null; created_by: string }[] = [];
  const queries: { sql: string; values: unknown[] }[] = [];
  let failInsert = false;
  const query = async (sql: string, values: unknown[] = []) => {
    queries.push({ sql, values });
    if (/FOR UPDATE/.test(sql)) {
      assert.deepEqual(values, [gatewayId]);
      return { rows: [gateway] };
    }
    if (/UPDATE gateway_mqtt_credentials/.test(sql)) {
      assert.match(sql, /revoked_at IS NULL/);
      assert.deepEqual(values, [gatewayId]);
      credentials.filter(c => !c.revoked_at).forEach(c => { c.revoked_at = '2026-10-19T00:00:00Z'; });
      return { rows: [] };
    }
    if (/INSERT INTO gateway_mqtt_credentials/.test(sql)) {
      if (failInsert) throw Error('insert failed');
      assert.deepEqual(values.slice(1, 3), [gatewayId, 'GW-001']);
      assert.equal(values[4], actorId);
      assert.ok(!credentials.some(c => c.revoked_at === null), 'revoke must precede insert to obey partial unique index');
      credentials.push({ id:String(values[0]),gateway_id: String(values[1]), username: String(values[2]), password_hash: String(values[3]), created_by: String(values[4]), revoked_at: null });
      return { rows: [] };
    }
    assert.match(sql, /FROM gateway_mqtt_credentials[\s\S]*JOIN gateways/);
    assert.match(sql, /revoked_at IS NULL/);
    if (/c\.id=\$2/.test(sql)) {
      assert.deepEqual(values, [gatewayId, values[1]]);
      return { rows: credentials.filter(c => c.gateway_id === values[0] && c.id === values[1] && !c.revoked_at).map(c => ({ ...gateway, ...c })) };
    }
    assert.deepEqual(values, [gatewayId]);
    return { rows: credentials.filter(c => c.gateway_id === values[0] && !c.revoked_at).map(c => ({ ...gateway, ...c })) };
  };
  const db = { query, transaction: async <T>(work: (client: PoolClient) => Promise<T>) => {
    const prior = structuredClone(credentials);
    try { return await work({ query } as unknown as PoolClient); }
    catch (error) { credentials.splice(0, credentials.length, ...prior); throw error; }
  } };
  const service = new GatewayCredentialService(db as unknown as DatabaseService, verification);
  return { gateway, credentials, queries, db, service, failInsertion: () => { failInsert = true; } };
}

test('issue returns a fresh 32-byte password and persists only a real Argon2id hash', async () => {
  const f = fixture();
  const issued = await f.db.transaction(client => f.service.issue(client, gatewayId, actorId));
  assert.deepEqual(Object.keys(issued).sort(), ['password', 'username']);
  assert.equal(issued.username, 'GW-001');
  assert.match(issued.password, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(issued.password, 'base64url').length, 32);
  assert.match(f.credentials[0]!.password_hash, /^\$argon2id\$/);
  assert.equal(await argon2.verify(f.credentials[0]!.password_hash, issued.password), true);
  assert.ok(f.queries.every(q => !JSON.stringify(q).includes(issued.password)), 'plaintext never enters SQL');
  assert.equal(await f.service.verify(gatewayId, issued.password), true);
  assert.equal(await f.service.verify(gatewayId, 'incorrect'), false);
  assert.equal(await f.service.verify(gatewayId, ''), false);
});

test('rotate revokes the previous credential, keeps its history, and invalidates its password', async () => {
  const f = fixture();
  const first = await f.db.transaction(client => f.service.issue(client, gatewayId, actorId));
  const second = await f.db.transaction(client => f.service.rotate(client, gatewayId, actorId));
  assert.notEqual(second.password, first.password);
  assert.equal(f.credentials.length, 2);
  assert.ok(f.credentials[0]!.revoked_at);
  assert.equal(f.credentials[1]!.revoked_at, null);
  assert.equal(await f.service.verify(gatewayId, first.password), false);
  assert.equal(await f.service.verify(gatewayId, second.password), true);
});

test('verify rejects a credential generation rotated or suspended while Argon2 is still running', async () => {
  let release!: (value: boolean) => void;
  let started!: () => void;
  const hashingStarted = new Promise<void>(resolve => { started = resolve; });
  const verification = new GatewayCredentialVerification({ verifyHash: async () => {
    started();
    return await new Promise<boolean>(resolve => { release = resolve; });
  } });
  const f = fixture(verification);
  const issued = await f.db.transaction(client => f.service.issue(client, gatewayId, actorId));
  const pending = f.service.verify(gatewayId, issued.password);
  await hashingStarted;
  f.credentials[0]!.revoked_at = '2026-10-20T00:00:00Z';
  f.credentials.push({ ...f.credentials[0]!, id: '33333333-3333-4333-8333-333333333333', revoked_at: null });
  f.gateway.mqtt_access_suspended = true;
  release(true);
  assert.equal(await pending, false);
});

test('rotation exposes an internal immutable generation while the public issue result stays plaintext-only',async()=>{
  const f=fixture();
  const generation=await f.db.transaction(client=>f.service.rotateWithGeneration(client,gatewayId,actorId));
  assert.match(generation.id,/^[0-9a-f-]{36}$/);
  assert.equal(f.credentials[0]?.id,generation.id);
  assert.deepEqual(Object.keys(await f.db.transaction(client=>f.service.issue(client,gatewayId,actorId))).sort(),['password','username']);
});

test('failed rotation rolls back revocation in the caller transaction', async () => {
  const f = fixture();
  const first = await f.db.transaction(client => f.service.issue(client, gatewayId, actorId));
  f.failInsertion();
  await assert.rejects(f.db.transaction(client => f.service.rotate(client, gatewayId, actorId)), /insert failed/);
  assert.equal(f.credentials.length, 1);
  assert.equal(f.credentials[0]!.revoked_at, null);
  assert.equal(await f.service.verify(gatewayId, first.password), true);
});

test('verify denies missing, revoked, mismatched, malformed, inactive and ambiguous credentials', async () => {
  const f = fixture();
  assert.equal(await f.service.verify(gatewayId, 'password'), false);
  const issued = await f.db.transaction(client => f.service.issue(client, gatewayId, actorId));
  const credential = f.credentials[0]!;
  for (const change of [
    { username: 'OTHER' }, { password_hash: '$argon2i$v=19$invalid' }, { password_hash: 'invalid' },
    { password_hash: '$argon2id$v=19$invalid' },
    { revoked_at: '2026-10-19T01:00:00Z' },
  ]) {
    const original = { ...credential };
    Object.assign(credential, change);
    assert.equal(await f.service.verify(gatewayId, issued.password), false);
    Object.assign(credential, original);
  }
  for (const change of [
    { lifecycle_state: 'disabled' }, { lifecycle_state: 'discovered' }, { retired_at: '2026-10-19T01:00:00Z' },
    { gateway_status: 'inactive' }, { protocol: 'http' }, { site_status: 'archived' },
    { mqtt_access_suspended: true },
  ]) {
    const original = { ...f.gateway };
    Object.assign(f.gateway, change);
    assert.equal(await f.service.verify(gatewayId, issued.password), false);
    Object.assign(f.gateway, original);
  }
  f.credentials.push({ ...credential });
  assert.equal(await f.service.verify(gatewayId, issued.password), false);
});

test('issue refuses malformed or reserved authoritative identities before writing credentials', async () => {
  for (const external_gateway_id of ['bad/topic', 'GW.+', 'solar-backend', '', 'x'.repeat(129), 'GW-001\n', 'GW-001\r', 'GW-001\u2028']) {
    const f = fixture();
    f.gateway.external_gateway_id = external_gateway_id;
    await assert.rejects(f.db.transaction(client => f.service.issue(client, gatewayId, actorId)));
    assert.equal(f.credentials.length, 0);
    assert.ok(f.queries.every(q => !/^\s*(UPDATE|INSERT)\b/.test(q.sql)));
  }
});

test('verify fails closed on database failure without surfacing secret-bearing errors', async () => {
  const service = new GatewayCredentialService({ query: async () => { throw Error('password/hash database failure'); } } as unknown as DatabaseService);
  assert.equal(await service.verify(gatewayId, 'password'), false);
});

function verificationFixture(overrides: Record<string, string> = {}) {
  let now = 10000;
  const calls: { hash: string; password: string }[] = [];
  let outcome: boolean | Error = false;
  const verification = new GatewayCredentialVerification({
    env: { MQTT_ARGON2_CONCURRENCY: '2', MQTT_AUTH_FAILURE_LIMIT: '2', MQTT_AUTH_FAILURE_WINDOW_MS: '1000',
      MQTT_AUTH_FAILURE_MAX_ENTRIES: '64', ...overrides },
    now: () => now,
    verifyHash: async (hash, password) => { calls.push({ hash, password }); if (outcome instanceof Error) throw outcome; return outcome; },
  });
  return { verification, calls, advance: (ms: number) => { now += ms; }, outcome: (value: boolean | Error) => { outcome = value; } };
}

test('exhausted gateway/source failures deny before any extra hash work and recover exactly at TTL', async () => {
  const f = verificationFixture();
  assert.equal(await f.verification.verify(gatewayId, 'stored-hash', 'wrong', '192.0.2.1'), false);
  assert.equal(await f.verification.verify(gatewayId, 'stored-hash', 'wrong', '192.0.2.1'), false);
  assert.equal(f.calls.length, 2);
  f.outcome(true);
  assert.equal(await f.verification.verify(gatewayId, 'stored-hash', 'correct', '192.0.2.1'), false);
  assert.equal(f.calls.length, 2, 'an exhausted key must not invoke Argon2');
  f.advance(999);
  assert.equal(await f.verification.verify(gatewayId, 'stored-hash', 'correct', '192.0.2.1'), false);
  f.advance(1);
  assert.equal(await f.verification.verify(gatewayId, 'stored-hash', 'correct', '192.0.2.1'), true);
  assert.equal(f.calls.length, 3);
  assert.deepEqual(f.calls[2], { hash: 'stored-hash', password: 'correct' });
});

test('failure buckets separate authoritative gateway IDs and normalized sources with stable missing-source key', async () => {
  const f = verificationFixture({ MQTT_AUTH_FAILURE_LIMIT: '1' });
  for (const [gateway, source] of [[gatewayId, ' 192.0.2.1 '], [gatewayId, '::ffff:192.0.2.1'],
    [gatewayId, '::ffff:c000:201'], ['other-authoritative-gateway', '192.0.2.1'], [gatewayId, '192.0.2.2'],
    [gatewayId, undefined], [gatewayId, undefined], [gatewayId, ' '], [gatewayId, 'not-an-ip'],
    [gatewayId, '2001:0DB8:0000:0000:0000:0000:0000:0001'], [gatewayId, '[2001:db8::1]']] as const) {
    assert.equal(await f.verification.verify(gateway, 'hash', 'wrong', source), false);
  }
  assert.equal(f.calls.length, 5, 'IPv4 aliases, IPv6 aliases and missing/invalid source aliases share only their own key');
});

test('successful verification clears prior failures for only that gateway/source', async () => {
  const f = verificationFixture();
  assert.equal(await f.verification.verify('other-db-gateway', 'hash', 'wrong', '192.0.2.1'), false);
  assert.equal(await f.verification.verify('other-db-gateway', 'hash', 'wrong', '192.0.2.1'), false);
  assert.equal(await f.verification.verify(gatewayId, 'hash', 'wrong', '192.0.2.1'), false);
  f.outcome(true);
  assert.equal(await f.verification.verify(gatewayId, 'hash', 'correct', '192.0.2.1'), true);
  assert.equal(await f.verification.verify('other-db-gateway', 'hash', 'correct', '192.0.2.1'), false);
  assert.equal(f.calls.length, 4, 'success must not clear another gateway failure bucket');
  f.outcome(false);
  assert.equal(await f.verification.verify(gatewayId, 'hash', 'wrong', '192.0.2.1'), false);
  assert.equal(await f.verification.verify(gatewayId, 'hash', 'wrong', '192.0.2.1'), false);
  assert.equal(f.calls.length, 6, 'success must restore the full failure allowance');
  assert.equal(await f.verification.verify(gatewayId, 'hash', 'wrong', '192.0.2.1'), false);
  assert.equal(f.calls.length, 6);
});

test('bounded entry capacity denies new buckets without extra hash work and reclaims expired entries', async () => {
  const f = verificationFixture({ MQTT_AUTH_FAILURE_LIMIT: '1' });
  for (let i = 0; i < 200; i++) assert.equal(await f.verification.verify(`db-gateway-${i}`, 'hash', 'wrong', '192.0.2.1'), false);
  assert.equal(f.calls.length, 64, 'the configured hard memory cap must stop allocating/hash work');
  f.advance(1000);
  f.outcome(true);
  assert.equal(await f.verification.verify('new-db-gateway', 'hash', 'correct', '192.0.2.1'), true);
  assert.equal(f.calls.length, 65);
});

test('concurrency admission rejects excess work immediately and releases permits on completion', async () => {
  const pending: ((value: boolean) => void)[] = [];
  let calls = 0;
  const verification = new GatewayCredentialVerification({ env: { MQTT_ARGON2_CONCURRENCY: '2' },
    verifyHash: () => { calls++; return new Promise(resolve => pending.push(resolve)); } });
  const first = verification.verify('gateway-a', 'hash', 'password', '192.0.2.1');
  const second = verification.verify('gateway-b', 'hash', 'password', '192.0.2.2');
  const third = verification.verify('gateway-c', 'hash', 'password', '192.0.2.3');
  try {
    assert.equal(calls, 2, 'a rejected permit must not start or queue a hash');
    assert.equal(await third, false);
  } finally { pending.splice(0).forEach(resolve => resolve(true)); }
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  const fourth = verification.verify('gateway-c', 'hash', 'password', '192.0.2.3');
  assert.equal(calls, 3);
  pending.splice(0).forEach(resolve => resolve(true));
  assert.equal(await fourth, true);
});

test('hash exceptions release concurrency permits and consume only their own failure allowance', async () => {
  const f = verificationFixture({ MQTT_ARGON2_CONCURRENCY: '1' });
  f.outcome(Error('sensitive hash error'));
  assert.equal(await f.verification.verify(gatewayId, 'hash', 'wrong', '192.0.2.1'), false);
  f.outcome(true);
  assert.equal(await f.verification.verify('other-db-gateway', 'hash', 'correct', '192.0.2.1'), true);
  assert.equal(f.calls.length, 2, 'exception must release the only permit');
});

test('concurrent attempts reserve their per-key budget before hash completion', async () => {
  const pending: ((value: boolean) => void)[] = [];
  let calls = 0;
  const verification = new GatewayCredentialVerification({ env: { MQTT_ARGON2_CONCURRENCY: '4', MQTT_AUTH_FAILURE_LIMIT: '1' },
    verifyHash: () => { calls++; return new Promise(resolve => pending.push(resolve)); } });
  const first = verification.verify(gatewayId, 'hash', 'wrong', '192.0.2.1');
  const second = verification.verify(gatewayId, 'hash', 'wrong', '192.0.2.1');
  try { assert.equal(calls, 1); assert.equal(await second, false); }
  finally { pending.splice(0).forEach(resolve => resolve(false)); }
  assert.equal(await first, false);
});

test('invalid concurrency settings use safe defaults and integral values clamp to safe bounds', async () => {
  for (const [value, admitted] of [['nonsense', 2], ['Infinity', 2], ['1.5', 2], ['', 2], ['0', 1], ['-2', 1], ['999999', 4]] as const) {
    const pending: ((value: boolean) => void)[] = [];
    let calls = 0;
    const verification = new GatewayCredentialVerification({ env: { MQTT_ARGON2_CONCURRENCY: value },
      verifyHash: () => { calls++; return new Promise(resolve => pending.push(resolve)); } });
    const attempts = Array.from({ length: 5 }, (_, i) => verification.verify(`db-gateway-${i}`, 'hash', 'password', '192.0.2.1'));
    try { assert.equal(calls, admitted, value); }
    finally { pending.splice(0).forEach(resolve => resolve(true)); }
    const results = await Promise.all(attempts);
    assert.equal(results.filter(Boolean).length, admitted);
  }
});

test('service applies failure admission after DB binding and before calling the expensive verifier', async () => {
  const budget = verificationFixture({ MQTT_AUTH_FAILURE_LIMIT: '1' });
  const f = fixture(budget.verification);
  await f.db.transaction(client => f.service.issue(client, gatewayId, actorId));
  assert.equal(await f.service.verify(gatewayId, 'wrong', { sourceAddress: '192.0.2.1' }), false);
  budget.outcome(true);
  assert.equal(await f.service.verify(gatewayId, 'correct', { sourceAddress: '192.0.2.1' }), false);
  assert.equal(await f.service.verify(gatewayId, 'correct', { sourceAddress: '192.0.2.2' }), true);
  assert.equal(budget.calls.length, 2);
  assert.match(budget.calls[0]!.hash, /^\$argon2id\$/);
});
