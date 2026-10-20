import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { AssetsController } from './assets.controller.js';

test('gatewayTelemetry throws NotFoundException when gateway does not exist', async () => {
  const db = {
    query: async () => ({ rows: [] }),
  };
  const controller = new AssetsController(db as any, {} as any);
  await assert.rejects(
    () => controller.gatewayTelemetry('00000000-0000-0000-0000-000000000001'),
    NotFoundException
  );
});

test('gatewayTelemetry returns gateway details and formatted telemetry samples', async () => {
  const gatewayId = '11111111-1111-1111-1111-111111111111';
  const queries: { sql: string; values: unknown[] }[] = [];

  const db = {
    query: async (sql: string, values: unknown[] = []) => {
      queries.push({ sql, values });
      if (sql.includes('FROM gateways g JOIN sites s')) {
        return {
          rows: [
            {
              id: gatewayId,
              siteId: 'site-uuid',
              siteName: 'Main Site',
              siteCode: 'SITE-01',
              name: 'GW-01',
              externalGatewayId: 'GW-01',
              subscriptionTopic: 'solar/v1/sites/SITE-01/gateways/GW-01/devices/+/telemetry',
              lastSeenAt: '2026-10-18T08:00:00.000Z',
              pollingIntervalSeconds: 10,
              status: 'online',
              desiredVersion: 1,
              publishedVersion: 1,
              acknowledgedVersion: 1,
              appliedVersion: 1,
              deviceCount: 1,
              lastMeasuredAt: '2026-10-18T08:00:00.000Z',
              lastReceivedAt: '2026-10-18T08:00:01.000Z',
              currentProductionKw: 5.5,
            },
          ],
        };
      }
      if (sql.includes('FROM devices d') && sql.includes('CROSS JOIN LATERAL')) {
        return {
          rows: [
            {
              deviceId: 'device-uuid',
              externalDeviceId: 'MTR-01',
              deviceName: 'Meter 1',
              tag: 'power.active.total',
              value: '5500',
              unit: 'W',
              rawValue: '5500',
              rawUnit: 'W',
              polledAt: new Date('2026-10-18T08:00:00.000Z'),
              sourceTime: new Date('2026-10-18T08:00:00.000Z'),
              receivedAt: new Date('2026-10-18T08:00:01.000Z'),
              quality: 'good',
              communication: 'online',
              pollGroup: 'realtime',
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const controller = new AssetsController(db as any, {} as any);
  const result = await controller.gatewayTelemetry(gatewayId);

  assert.equal(result.gateway.id, gatewayId);
  assert.equal(result.gateway.status, 'online');
  assert.equal(result.samples.length, 1);
  assert.equal(result.samples[0]?.value, 5500);
  assert.equal(result.samples[0]?.rawValue, 5500);
  assert.equal(result.samples[0]?.polledAt, '2026-10-18T08:00:00.000Z');
  assert.equal(result.samples[0]?.sourceTime, '2026-10-18T08:00:00.000Z');
  assert.equal(result.samples[0]?.receivedAt, '2026-10-18T08:00:01.000Z');
  assert.equal((result.samples[0] as {tag?:string})?.tag, 'power.active.total');

  // Verify the second query uses the gateway UUID and lateral joins
  assert.equal(queries.length, 2);
  assert.ok(queries[1]?.sql.includes('CROSS JOIN LATERAL'));
  assert.deepEqual(queries[1]?.values, [gatewayId]);
});
