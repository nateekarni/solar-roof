import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { MqttIngestionService } from './mqtt-ingestion.service.js';
import { DEFAULT_PAYLOAD_PROFILES } from './payload-profile.js';
const bundle = JSON.parse(readFileSync(new URL('./fixtures/payload-examples-v1.1.json', import.meta.url), 'utf8'));
test('bundles commit and acknowledge all four registered messages on the receiving broker', async () => {
  let commits = 0; const sent: any[] = []; const raw: any[] = [];
  const query = async (sql: string, values: any[] = []) => {
    if (sql.includes('FROM gateways g JOIN sites')) return { rows: [{ siteId: 's', gatewayId: 'g', externalSiteId: 'SITE-001', externalGatewayId: 'GW-001' }] };
    if (sql.includes('FROM devices d')) {
      assert.equal(values[4], 'broker');
      const logger = values[2] === 'SMARTLOGGER-001';
      return { rows: [{ deviceId: logger ? 'l' : 'm', siteId: 's', gatewayId: 'g', externalSiteId: 'SITE-001', externalGatewayId: 'GW-001', externalDeviceId: values[2], revisionId: logger ? 'rl' : 'rm', config: DEFAULT_PAYLOAD_PROFILES[logger ? 1 : 0], billing: !logger }] };
    }
    if (sql.includes('INSERT INTO payload_messages')) { raw.push(values); return { rows: [{ id: 'inserted' }] }; }
    if (sql === 'COMMIT') commits++;
    return { rows: [] };
  };
  const db = { query, pool: { connect: async () => ({ query, release() {} }) } };
  const service = new MqttIngestionService(db as any, db as any);
  const source = { connected: true, publish(topic: string, body: string) { assert.equal(commits, sent.length + 1); sent.push({ topic, body: JSON.parse(body) }); } };
  await service.handleIncomingMessage('solar/v1/sites/SITE-001/gateways/GW-001/devices/METER-001/telemetry', JSON.stringify(bundle), source as any, 'broker');
  assert.equal(sent.length, 4); assert.equal(raw.length, 4);
  assert.ok(sent.every(ack => ack.topic === 'solar/v1/sites/SITE-001/gateways/GW-001/dataAcept'));
  assert.deepEqual(sent.map(ack => ack.body.lotNumber), [1258, 1259, 1260, 1261]);
});
test('foreign gateway children are rejected without routing into their gateway', async () => {
  const writes: string[] = []; const query = async (sql: string) => {
    writes.push(sql);
    if (sql.includes('FROM gateways g JOIN sites')) return { rows: [{ siteId: 's', gatewayId: 'g', externalSiteId: 'SITE-001', externalGatewayId: 'GW-001' }] };
    return { rows: [] };
  };
  const service = new MqttIngestionService({ query } as any, { query } as any);
  const bad = structuredClone(bundle); bad.payloads = { bad: { ...bundle.payloads.pm2230Energy, gatewayId: 'OTHER' } };
  await service.handleIncomingMessage('solar/v1/sites/SITE-001/gateways/GW-001/devices/METER-001/telemetry', JSON.stringify(bad), { connected: true, publish() { assert.fail('No ACK for foreign gateway'); } } as any, 'broker');
  assert.ok(writes.some(sql => sql.includes('INSERT INTO payload_rejections')));
  assert.ok(!writes.some(sql => sql.includes('FROM devices d')));
});
