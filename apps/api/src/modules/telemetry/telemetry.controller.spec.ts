import assert from 'node:assert/strict';
import test from 'node:test';
import { TelemetryController } from './telemetry.controller.js';
import type { DatabaseService } from '../../database/database.service.js';
import type { MqttIngestionService } from './mqtt-ingestion.service.js';

test('editing a register inserts a fresh version with explicit byte order and retires the old version', async () => {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const query = async (sql: string, values: unknown[] = []) => {
    statements.push({ sql, values }); return { rows: [{ id: 'previous' }] };
  };
  const db = { query, pool: { connect: async () => ({ query, release() {} }) } } as unknown as DatabaseService;
  const controller = new TelemetryController(db, {} as MqttIngestionService);
  await controller.saveDeviceRegisterMapping('device', { id: 'previous', semanticField: 'voltage', registerAddress: 'R2', dataType: 'uint16', scale: 0.01, unit: 'V' });
  const inserted = statements.find(item => item.sql.includes('INSERT INTO register_mapping_versions'))!;
  assert.notEqual(inserted.values[0], 'previous');
  assert.equal(inserted.values[6], 'big_endian');
  assert.ok(statements.some(item => item.sql.startsWith('UPDATE register_mapping_versions SET effective_to')));
  assert.ok(!statements.some(item => item.sql.includes('ON CONFLICT')));
});
test('no persisted telemetry returns an empty response instead of fabricated measurements', async () => {
  const db = { query: async () => ({ rows: [{ id: 'site' }] }) } as unknown as DatabaseService;
  const ingestion = { getLatestTelemetry: async () => null } as unknown as MqttIngestionService;
  assert.equal(await new TelemetryController(db, ingestion).getLiveTelemetry('site'), null);
});
