import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { BillingController } from './billing.controller.js';
import { AuthService } from '../identity/auth.service.js';
import type { DatabaseService } from '../../database/database.service.js';
import type { FinancialApplicationService } from './financial-application.service.js';
import type { FinancialReadinessService } from '../financial-readiness/financial-readiness.service.js';
import type { ContractPdfService } from '../documents/contract-pdf.service.js';
import { effectiveAuthorization } from '../../common/auth/authorization.js';

const actorId = '55555555-5555-4555-8555-555555555555';
const cycleId = '11111111-1111-4111-8111-111111111111';
const authService = new AuthService('test-access', 'test-refresh');
const validPassword = 'correct-password-123';
const passwordHash = authService.hashPassword(validPassword);
const actor = {
  id: actorId,
  role: 'owner',
  authorization: effectiveAuthorization('owner', 1, [
    { domain: 'business', preset: { 'business.billing.approve': true }, overrides: {}, scope: { mode: 'all', siteIds: [] } },
  ]),
};

function createMockController() {
  let approved = false;
  const db = {
    query: async (sql: string, params: unknown[] = []) => {
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      if (sql.includes('FROM users WHERE id=$1')) {
        return {
          rows: [
            {
              id: actorId,
              role: 'owner',
              status: 'active',
              permission_revision: 1,
              password_hash: passwordHash,
            },
          ],
        };
      }
      if (sql.includes('FROM employee_domain_grants')) {
        return {
          rows: [
            {
              domain: 'business',
              preset: { 'business.billing.approve': true },
              overrides: {},
              scope_mode: 'all',
              site_ids: [],
            },
          ],
        };
      }
      return {
        rows: [
          {
            id: cycleId,
            siteId: 'site-1',
            period: '2026-09',
            customer: 'Customer A',
            site: 'Site A',
          },
        ],
      };
    },
    transaction: async (run: (client: any) => any) => run(db),
  };

  const financial = {
    approveInvoice: async () => {
      approved = true;
      return {
        created: true,
        label: { period: '2026-09', customer: 'Customer A', site: 'Site A' },
        document: { id: 'doc-1', documentNumber: 'INV-001' },
      };
    },
  };

  const controller = new BillingController(
    db as unknown as DatabaseService,
    {} as FinancialReadinessService,
    financial as unknown as FinancialApplicationService,
    {} as ContractPdfService,
    undefined,
    authService
  );

  return { controller, wasApproved: () => approved };
}

test('single approval rejects missing password with UnauthorizedException', async () => {
  const { controller, wasApproved } = createMockController();
  await assert.rejects(
    async () => controller.approveIssuance(cycleId, {}, { user: actor }),
    (err: any) => {
      assert.ok(err instanceof UnauthorizedException);
      assert.match(err.message, /รหัสผ่านไม่ถูกต้อง/);
      return true;
    }
  );
  assert.equal(wasApproved(), false);
});

test('single approval rejects incorrect password with UnauthorizedException', async () => {
  const { controller, wasApproved } = createMockController();
  await assert.rejects(
    async () => controller.approveIssuance(cycleId, { password: 'wrong-password' }, { user: actor }),
    (err: any) => {
      assert.ok(err instanceof UnauthorizedException);
      assert.match(err.message, /รหัสผ่านไม่ถูกต้อง/);
      return true;
    }
  );
  assert.equal(wasApproved(), false);
});

test('single approval succeeds and issues document with correct password', async () => {
  const { controller, wasApproved } = createMockController();
  const result = await controller.approveIssuance(cycleId, { password: validPassword }, { user: actor });
  assert.equal(wasApproved(), true);
  assert.equal(result.status, 'issued');
  assert.equal(result.documentNumber, 'INV-001');
});

test('bulk approval rejects missing password with UnauthorizedException', async () => {
  const { controller, wasApproved } = createMockController();
  await assert.rejects(
    async () => controller.approveMany({ billingCycleIds: [cycleId] }, { user: actor }),
    (err: any) => {
      assert.ok(err instanceof UnauthorizedException);
      assert.match(err.message, /รหัสผ่านไม่ถูกต้อง/);
      return true;
    }
  );
  assert.equal(wasApproved(), false);
});

test('bulk approval rejects incorrect password with UnauthorizedException', async () => {
  const { controller, wasApproved } = createMockController();
  await assert.rejects(
    async () => controller.approveMany({ billingCycleIds: [cycleId], password: 'wrong-password' }, { user: actor }),
    (err: any) => {
      assert.ok(err instanceof UnauthorizedException);
      assert.match(err.message, /รหัสผ่านไม่ถูกต้อง/);
      return true;
    }
  );
  assert.equal(wasApproved(), false);
});

test('bulk approval succeeds and issues documents with correct password', async () => {
  const { controller, wasApproved } = createMockController();
  const response = await controller.approveMany(
    { billingCycleIds: [cycleId], password: validPassword },
    { user: actor }
  );
  assert.equal(wasApproved(), true);
  assert.equal(response.results.length, 1);
  assert.equal(response.results[0]?.status, 'issued');
  assert.equal(response.results[0]?.documentNumber, 'INV-001');
});
