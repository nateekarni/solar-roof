import assert from 'node:assert/strict';
import test from 'node:test';
import { PayloadIngestion } from './payload-ingestion.js';

test('unregistered gateway records to discovered_gateways and generates preset config push', async () => {
  const queries: { sql: string; values: any[] }[] = [];
  const presetRegisters = [
    { semanticField: 'total_energy', registerAddress: '3204', dataType: 'uint32', byteOrder: 'ABCD', scale: 0.01, unit: 'kWh' },
  ];

  const db = {
    query: async (sql: string, values: any[] = []) => {
      queries.push({ sql, values });
      if (sql.includes('FROM gateways g JOIN sites s')) return { rows: [] };
      if (sql.includes('FROM devices d')) return { rows: [] };
      if (sql.includes('FROM meter_presets')) {
        return {
          rows: [
            {
              brand: 'Schneider Electric',
              model: 'PowerLogic PM2230',
              device_type: 'meter',
              registers: presetRegisters,
            },
          ],
        };
      }
      return { rows: [] };
    },
    pool: { connect: async () => ({ query: db.query, release() {} }) },
  };

  const ingest = new PayloadIngestion(db as any);
  const topic = 'solar/v1/sites/SITE-UNKNOWN/gateways/GW-NEW-01/devices/DEV-01/telemetry';
  const payload = {
    device: {
      deviceId: 'DEV-01',
      manufacturer: 'Schneider Electric',
      model: 'PowerLogic PM2230',
    },
    data: {
      values: { 'energy.active.import.total': 12345 },
    },
  };

  let ackEmitted: any = null;
  let configPushed: any = null;

  await ingest.acceptMany(
    topic,
    payload,
    null,
    ack => {
      ackEmitted = ack;
    },
    (siteId, gatewayId, config) => {
      configPushed = { siteId, gatewayId, config };
    }
  );

  // Assert discovered_gateways was inserted
  const insertDiscovered = queries.find(q => q.sql.includes('INSERT INTO discovered_gateways'));
  assert.ok(insertDiscovered, 'Should insert into discovered_gateways');
  assert.equal(insertDiscovered.values[0], 'GW-NEW-01');
  assert.equal(insertDiscovered.values[1], 'SITE-UNKNOWN');
  assert.equal(insertDiscovered.values[2], 'DEV-01');
  assert.equal(insertDiscovered.values[3], 'Schneider Electric');
  assert.equal(insertDiscovered.values[4], 'PowerLogic PM2230');

  // Assert config push was generated
  assert.ok(configPushed, 'Should push config back to gateway');
  assert.equal(configPushed.siteId, 'SITE-UNKNOWN');
  assert.equal(configPushed.gatewayId, 'GW-NEW-01');
  assert.equal(configPushed.config.command, 'configure_mapping');
  assert.deepEqual(configPushed.config.registers, presetRegisters);

  // Assert dataAcept ACK was emitted
  assert.ok(ackEmitted, 'Should acknowledge payload');
  assert.equal(ackEmitted.messageType, 'dataAcept');
  assert.equal(ackEmitted.status, 'accepted');
  assert.equal(ackEmitted.gatewayId, 'GW-NEW-01');
});
