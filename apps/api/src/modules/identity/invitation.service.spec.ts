import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { InvitationService } from './invitation.service.js';
import type { DatabaseService } from '../../database/database.service.js';
import type { AuthService } from './auth.service.js';
import type { PoolClient } from 'pg';

const ownerActor = { id: '00000000-0000-0000-0000-000000000001', role: 'owner', status: 'active' };

function inviteFixture(options: { existingUser?: { id: string; role: string }; actorRole?: string } = {}) {
  const statements: { sql: string; values: unknown[] }[] = [];
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      statements.push({ sql, values });
      if (sql.includes('SELECT id,role,status,customer_id')) {
        return { rows: [{ id: ownerActor.id, role: options.actorRole ?? 'owner', status: 'active', customerId: null }] };
      }
      if (sql.includes('INSERT INTO employee_positions')) {
        return { rows: [{ id: '00000000-0000-0000-0000-000000000010', name: values[1] }] };
      }
      if (sql.includes('SELECT id,role FROM users WHERE email=$1')) {
        return { rows: options.existingUser ? [options.existingUser] : [] };
      }
      if (sql.includes('INSERT INTO invitation_rate_limits')) {
        return { rows: [{ attempts: 1, window_started_at: 'now' }] };
      }
      if (sql.includes('INSERT INTO users(')) {
        return { rows: [{ id: values[0] }] };
      }
      return { rows: [] };
    },
  } as unknown as PoolClient;
  const db = {
    transaction: async <T>(work: (client: PoolClient) => Promise<T>) => work(client),
    query: async (sql: string, values: unknown[] = []) => {
      statements.push({ sql, values });
      return { rows: [{ delivery_status: 'pending_delivery' }] };
    },
  } as unknown as DatabaseService;
  const auth = { hashPassword: () => 'hashed' } as unknown as AuthService;
  return { service: new InvitationService(db, auth), statements };
}

test('staff invitation defaults role to operator and inserts domain grants with overrides and scope', async () => {
  const { service, statements } = inviteFixture();
  const permissions = { 'business.billing.view': true };
  const scope = { mode: 'selected' as const, siteIds: ['00000000-0000-0000-0000-000000000099'] };
  const result = await service.invite(
    {
      email: 'staff@example.test',
      displayName: 'Staff Person',
      companyPosition: 'Solar Auditor',
      permissions,
      scope,
    },
    ownerActor,
  );
  assert.ok(result.userId);
  const userInsert = statements.find(({ sql }) => sql.includes('INSERT INTO users('))!;
  assert.equal(userInsert.values[3], 'operator'); // defaulted role
  assert.equal(userInsert.values[5], '00000000-0000-0000-0000-000000000010'); // company_position_id

  const grantInsert = statements.find(({ sql }) => sql.includes('INSERT INTO employee_domain_grants'))!;
  assert.ok(grantInsert);
  assert.equal(grantInsert.values[1], 'business');
  assert.equal(grantInsert.values[2], '00000000-0000-0000-0000-000000000010');
  assert.equal(grantInsert.values[3], JSON.stringify(permissions));
  assert.equal(grantInsert.values[4], 'selected');
  assert.deepEqual(grantInsert.values[5], scope.siteIds);
  assert.equal(grantInsert.values[6], ownerActor.id);
});

test('existing employee invitation updates domain grants with provided overrides and scope', async () => {
  const existingUserId = '00000000-0000-0000-0000-000000000055';
  const { service, statements } = inviteFixture({
    existingUser: { id: existingUserId, role: 'operator' },
  });
  const permissions = { 'business.billing.approve': true };
  const result = await service.invite(
    {
      email: 'existing@example.test',
      displayName: 'Existing Staff',
      companyPosition: 'Solar Auditor',
      permissions,
      scope: { mode: 'all', siteIds: [] },
    },
    ownerActor,
  );
  assert.equal(result.status, 'existing');
  assert.equal(result.userId, existingUserId);

  const grantUpdate = statements.find(({ sql }) => sql.includes('INSERT INTO employee_domain_grants') && sql.includes('ON CONFLICT(user_id,domain) DO UPDATE'))!;
  assert.ok(grantUpdate);
  assert.equal(grantUpdate.values[0], existingUserId);
  assert.equal(grantUpdate.values[1], 'business');
  assert.equal(grantUpdate.values[3], JSON.stringify(permissions));
  assert.equal(grantUpdate.values[4], 'all');
  assert.deepEqual(grantUpdate.values[5], []);
});
