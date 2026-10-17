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
      if (sql.includes('FROM users WHERE email=$1')) {
        return { rows: options.existingUser ? [{ ...options.existingUser, password_hash: 'hashed', status: 'active' }] : [] };
      }
      if (sql.includes('SELECT id FROM sites WHERE id=ANY')) {
        return { rows: [{ id: (values[0] as string[])[0] }] };
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

  const revisionUpdate = statements.find(({ sql }) => sql.includes('permission_revision=permission_revision+1'))!;
  assert.ok(revisionUpdate);
  assert.deepEqual(revisionUpdate.values, [existingUserId]);
});

test('re-inviting existing employee without grants preserves existing overrides and scope', async () => {
  const existingUserId = '00000000-0000-0000-0000-000000000055';
  const { service, statements } = inviteFixture({
    existingUser: { id: existingUserId, role: 'operator' },
  });
  const result = await service.invite(
    {
      email: 'existing@example.test',
      displayName: 'Existing Staff',
      companyPosition: 'Senior Engineer',
    },
    ownerActor,
  );
  assert.equal(result.status, 'existing');
  assert.equal(result.userId, existingUserId);

  // Does not write empty overrides or reset scope in the query
  const grantUpdate = statements.find(({ sql }) => sql.includes('INSERT INTO employee_domain_grants'))!;
  assert.ok(grantUpdate);
  assert.equal(grantUpdate.sql.includes('overrides'), false);
  assert.equal(grantUpdate.sql.includes('scope_mode'), false);

  const revisionUpdate = statements.find(({ sql }) => sql.includes('permission_revision=permission_revision+1'))!;
  assert.ok(revisionUpdate);
  assert.deepEqual(revisionUpdate.values, [existingUserId]);
});

test('getInvitationDetails returns valid details including company branding', async () => {
  const token = 'abcdefghijklmnopqrstuvwxyz0123456789-_ABCDE'; // 43 chars
  const statements: { sql: string; values: unknown[] }[] = [];
  const db = {
    query: async (sql: string, values: unknown[] = []) => {
      statements.push({ sql, values });
      if (sql.includes('FROM user_invitations i')) {
        return {
          rows: [
            {
              email: 'staff@example.test',
              role: 'operator',
              expires_at: new Date(Date.now() + 86400000).toISOString(),
              consumed_at: null,
              revoked_at: null,
              displayName: 'Pre-filled Staff',
              userStatus: 'invited',
            },
          ],
        };
      }
      if (sql.includes('FROM company_profile')) {
        return {
          rows: [
            {
              company_name: 'Solar Tech Corp',
              logo_data: null,
              logo_url: 'https://example.test/logo.png',
            },
          ],
        };
      }
      return { rows: [] };
    },
  } as unknown as DatabaseService;
  const auth = { hashPassword: () => 'hashed' } as unknown as AuthService;
  const service = new InvitationService(db, auth);

  const details = await service.getInvitationDetails(token);
  assert.equal(details.email, 'staff@example.test');
  assert.equal(details.displayName, 'Pre-filled Staff');
  assert.equal(details.role, 'operator');
  assert.equal(details.companyName, 'Solar Tech Corp');
  assert.equal(details.logoUrl, 'https://example.test/logo.png');
});

test('getInvitationDetails rejects malformed or consumed tokens', async () => {
  const db = {
    query: async () => ({ rows: [] }),
  } as unknown as DatabaseService;
  const auth = { hashPassword: () => 'hashed' } as unknown as AuthService;
  const service = new InvitationService(db, auth);

  await assert.rejects(async () => service.getInvitationDetails('short-token'), /Invitation is invalid or expired/);

  const token = 'abcdefghijklmnopqrstuvwxyz0123456789-_ABCDE';
  await assert.rejects(async () => service.getInvitationDetails(token), /Invitation is invalid or expired/);
});

test('activate updates user with displayName and avatarData', async () => {
  const token = 'abcdefghijklmnopqrstuvwxyz0123456789-_ABCDE';
  const statements: { sql: string; values: unknown[] }[] = [];
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      statements.push({ sql, values });
      if (sql.includes('SELECT * FROM user_invitations WHERE token_hash=$1')) {
        return {
          rows: [
            {
              id: '00000000-0000-0000-0000-000000000099',
              user_id: '00000000-0000-0000-0000-000000000055',
              issuer_id: ownerActor.id,
              role: 'operator',
              customer_id: null,
              email: 'staff@example.test',
              delivery_status: 'sent',
              consumed_at: null,
              revoked_at: null,
              expires_at: new Date(Date.now() + 86400000).toISOString(),
            },
          ],
        };
      }
      if (sql.includes('SELECT id,email,role,status,customer_id,password_hash FROM users')) {
        return {
          rows: [
            {
              id: '00000000-0000-0000-0000-000000000055',
              email: 'staff@example.test',
              role: 'operator',
              status: 'invited',
              customer_id: null,
              password_hash: null,
            },
            {
              id: ownerActor.id,
              email: 'owner@example.test',
              role: 'owner',
              status: 'active',
              customer_id: null,
              password_hash: 'hashed',
            },
          ],
        };
      }
      if (sql.includes('UPDATE user_invitations SET consumed_at=now()')) {
        return { rows: [{ id: '00000000-0000-0000-0000-000000000099' }] };
      }
      return { rows: [] };
    },
  } as unknown as PoolClient;
  const db = {
    transaction: async <T>(work: (c: PoolClient) => Promise<T>) => work(client),
    query: async (sql: string, values: unknown[] = []) => {
      statements.push({ sql, values });
      return { rows: [] };
    },
  } as unknown as DatabaseService;
  const auth = { hashPassword: (pw: string) => `hashed_${pw}` } as unknown as AuthService;
  const service = new InvitationService(db, auth);

  const avatar = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  await service.activate(token, 'StrongP@ssw0rd123!', 'Edited Name', avatar);

  const userUpdate = statements.find(({ sql }) => sql.includes('UPDATE users SET status=\'active\''))!;
  assert.ok(userUpdate);
  assert.equal(userUpdate.values[0], '00000000-0000-0000-0000-000000000055');
  assert.equal(userUpdate.values[1], 'hashed_StrongP@ssw0rd123!');
  assert.equal(userUpdate.values[2], 'Edited Name');
  assert.equal(userUpdate.values[3], avatar);
});

test('activate rejects avatar payload exceeding 2MB limit', async () => {
  const token = 'abcdefghijklmnopqrstuvwxyz0123456789-_ABCDE';
  const db = {} as unknown as DatabaseService;
  const auth = { hashPassword: () => 'hashed' } as unknown as AuthService;
  const service = new InvitationService(db, auth);

  const oversizedAvatar = 'data:image/png;base64,' + 'A'.repeat(2_800_001);
  await assert.rejects(
    async () => service.activate(token, 'StrongP@ssw0rd123!', 'Name', oversizedAvatar),
    /Avatar image exceeds 2MB limit/,
  );
});

