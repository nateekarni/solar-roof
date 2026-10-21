import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import * as argon2 from 'argon2';
import type { DatabaseService } from '../../database/database.service.js';
import { GatewayCredentialService, GatewayCredentialVerification } from '../gateway-control/gateway-credential.service.js';
import { MqttAuthController } from './mqtt-auth.controller.js';

const headers = { 'x-internal-secret': 'webhook-secret' };
const deny = { result: 'deny' }, allow = { result: 'allow' };
const password = 'a-real-gateway-password';
const originalEnv = { INTERNAL_MQTT_SECRET: process.env.INTERNAL_MQTT_SECRET,
  MQTT_CREDENTIAL_SECRET: process.env.MQTT_CREDENTIAL_SECRET, MQTT_PASSWORD: process.env.MQTT_PASSWORD };
let hash: string;
before(async () => { hash = await argon2.hash(password, { type: argon2.argon2id }); });
beforeEach(() => { process.env.INTERNAL_MQTT_SECRET = 'webhook-secret'; process.env.MQTT_PASSWORD = 'backend-password'; delete process.env.MQTT_CREDENTIAL_SECRET; });
after(() => { for (const [key, value] of Object.entries(originalEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });

function fixture(verification?: GatewayCredentialVerification) {
  const gateway = { id: '11111111-1111-4111-8111-111111111111', external_gateway_id: 'GW-001', site_id: 'site-db-id',
    external_site_id: 'SITE-01', lifecycle_state: 'active', retired_at: null as string | null,
    protocol: 'mqtt', gateway_status: 'offline', site_status: 'online', credential_id: 'credential-id',
    username: 'GW-001', password_hash: hash, revoked_at: null as string | null, mqtt_access_suspended:false };
  const devices = [{ external_device_id: 'METER-01', gateway_id: gateway.id, site_id: gateway.site_id, status: 'online' }];
  const queries: { sql: string; values: unknown[] }[] = [];
  let exists = true, fail = false, ambiguous = false;
  const db = { query: async (sql: string, values: unknown[] = []) => {
    queries.push({ sql, values });
    if (fail) throw Error('driver failure containing a password/hash');
    assert.ok(!/^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql), 'auth/ACL cannot write discovery or timestamps');
    if (/FROM gateway_mqtt_credentials/.test(sql)) {
      if(/c\.id=\$2/.test(sql))assert.deepEqual(values,[gateway.id,gateway.credential_id]);
      else assert.deepEqual(values, [gateway.id]);
      return { rows: exists && gateway.revoked_at === null ? [{...gateway,id:gateway.credential_id}] : [] };
    }
    if (/FROM devices/.test(sql)) {
      assert.deepEqual(values, [gateway.id, gateway.site_id]);
      assert.match(sql, /gateway_id=\$1/); assert.match(sql, /site_id=\$2/);
      return { rows: devices };
    }
    assert.match(sql, /FROM gateways/); assert.deepEqual(values, ['GW-001']);
    if (!exists) return { rows: [] };
    if (/JOIN gateway_mqtt_credentials/.test(sql)) {
      assert.match(sql, /c\.revoked_at IS NULL/); assert.match(sql, /JOIN sites/);
      return { rows: ambiguous ? [gateway, { ...gateway, id: 'other-gateway' }] : [gateway] };
    }
    return { rows: [{ id: gateway.id }] };
  } };
  const realDb = db as unknown as DatabaseService;
  return { gateway, devices, queries, controller: new MqttAuthController(realDb, new GatewayCredentialService(realDb, verification)),
    unknown: () => { exists = false; }, fail: () => { fail = true; }, ambiguous: () => { ambiguous = true; } };
}
const registered = { username: 'GW-001', clientid: 'GW-001' };
const controlAcl = { ...registered, action: 'publish' as const, topic: 'solar/v1/gateways/GW-001/status' };
const telemetryAcl = { ...registered, action: 'publish' as const, topic: 'solar/v1/sites/SITE-01/gateways/GW-001/devices/METER-01/telemetry' };
const ackAcl = { ...registered, action: 'subscribe' as const, topic: 'solar/v1/sites/SITE-01/gateways/GW-001/dataAcept' };

test('configured callback secret is mandatory on auth and ACL including backend bypasses', async () => {
  const f = fixture();
  for (const supplied of [undefined, {}, { 'x-internal-secret': '' }, { 'x-internal-secret': 'incorrect' }]) {
    assert.deepEqual(await f.controller.authenticate({ username: 'solar-backend', password: 'backend-password' }, supplied), deny);
    assert.deepEqual(await f.controller.authorize({ username: 'solar-backend', action: 'subscribe', topic: '#' }, supplied), deny);
  }
  assert.equal(f.queries.length, 0);
});

test('backend keeps strong credential and superuser behavior behind the callback boundary', async () => {
  const f = fixture();
  assert.deepEqual(await f.controller.authenticate({ username: 'solar-backend', password: 'backend-password' }, headers), { result: 'allow', is_superuser: true });
  for (const supplied of ['', 'incorrect', undefined]) assert.deepEqual(await f.controller.authenticate({ username: 'solar-backend', ...(supplied === undefined ? {} : { password: supplied }) }, headers), deny);
  delete process.env.MQTT_PASSWORD;
  assert.deepEqual(await f.controller.authenticate({ username: 'solar-backend', password: '' }, headers), deny);
  assert.deepEqual(await f.controller.authorize({ username: 'solar-backend', action: 'subscribe', topic: '#' }, headers), allow);
});

test('fallback callback secret is mandatory when primary secret is unset', async () => {
  delete process.env.INTERNAL_MQTT_SECRET; process.env.MQTT_CREDENTIAL_SECRET = 'fallback';
  const f = fixture();
  assert.deepEqual(await f.controller.authenticate({ username: 'solar-backend', password: 'backend-password' }), deny);
  assert.deepEqual(await f.controller.authorize({ username: 'solar-backend', action: 'subscribe', topic: '#' }), deny);
  assert.deepEqual(await f.controller.authenticate({ username: 'solar-backend', password: 'backend-password' }, { 'x-internal-secret': 'fallback' }), { result: 'allow', is_superuser: true });
});

test('anonymous gateway connects only as exact valid client ID without username or password', async () => {
  const f = fixture(); f.unknown();
  for (const dto of [{ clientid: 'GW-001' }, { clientid: 'GW-001', username: '', password: '' }]) {
    assert.deepEqual(await f.controller.authenticate(dto, headers), { result: 'allow', is_superuser: false });
  }
  for (const dto of [{}, { clientid: '' }, { clientid: ' GW-001' }, { clientid: 'GW/001' }, { clientid: '+' },
    { clientid: '#' }, { clientid: 'solar-backend' }, { clientid: 'x'.repeat(129) }, { clientid: 'GW-001\n' },
    { clientid: 'GW-001\r' }, { clientid: 'GW-001\u2028' },
    { clientid: 'GW-001', username: ' ' }, { clientid: 'GW-001', password: 'unexpected' }]) {
    assert.deepEqual(await f.controller.authenticate(dto, headers), deny, JSON.stringify(dto));
  }
});

test('known gateway cannot downgrade to anonymous even when retired or credentials revoked', async () => {
  const f = fixture();
  for (const retired_at of [null, '2026-10-19T00:00:00Z']) {
    f.gateway.retired_at = retired_at; f.gateway.revoked_at = '2026-10-19T00:00:00Z';
    assert.deepEqual(await f.controller.authenticate({ clientid: 'GW-001' }, headers), deny);
    assert.deepEqual(await f.controller.authorize({ clientid: 'GW-001', action: 'publish', topic: 'solar/v1/gateways/GW-001/register' }, headers), deny);
  }
});

test('anonymous ACL permits only exact telemetry publish for discovery', async () => {
  const f = fixture(); f.unknown();
  assert.deepEqual(await f.controller.authorize({ clientid: 'GW-001', action: 'publish', topic: telemetryAcl.topic }, headers), allow);
  for (const topic of ['solar/v1/gateways/GW-001/register','solar/v1/gateways/GW-OTHER/register', 'solar/v1/gateways/+/register', 'solar/v1/gateways/GW-001/#',
    'solar/v1/gateways/GW-001/register/extra', 'solar/v1/sites/SITE-01/gateways/GW-001/register',
    'solar/v1/sites/SITE-01/gateways/GW-001/devices/+/telemetry','energy/GW-001/telemetry', ...['config', 'configUpdate', 'configStatus', 'status'].map(kind => `solar/v1/gateways/GW-001/${kind}`)]) {
    assert.deepEqual(await f.controller.authorize({ clientid: 'GW-001', action: 'publish', topic }, headers), deny, topic);
  }
  for (const topic of ['solar/v1/gateways/GW-001/register', 'solar/v1/gateways/GW-001/config', '#']) {
    assert.deepEqual(await f.controller.authorize({ clientid: 'GW-001', action: 'subscribe', topic }, headers), deny);
  }
  assert.deepEqual(await f.controller.authorize({ clientid: 'GW-001', password: 'unexpected', action: 'publish', topic: telemetryAcl.topic }, headers), deny);
});

test('registered authentication requires matching username, client ID, DB identity and real active password', async () => {
  const f = fixture();
  assert.deepEqual(await f.controller.authenticate({ ...registered, password }, headers), { result: 'allow', is_superuser: false });
  for (const dto of [{ ...registered }, { ...registered, password: '' }, { ...registered, password: 'arbitrary' },
    { username: 'GW-001', clientid: 'other', password }, { username: 'GW-001', password }, { username: ' GW-001', clientid: 'GW-001', password }]) {
    assert.deepEqual(await f.controller.authenticate(dto, headers), deny);
  }
  f.gateway.username = 'MISMATCH'; assert.deepEqual(await f.controller.authenticate({ ...registered, password }, headers), deny);
  f.gateway.username = 'GW-001'; f.gateway.external_gateway_id = 'OTHER';
  assert.deepEqual(await f.controller.authenticate({ ...registered, password }, headers), deny);
});

test('configuring gateway authenticates and exchanges config before activation but cannot publish telemetry', async () => {
  const f = fixture(); f.gateway.lifecycle_state = 'configuring';
  assert.deepEqual(await f.controller.authenticate({ ...registered, password }, headers), { result: 'allow', is_superuser: false });
  assert.deepEqual(await f.controller.authorize({ ...registered, action: 'subscribe', topic: 'solar/v1/gateways/GW-001/config' }, headers), allow);
  assert.deepEqual(await f.controller.authorize({ ...registered, action: 'publish', topic: 'solar/v1/gateways/GW-001/configStatus' }, headers), allow);
  assert.deepEqual(await f.controller.authorize(telemetryAcl, headers), deny);
});

test('authentication and ACL deny invalid lifecycle, retirement, site, protocol and revoked credentials', async () => {
  for (const change of [{ lifecycle_state: 'disabled' }, { lifecycle_state: 'discovered' }, { lifecycle_state: 'unknown' },
    { retired_at: '2026-10-19T00:00:00Z' }, { site_status: 'archived' }, { site_status: 'inactive' },
    { gateway_status: 'inactive' }, { protocol: 'http' }, { revoked_at: '2026-10-19T00:00:00Z' }, { credential_id: null }, { username: 'OTHER' }]) {
    const f = fixture(); Object.assign(f.gateway, change);
    assert.deepEqual(await f.controller.authenticate({ ...registered, password }, headers), deny, JSON.stringify(change));
    assert.deepEqual(await f.controller.authorize(controlAcl, headers), deny, JSON.stringify(change));
  }
});

test('credential rotation suspension immediately denies both an old connected session ACL and new authentication',async()=>{
  const f=fixture();f.gateway.mqtt_access_suspended=true;
  assert.deepEqual(await f.controller.authenticate({...registered,password},headers),deny);
  assert.deepEqual(await f.controller.authorize(controlAcl,headers),deny);
  assert.deepEqual(await f.controller.authorize(telemetryAcl,headers),deny);
});

test('registered ACL permits own exact control publishes and config subscription', async () => {
  const f = fixture();
  for (const kind of ['configUpdate', 'configStatus', 'status']) {
    assert.deepEqual(await f.controller.authorize({ ...registered, action: 'publish', topic: `solar/v1/gateways/GW-001/${kind}` }, headers), allow);
    assert.deepEqual(await f.controller.authorize({ ...registered, action: 'subscribe', topic: `solar/v1/gateways/GW-001/${kind}` }, headers), deny);
  }
  assert.deepEqual(await f.controller.authorize({ ...registered, action: 'subscribe', topic: 'solar/v1/gateways/GW-001/config' }, headers), allow);
  for (const kind of ['config', 'register']) assert.deepEqual(await f.controller.authorize({ ...registered, action: 'publish', topic: `solar/v1/gateways/GW-001/${kind}` }, headers), deny);
});

test('registered telemetry and dataAcept ACL use exact assigned site and device identities', async () => {
  const f = fixture();
  assert.deepEqual(await f.controller.authorize(telemetryAcl, headers), allow);
  assert.deepEqual(await f.controller.authorize(ackAcl, headers), allow);
  for (const topic of ['solar/v1/sites/OTHER/gateways/GW-001/devices/METER-01/telemetry',
    'solar/v1/sites/SITE-01/gateways/OTHER/devices/METER-01/telemetry', 'solar/v1/sites/SITE-01/gateways/GW-001/devices/OTHER/telemetry',
    'solar/v1/sites/SITE-01/gateways/GW-001/devices/+/telemetry', 'solar/v1/sites/+/gateways/GW-001/devices/METER-01/telemetry',
    'energy/GW-001/telemetry', 'solar/v1/gateways/OTHER/status', '#']) {
    assert.deepEqual(await f.controller.authorize({ ...registered, action: 'publish', topic }, headers), deny, topic);
  }
  for (const topic of ['solar/v1/sites/+/gateways/GW-001/dataAcept', 'solar/v1/sites/OTHER/gateways/GW-001/dataAcept',
    'solar/v1/sites/SITE-01/gateways/GW-001/devices/METER-01/dataAcept', 'energy/GW-001/config',
    'solar/v1/gateways/+/config', 'solar/v1/gateways/OTHER/config', 'solar/v1/gateways/GW-001/#']) {
    assert.deepEqual(await f.controller.authorize({ ...registered, action: 'subscribe', topic }, headers), deny, topic);
  }
});

test('ACL rejects inactive or unassigned devices and unsafe authoritative site/device IDs', async () => {
  for (const change of [{ status: 'inactive' }, { status: 'disabled' }, { site_id: 'other' }, { gateway_id: 'other' },
    { external_device_id: '+' }, { external_device_id: 'METER.+' }]) {
    const f = fixture(); Object.assign(f.devices[0]!, change);
    assert.deepEqual(await f.controller.authorize(telemetryAcl, headers), deny);
    assert.deepEqual(await f.controller.authorize(ackAcl, headers), deny);
  }
  const f = fixture(); f.gateway.external_site_id = '+';
  assert.deepEqual(await f.controller.authorize({ ...telemetryAcl, topic: 'solar/v1/sites/+/gateways/GW-001/devices/METER-01/telemetry' }, headers), deny);
});

test('ACL rejects mismatched clients, whitespace, wildcards and malformed runtime inputs', async () => {
  const f = fixture();
  for (const dto of [{ username: 'GW-001', action: 'publish', topic: controlAcl.topic }, { ...controlAcl, clientid: 'OTHER' },
    { ...controlAcl, topic: ` ${controlAcl.topic}` }, { ...controlAcl, topic: `${controlAcl.topic}/extra` },
    { ...controlAcl, action: 'pub' }, null, { username: 123 }, { username: 'GW-001', clientid: {} }]) {
    assert.deepEqual(await f.controller.authorize(dto as never, headers), deny);
  }
  for (const dto of [null, { username: 123 }, { username: 'GW-001', clientid: {} }, { ...registered, password: {} }]) {
    assert.deepEqual(await f.controller.authenticate(dto as never, headers), deny);
  }
});

test('unknown/ambiguous DB identities and driver/hash errors fail closed without writes', async () => {
  for (const setup of [(f: ReturnType<typeof fixture>) => f.unknown(), (f: ReturnType<typeof fixture>) => f.ambiguous(),
    (f: ReturnType<typeof fixture>) => f.fail(), (f: ReturnType<typeof fixture>) => { f.gateway.password_hash = 'malformed'; }]) {
    const f = fixture(); setup(f);
    assert.deepEqual(await f.controller.authenticate({ ...registered, password }, headers), deny);
    if (f.gateway.password_hash !== 'malformed') assert.deepEqual(await f.controller.authorize(controlAcl, headers), deny);
    assert.ok(f.queries.every(q => !/^\s*(INSERT|UPDATE|DELETE)\b/i.test(q.sql)));
    assert.ok(f.queries.every(q => !JSON.stringify(q).includes(password)));
  }
});

test('registered HTTP auth forwards normalized trusted peerhost into independent source budgets', async () => {
  let calls = 0;
  const verification = new GatewayCredentialVerification({ env: { MQTT_AUTH_FAILURE_LIMIT: '1' },
    verifyHash: async (_hash, supplied) => { calls++; return supplied === password; } });
  const f = fixture(verification);
  assert.deepEqual(await f.controller.authenticate({ ...registered, password: 'wrong', peerhost: ' 192.0.2.1 ' }, headers), deny);
  assert.deepEqual(await f.controller.authenticate({ ...registered, password, peerhost: '::ffff:192.0.2.1' }, headers), deny);
  assert.equal(calls, 1, 'source alias must not bypass failure admission');
  assert.deepEqual(await f.controller.authenticate({ ...registered, password, peerhost: '192.0.2.2' }, headers), { result: 'allow', is_superuser: false });
  assert.equal(calls, 2, 'another source must remain independent');
  assert.deepEqual(await f.controller.authenticate({ ...registered, password: 'wrong' }, headers), deny);
  assert.deepEqual(await f.controller.authenticate({ ...registered, password }, headers), deny);
  assert.equal(calls, 3, 'absent source must share one stable explicit key');
});

test('anonymous authentication and every ACL path stay outside Argon2 admission', async () => {
  let calls = 0;
  const verification = new GatewayCredentialVerification({ verifyHash: async () => { calls++; return false; } });
  const f = fixture(verification);
  assert.deepEqual(await f.controller.authorize(controlAcl, headers), allow);
  f.unknown();
  assert.deepEqual(await f.controller.authenticate({ clientid: 'GW-001', peerhost: '192.0.2.1' }, headers), { result: 'allow', is_superuser: false });
  assert.deepEqual(await f.controller.authorize({ clientid: 'GW-001', action: 'publish', topic: telemetryAcl.topic }, headers), allow);
  assert.equal(calls, 0);
});

test('unbound Gateway Serial may publish telemetry for discovery but never register or subscribe',async()=>{
  const queries:{sql:string;values:unknown[]}[]=[];
  const db={query:async(sql:string,values:unknown[]=[]):Promise<{rows:any[]}>=>{queries.push({sql,values});return {rows:[]};}} as unknown as DatabaseService;
  const controller=new MqttAuthController(db,new GatewayCredentialService(db));
  const clientid='GW-SN-A1B2C3D4';
  const telemetry='solar/v1/sites/SITE-001/gateways/GW-001/devices/SMARTLOGGER-001/telemetry';
  assert.deepEqual(await controller.authenticate({clientid},headers),{result:'allow',is_superuser:false});
  assert.deepEqual(await controller.authorize({clientid,action:'publish',topic:telemetry},headers),allow);
  assert.deepEqual(await controller.authorize({clientid,action:'publish',topic:`solar/v1/gateways/${clientid}/register`},headers),deny);
  assert.deepEqual(await controller.authorize({clientid,action:'subscribe',topic:'#'},headers),deny);
  assert.ok(queries.every(query=>query.sql.includes('gateway_serial')));
  assert.ok(queries.every(query=>query.values[0]===clientid));
});
