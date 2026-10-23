import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { AssetsController } from './assets.controller.js';
import { AssetsService } from './assets.service.js';

const gatewayColumns=new Set(['id','site_id','name','external_gateway_id','endpoint','last_seen_at','polling_interval_seconds','status',
  'desired_config_version','published_config_version','acknowledged_config_version','applied_config_version','lifecycle_state','config_state','retired_at']);
function assertKnownGatewayColumns(sql:string){
  for(const [,column] of sql.matchAll(/\bg\.([a-z_]+)/g))if(!gatewayColumns.has(column!))throw new Error(`column gateways.${column} does not exist`);
}

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
      assertKnownGatewayColumns(sql);
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
              connectionState: 'online',
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
      if (sql.includes('FROM payload_messages m')) {
        return {rows:[{
          id:'payload-uuid',deviceId:'device-uuid',messageId:'message-1',lotNumber:'3',sequence:'8',
          polledAt:new Date('2026-10-18T08:00:00.000Z'),sentAt:new Date('2026-10-18T08:00:00.500Z'),receivedAt:new Date('2026-10-18T08:00:01.000Z'),
          payload:{messageId:'message-1',data:{values:{'power.active.total':5500}}},sampleCount:'1',quality:'good',communication:'online',pollGroup:'realtime',
        }]};
      }
      return { rows: [] };
    },
  };

  const controller = new AssetsController(db as any, {} as any);
  const result = await controller.gatewayTelemetry(gatewayId);

  assert.equal(result.gateway.id, gatewayId);
  assert.equal(result.gateway.status, 'online');
  assert.equal(result.gateway.connectionState, 'online');
  assert.equal(result.samples.length, 1);
  assert.equal(result.samples[0]?.value, 5500);
  assert.equal(result.samples[0]?.rawValue, 5500);
  assert.equal(result.samples[0]?.polledAt, '2026-10-18T08:00:00.000Z');
  assert.equal(result.samples[0]?.sourceTime, '2026-10-18T08:00:00.000Z');
  assert.equal(result.samples[0]?.receivedAt, '2026-10-18T08:00:01.000Z');
  assert.equal((result.samples[0] as {tag?:string})?.tag, 'power.active.total');
  assert.equal(result.payloads.length,1);
  assert.equal(result.payloads[0]?.messageId,'message-1');
  assert.equal(result.payloads[0]?.sampleCount,1);
  assert.deepEqual(result.payloads[0]?.payload,{messageId:'message-1',data:{values:{'power.active.total':5500}}});

  // Verify the second query uses the gateway UUID and lateral joins
  assert.equal(queries.length, 3);
  assert.ok(queries[1]?.sql.includes('CROSS JOIN LATERAL'));
  assert.deepEqual(queries[1]?.values, [gatewayId]);
  assert.ok(queries[2]?.sql.includes('FROM payload_messages m'));
  assert.deepEqual(queries[2]?.values,[gatewayId]);
});

test('gateway list reads the cumulative value from the active billing source instead of solar production',async()=>{
  let query='';
  const db={query:async(sql:string)=>{query=sql;return {rows:[{id:'gateway',billingEnergyKwh:'29140'}]};}};
  const rows=await new AssetsService(db as any).listGateways(null);
  assert.equal(rows[0]?.billingEnergyKwh,'29140');
  assert.match(query,/telemetry_raw/);
  assert.match(query,/billing_source_binding_id/);
  assert.match(query,/total_energy_kwh/);
  assert.match(query,/AS "billingEnergyKwh"/);
});

test('gateway collection queries stay inside the migrated gateway schema',async()=>{
  const query=async(sql:string)=>{assertKnownGatewayColumns(sql);return {rows:[]};};
  const db={query} as any;
  await new AssetsController(db,{} as any).listGateways({user:{role:'admin'}});
  await new AssetsService(db).listGateways(null);
});
