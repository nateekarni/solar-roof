import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MqttAuthController } from './mqtt-auth.controller.js';

describe('MqttAuthController - EMQX Dynamic Auth & ACL', () => {
  let controller: MqttAuthController;
  let mockDb: {
    queries: Array<{ sql: string; params: any[] }>;
    query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
  };

  beforeEach(() => {
    process.env.MQTT_PASSWORD = 'super-secret-backend-password';
    mockDb = {
      queries: [],
      query: async (sql: string, params: any[] = []) => {
        mockDb.queries.push({ sql, params });
        if (sql.includes('FROM gateways')) {
          // If param is GW-REGISTERED, return a gateway row
          if (params[0] === 'GW-REGISTERED') {
            return { rows: [{ id: '11111111-1111-1111-1111-111111111111', name: 'GW-REGISTERED', external_gateway_id: 'GW-REGISTERED' }] };
          }
          return { rows: [] };
        }
        return { rows: [] };
      },
    };
    controller = new MqttAuthController(mockDb as any);
  });

  describe('Authentication (POST /v1/internal/mqtt/auth)', () => {
    it('allows solar-backend with correct password as superuser', async () => {
      const res = await controller.authenticate({
        clientid: 'backend-1',
        username: 'solar-backend',
        password: 'super-secret-backend-password',
      });
      assert.deepEqual(res, { result: 'allow', is_superuser: true });
    });

    it('denies solar-backend with incorrect password', async () => {
      const res = await controller.authenticate({
        clientid: 'backend-1',
        username: 'solar-backend',
        password: 'wrong-password',
      });
      assert.deepEqual(res, { result: 'deny' });
    });

    it('denies invalid usernames with invalid characters or empty string', async () => {
      const res1 = await controller.authenticate({ clientid: '1', username: '' });
      assert.deepEqual(res1, { result: 'deny' });

      const res2 = await controller.authenticate({ clientid: '1', username: 'bad/topic' });
      assert.deepEqual(res2, { result: 'deny' });

      const res3 = await controller.authenticate({ clientid: '1', username: '+wildcard' });
      assert.deepEqual(res3, { result: 'deny' });
    });

    it('allows registered gateway and updates last_seen_at', async () => {
      const res = await controller.authenticate({
        clientid: 'gw-client',
        username: 'GW-REGISTERED',
        password: 'any-password',
      });
      assert.deepEqual(res, { result: 'allow', is_superuser: false });
      const updateQuery = mockDb.queries.find(q => q.sql.includes('UPDATE gateways SET last_seen_at'));
      assert.ok(updateQuery, 'Expected update on gateways last_seen_at');
    });

    it('allows unregistered gateway and records into discovered_gateways automatically', async () => {
      const res = await controller.authenticate({
        clientid: 'gw-new-client',
        username: 'GW-NEW-001',
        password: 'initial-password',
        peerhost: '192.168.1.50',
      });
      assert.deepEqual(res, { result: 'allow', is_superuser: false });
      const insertQuery = mockDb.queries.find(q => q.sql.includes('INSERT INTO discovered_gateways'));
      assert.ok(insertQuery, 'Expected insert into discovered_gateways');
      assert.equal(insertQuery?.params[0], 'GW-NEW-001');
    });
  });

  describe('Authorization / ACL (POST /v1/internal/mqtt/acl)', () => {
    it('allows solar-backend to publish and subscribe to any topic', async () => {
      const resPub = await controller.authorize({
        username: 'solar-backend',
        action: 'publish',
        topic: 'solar/v1/sites/SITE-01/gateways/GW-01/dataAcept',
      });
      assert.deepEqual(resPub, { result: 'allow' });

      const resSub = await controller.authorize({
        username: 'solar-backend',
        action: 'subscribe',
        topic: '#',
      });
      assert.deepEqual(resSub, { result: 'allow' });
    });

    it('allows gateway to publish only to its own telemetry topic', async () => {
      // Valid publish
      const resOk = await controller.authorize({
        username: 'GW-001',
        action: 'publish',
        topic: 'solar/v1/sites/SITE-01/gateways/GW-001/devices/SPM91-01/telemetry',
      });
      assert.deepEqual(resOk, { result: 'allow' });

      // Valid legacy publish
      const resLegacy = await controller.authorize({
        username: 'GW-001',
        action: 'publish',
        topic: 'energy/GW-001/telemetry',
      });
      assert.deepEqual(resLegacy, { result: 'allow' });

      // Denied: trying to publish to another gateway ID
      const resOther = await controller.authorize({
        username: 'GW-001',
        action: 'publish',
        topic: 'solar/v1/sites/SITE-01/gateways/GW-OTHER/devices/SPM91-01/telemetry',
      });
      assert.deepEqual(resOther, { result: 'deny' });

      // Denied: trying to publish to dataAcept
      const resDataAccept = await controller.authorize({
        username: 'GW-001',
        action: 'publish',
        topic: 'solar/v1/sites/SITE-01/gateways/GW-001/dataAcept',
      });
      assert.deepEqual(resDataAccept, { result: 'deny' });
    });

    it('allows gateway to subscribe only to its own ACK topic', async () => {
      // Valid subscribe exact
      const resOk = await controller.authorize({
        username: 'GW-001',
        action: 'subscribe',
        topic: 'solar/v1/sites/SITE-01/gateways/GW-001/dataAcept',
      });
      assert.deepEqual(resOk, { result: 'allow' });

      // Valid subscribe with wildcard site
      const resWildcard = await controller.authorize({
        username: 'GW-001',
        action: 'subscribe',
        topic: 'solar/v1/sites/+/gateways/GW-001/dataAcept',
      });
      assert.deepEqual(resWildcard, { result: 'allow' });

      // Denied: trying to subscribe to another gateway ACK
      const resOther = await controller.authorize({
        username: 'GW-001',
        action: 'subscribe',
        topic: 'solar/v1/sites/SITE-01/gateways/GW-OTHER/dataAcept',
      });
      assert.deepEqual(resOther, { result: 'deny' });

      // Denied: trying to subscribe to telemetry
      const resSubTelem = await controller.authorize({
        username: 'GW-001',
        action: 'subscribe',
        topic: 'solar/v1/sites/SITE-01/gateways/GW-001/devices/+/telemetry',
      });
      assert.deepEqual(resSubTelem, { result: 'deny' });
    });
  });
});
