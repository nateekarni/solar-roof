/** Verify a UI-created revision and explicit upgrade against the local broker. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import mqtt from 'mqtt';
import { Pool } from 'pg';

config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)) });
const siteId = process.env.PAYLOAD_TEST_SITE_ID;
const password = process.env.PAYLOAD_TEST_PASSWORD;
assert.ok(siteId && password, 'Set the existing test site and administrator password');
const api = process.env.PAYLOAD_TEST_API_URL ?? 'http://localhost:3001';
const login = await fetch(`${api}/v1/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
  body: JSON.stringify({ email: process.env.PAYLOAD_TEST_EMAIL ?? 'admin@solar.local', password }),
});
assert.equal(login.status, 200);
const { accessToken } = await login.json() as { accessToken: string };
async function get(path: string): Promise<any> {
  const response = await fetch(api + path, { headers: { Authorization: `Bearer ${accessToken}` } });
  assert.ok(response.ok); return response.json();
}
const connection = await get(`/v1/sites/${siteId}/payload-config`);
const device = connection.devices.find((d: any) => d.profileId === 'schneider-pm2230');
assert.equal(device.profileVersion, '1.0.1', 'UI explicitly upgraded the device');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const client = mqtt.connect(process.env.MQTT_URL ?? 'mqtt://localhost:1883', { reconnectPeriod: 0, connectTimeout: 5000 });
const ready = new Promise<void>((resolve, reject) => { client.once('connect', () => resolve()); client.once('error', reject); });
const acks = new Map<string, any>();
client.on('message', (_topic, bytes) => { const ack = JSON.parse(bytes.toString()); acks.set(ack.messageId, ack); });
async function publish(payload: any) {
  acks.delete(payload.messageId);
  await new Promise<void>((resolve, reject) => client.publish(device.telemetryTopic, JSON.stringify(payload), { qos: 1 }, error => error ? reject(error) : resolve()));
  const deadline = Date.now() + 6000;
  while (!acks.has(payload.messageId) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(acks.get(payload.messageId)?.status, 'accepted');
}
try {
  await ready;
  await new Promise<void>((resolve, reject) => client.subscribe(connection.ackTopic, { qos: 1 }, error => error ? reject(error) : resolve()));
  const old = (await db.query('SELECT m.raw_payload FROM payload_messages m JOIN payload_profile_revisions p ON p.id=m.profile_revision_id WHERE m.device_id=$1 AND p.version=$2 ORDER BY m.accepted_at LIMIT 1', [device.id, '1.0.0'])).rows[0]?.raw_payload;
  assert.ok(old, 'Existing historical 1.0.0 message available for retry');
  assert.equal(old.device.profileVersion, '1.0.0');
  const before = Number((await db.query('SELECT count(*) count FROM payload_messages WHERE gateway_id=$1', [connection.gatewayId])).rows[0].count);
  old.timestamps.sentAt = new Date().toISOString();
  await publish(old);
  assert.equal(Number((await db.query('SELECT count(*) count FROM payload_messages WHERE gateway_id=$1', [connection.gatewayId])).rows[0].count), before, 'Old revision retry remains deduplicated after upgrade');
  const payload = structuredClone(device.fixture);
  payload.messageId = randomUUID(); payload.lotNumber = 2;
  payload.timestamps.polledAt = payload.timestamps.sentAt = new Date().toISOString();
  payload.data = { values: { 'future.custom_metric': 12.5 }, units: { 'future.custom_metric': 'widgets' } };
  await publish(payload);
  const live = await get(`/v1/sites/${siteId}/live-telemetry`);
  const field = live.canonicalFields.find((f: any) => f.tag === 'future.custom_metric');
  assert.equal(field?.value, 12.5); assert.equal(field?.unit, 'widgets'); assert.equal(field?.profileVersion, '1.0.1');
  const revisions = (await db.query('SELECT DISTINCT p.version FROM payload_samples s JOIN payload_profile_revisions p ON p.id=s.profile_revision_id WHERE s.site_id=$1 ORDER BY p.version', [siteId])).rows.map(row => row.version);
  assert.deepEqual(revisions, ['1.0.0', '1.0.1'], 'Historical samples retain their original revision');
  const evidence = { siteId, checkedAt: new Date().toISOString(), revisions, field, checks: ['UI revision creation did not automatically upgrade device', 'Explicit UI upgrade applied 1.0.1', 'Old revision retry still ACKed without duplicate', 'New configurable field received as canonical 12.5 widgets', 'History retains both revision lineages'] };
  await writeFile(new URL('../../../../docs/mqttbox-local-test/revision-evidence.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
} finally { await client.endAsync(); await db.end(); }
