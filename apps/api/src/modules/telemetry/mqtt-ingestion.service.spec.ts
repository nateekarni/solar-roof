import assert from "node:assert/strict";
import test from "node:test";
import { MqttIngestionService } from "./mqtt-ingestion.service.js";
import type { DatabaseService } from "../../database/database.service.js";

function fixture(options: { unknown?: boolean; fail?: boolean; mappings?: object[] } = {}) {
  const writes: unknown[][] = []; const sent: string[] = []; const seen = new Set<string>();
  const query = async (sql: string, values: unknown[] = []) => {
    if (sql.includes('FROM register_mapping_versions')) return { rows: options.mappings ?? [] };
    if (sql.includes('FROM devices d') || sql.includes('FROM gateways g')) return { rows: options.unknown ? [] : [{ siteId: 'site', gatewayId: 'gw', gatewayName: 'GW-1', deviceId: 'dev', endpoint: 'energy/GW-1/#' }] };
    if (sql.includes('FROM telemetry_raw tr')) {
      const latest = [...writes].sort((a,b) => new Date(String(b[3])).getTime() - new Date(String(a[3])).getTime())[0];
      return { rows: latest ? [{ siteId: 'site', device_id: 'dev', gatewayName: 'GW-1', source_time: latest[3], received_time: latest[4], active_power_w: latest[12], quality: latest[8] }] : [] };
    }
    if (sql.includes('INSERT INTO telemetry_raw')) {
      if (options.fail) throw new Error('database unavailable');
      const key = String(values[9]);
      if (seen.has(key)) return { rows: [], rowCount: 0 };
      seen.add(key); writes.push(values); return { rows: [{ id: 'raw' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  };
  const db = { query, pool: { connect: async () => ({ query, release() {} }) } } as unknown as DatabaseService;
  const service = new MqttIngestionService(db);
  Object.assign(service, { client: { connected: true, publish(topic: string) { sent.push(topic); } } });
  return { service, writes, sent };
}
const payload = (metrics: object, timestamp = '2026-09-30T01:00:00Z') => JSON.stringify({ deviceId: 'dev', gateway: 'GW-1', timestamp, metrics });

test('response and config publications never enter ingestion', async () => {
  const f = fixture();
  await f.service.handleIncomingMessage('energy/GW-1/response', payload({ activePower: 1200 }));
  await f.service.handleIncomingMessage('energy/GW-1/config', payload({ activePower: 1200 }));
  assert.equal(f.writes.length, 0); assert.equal(f.sent.length, 0);
});
test('unknown devices are rejected without an ACK or volatile readings', async () => {
  const f = fixture({ unknown: true });
  await f.service.handleIncomingMessage('energy/GW-1/telemetry', payload({ activePower: 1200 }));
  assert.equal(f.writes.length, 0); assert.equal(f.sent.length, 0);
});
test('W and kW fields normalize without NaN and missing values stay absent', async () => {
  for (const metrics of [{ activePower: 1200 }, { active_power: 1200 }, { activePowerKw: 1.2 }]) {
    const f = fixture(); await f.service.handleIncomingMessage('energy/GW-1/telemetry', payload(metrics));
    assert.equal(f.writes[0]?.[12], 1200); assert.equal(f.writes[0]?.[10], null);
  }
});
test('failed persistence never ACKs', async () => {
  const f = fixture({ fail: true });
  await f.service.handleIncomingMessage('energy/GW-1/telemetry', payload({ activePower: 1200 })).catch(() => {});
  assert.equal(f.sent.length, 0);
});
test('identical replay persists one sample and late data cannot replace latest', async () => {
  const f = fixture(); const message = payload({ activePower: 1200 });
  await f.service.handleIncomingMessage('energy/GW-1/telemetry', message);
  await f.service.handleIncomingMessage('energy/GW-1/telemetry', message);
  assert.equal(f.writes.length, 1);
  await f.service.handleIncomingMessage('energy/GW-1/telemetry', payload({ activePower: 100 }, '2026-09-29T01:00:00Z'));
  const latest = await f.service.getLatestTelemetry('site');
  assert.equal(latest?.metrics.activePower, 1200);
  assert.equal(latest?.status, 'offline');
});

test('freshness includes 120 seconds and expires immediately afterwards', async () => {
  const { isFresh, telemetryTopicMatches } = await import('./mqtt-ingestion.service.js');
  assert.equal(isFresh('2026-09-30T00:00:00Z', Date.parse('2026-09-30T00:02:00Z')), true);
  assert.equal(isFresh('2026-09-30T00:00:00Z', Date.parse('2026-09-30T00:02:00.001Z')), false);
  assert.equal(isFresh('2026-09-30T00:03:00Z', Date.parse('2026-09-30T00:02:00Z')), false);
  assert.equal(telemetryTopicMatches('/GW-1/#', '/GW-1/meter/telemetry'), true);
  assert.equal(telemetryTopicMatches('/GW-1/#', '/GW-10/meter/telemetry'), false);
});
test('a known device on another gateway topic is rejected', async () => {
  const f = fixture();
  await f.service.handleIncomingMessage('energy/GW-2/telemetry', payload({ activePower: 1200 }));
  assert.equal(f.writes.length, 0); assert.equal(f.sent.length, 0);
});
test('timestamp-free and nonnumeric samples are never acknowledged', async () => {
  const f = fixture();
  await assert.rejects(f.service.handleIncomingMessage('energy/GW-1/telemetry', JSON.stringify({ deviceId: 'dev', metrics: { activePower: 1200 } })));
  await assert.rejects(f.service.handleIncomingMessage('energy/GW-1/telemetry', payload({ activePower: 'bad' })));
  assert.equal(f.writes.length, 0); assert.equal(f.sent.length, 0);
});

test('raw register byte order is honored rather than silently decoded backwards', async () => {
  const f = fixture({ mappings: [{ id: 'mapping', semanticField: 'voltage', registerAddress: 'R2', registerCount: 1, byteOrder: 'little_endian', wordOrder: 'little_word_first', dataType: 'uint16', scale: 0.01, unit: 'V' }] });
  await f.service.handleIncomingMessage('energy/GW-1/telemetry', JSON.stringify({ deviceId: 'dev', timestamp: '2026-09-30T01:00:00Z', registers: { R2: 10586 } }));
  assert.equal(f.writes[0]?.[10], 230.81);
});
