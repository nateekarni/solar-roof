import assert from 'node:assert/strict';
import test from 'node:test';
import { PayloadIngestion } from './payload-ingestion.js';

for (const path of ['accept', 'acceptMany'] as const)
for (const brokerId of ['11111111-1111-4111-8111-111111111111', null] as const)
test(`${path} rejects unknown telemetry in the ${brokerId ?? 'default'} broker without discovery, config, or dataAcept`, async () => {
  const queries: { sql: string; values: unknown[] }[] = [];
  const acknowledgements: unknown[] = [];
  const configurations: unknown[] = [];
  const db = { query: async (sql: string, values: unknown[] = []) => {
    queries.push({ sql, values });
    return { rows: [] };
  } };
  const ingest = new PayloadIngestion(db as any);
  const topic = 'solar/v1/sites/SITE-UNKNOWN/gateways/GW-SHARED/devices/DEV-01/telemetry';
  const payload = { messageId: 'not-registration', device: { deviceId: 'DEV-01', model: 'PowerLogic PM2230' } };

  if (path === 'accept') assert.equal(await ingest.accept(topic, payload, brokerId), null);
  else await ingest.acceptMany(topic, payload, brokerId, ack => acknowledgements.push(ack), (...args) => configurations.push(args));

  assert.equal(acknowledgements.length, 0);
  assert.equal(configurations.length, 0);
  assert.equal(queries.some(query => query.sql.includes('INSERT INTO discovered_gateways')), false);
  assert.equal(queries.some(query => query.sql.includes('FROM meter_presets')), false);
  assert.equal(queries.some(query => query.sql.includes('gateway_configuration_revisions')), false);
});

test('a known gateway with an unknown device records a bounded rejection without acknowledging', async () => {
  const queries: { sql: string; values: unknown[] }[] = [];
  const db = { query: async (sql: string, values: unknown[] = []) => {
    queries.push({ sql, values });
    if (sql.includes('FROM gateways g') && sql.includes('JOIN sites s')) return { rows: [{ siteId: 'site', gatewayId: 'gateway' }] };
    return { rows: [] };
  } };
  const ingest = new PayloadIngestion(db as any);
  const result = await ingest.accept('solar/v1/sites/SITE-001/gateways/GW-001/devices/UNKNOWN/telemetry', {}, null);

  assert.equal(result, null);
  assert.ok(queries.some(query => query.sql.includes('INSERT INTO payload_rejections')));
  assert.equal(queries.some(query => query.sql.includes('INSERT INTO discovered_gateways')), false);
});
