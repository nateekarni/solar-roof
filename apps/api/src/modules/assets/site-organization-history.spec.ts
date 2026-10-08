import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException } from '@nestjs/common';
import { AssetsController } from './assets.controller.js';
import { OperationsService } from '../dashboard/operations.service.js';
import type { DatabaseService } from '../../database/database.service.js';
import type { MqttIngestionService } from '../telemetry/mqtt-ingestion.service.js';

/** Transactional fake persists the real controller's ownership writes, including rollback. */
function fixture(history: 'contracts' | 'billing_cycles' | 'documents' | null = null) {
  type Site = { id: string; school_id: string; name: string };
  type Organization = { id: string; name: string; code: string };
  let site: Site = { id: 'site-a', school_id: 'org-a', name: 'Original site' };
  let organizations = new Map<string, Organization>([
    ['org-a', { id: 'org-a', name: 'Original customer', code: 'ORG-A' }],
    ['org-b', { id: 'org-b', name: 'Other customer', code: 'ORG-B' }],
  ]);
  let pendingSite: Site | undefined;
  let pendingOrganizations: Map<string, Organization> | undefined;
  const statements: string[] = [];
  const query = async (sql: string, values: unknown[] = []) => {
    statements.push(sql);
    if (sql === 'BEGIN') { pendingSite = { ...site }; pendingOrganizations = new Map(organizations); return { rows: [] }; }
    if (sql === 'COMMIT') { site = pendingSite!; organizations = pendingOrganizations!; pendingSite = undefined; pendingOrganizations = undefined; return { rows: [] }; }
    if (sql === 'ROLLBACK') { pendingSite = undefined; pendingOrganizations = undefined; return { rows: [] }; }
    const currentSite = pendingSite ?? site;
    const currentOrganizations = pendingOrganizations ?? organizations;
    if (sql.includes('EXISTS') && ['contracts', 'billing_cycles', 'documents'].some(table => sql.includes(`FROM ${table}`))) {
      const hasHistory = Boolean(history && sql.includes(`FROM ${history}`));
      return { rows: [{ has_history: hasHistory, hasHistory }] };
    }
    if (sql.includes('FROM documents d JOIN sites si')) {
      const scope = values[1] as string[];
      return { rows: scope.includes(currentSite.school_id) ? [{ id: String(values[0]), siteId: currentSite.id }] : [] };
    }
    if (sql.includes('FROM document_artifacts')) return { rows: [{ pdf_bytes: Buffer.from('saved original bytes'), sha256: 'unchanged-original-hash' }] };
    if (sql.includes('FROM sites WHERE id')) return { rows: values[0] === site.id ? [{ ...currentSite }] : [] };
    if (sql.includes('FROM schools WHERE id')) return { rows: currentOrganizations.has(String(values[0])) ? [currentOrganizations.get(String(values[0]))!] : [] };
    if (sql.includes('FROM schools WHERE lower')) return { rows: [...currentOrganizations.values()].filter(org => org.name.toLowerCase() === String(values[0]).toLowerCase()) };
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (sql.includes('INSERT INTO schools')) {
      const organization = { id: String(values[0]), name: String(values[1]), code: String(values[2]) };
      currentOrganizations.set(organization.id, organization); return { rows: [organization] };
    }
    if (sql.startsWith('UPDATE sites SET')) {
      for (const field of ['name', 'school_id'] as const) {
        const assignment = new RegExp(`${field} = \\$(\\d+)`).exec(sql);
        if (assignment) currentSite[field] = String(values[Number(assignment[1]) - 1]);
      }
      return { rows: [] };
    }
    if (sql.includes('FROM gateways g JOIN sites')) return { rows: [] };
    throw new Error(`Unexpected fixture statement: ${sql}`);
  };
  const db = { query, pool: { connect: async () => ({ query, release() {} }) } };
  const controller = new AssetsController(db as unknown as DatabaseService, { refreshSubscriptions: async () => {} } as unknown as MqttIngestionService);
  return { controller, operations: new OperationsService(db as unknown as DatabaseService), statements, site: () => ({ ...site }), organizations: () => new Map(organizations) };
}

for (const history of ['contracts', 'billing_cycles', 'documents'] as const) {
  test(`site ownership cannot move when ${history} history exists`, async () => {
    const f = fixture(history);
    await assert.rejects(f.controller.updateSite('site-a', { schoolId: 'org-b' }), error => {
      assert.ok(error instanceof ConflictException);
      const message = error.message;
      assert.match(message, /organization/i);
      assert.match(message, /[ก-๙]/);
      return true;
    });
    assert.equal(f.site().school_id, 'org-a');
    assert.equal(f.statements.some(sql => sql.startsWith('UPDATE sites SET')), false);
    assert.ok(f.statements.includes('ROLLBACK'));
  });
}

test('same-organization edits and omitted organization preserve ownership even with history', async () => {
  const f = fixture('documents');
  await f.controller.updateSite('site-a', { schoolId: 'org-a', name: 'Renamed site' });
  assert.deepEqual(f.site(), { id: 'site-a', school_id: 'org-a', name: 'Renamed site' });
  await f.controller.updateSite('site-a', { name: 'Renamed again' });
  assert.equal(f.site().name, 'Renamed again');
  assert.equal(f.site().school_id, 'org-a');
});

test('a history-free site can move to an existing organization', async () => {
  const f = fixture();
  await f.controller.updateSite('site-a', { schoolId: 'org-b', name: 'Reassigned site' });
  assert.deepEqual(f.site(), { id: 'site-a', school_id: 'org-b', name: 'Reassigned site' });
});

test('denied new-organization reassignment rolls back the customer master and site', async () => {
  const f = fixture('contracts');
  await assert.rejects(f.controller.updateSite('site-a', { newOrganization: { name: 'New customer', code: 'ORG-NEW' } }), ConflictException);
  assert.equal(f.site().school_id, 'org-a');
  assert.equal(f.organizations().size, 2);
  assert.equal([...f.organizations().values()].some(org => org.code === 'ORG-NEW'), false);
  assert.ok(f.statements.some(sql => sql.includes('INSERT INTO schools')));
  assert.ok(f.statements.includes('ROLLBACK'));
});

test('a history-free site can move to a newly created organization', async () => {
  const f = fixture();
  await f.controller.updateSite('site-a', { newOrganization: { name: 'New customer', code: 'ORG-NEW' } });
  const created = [...f.organizations().values()].find(org => org.code === 'ORG-NEW');
  assert.ok(created);
  assert.equal(f.site().school_id, created.id);
  assert.equal(f.organizations().size, 3);
});

test('denied reassignment preserves the original organization PDF access and denies the target organization', async () => {
  const f = fixture('documents');
  const documentId = '11111111-1111-4111-8111-111111111111';
  const originalActor = { role: 'school_user', schoolId: 'org-a' };
  const targetActor = { role: 'school_user', schoolId: 'org-b' };
  const before = await f.operations.documentPdf(documentId, originalActor);
  await assert.rejects(f.operations.documentPdf(documentId, targetActor), /not found/i);
  await assert.rejects(f.controller.updateSite('site-a', { schoolId: 'org-b' }), ConflictException);
  const after = await f.operations.documentPdf(documentId, originalActor);
  assert.deepEqual(after.pdf_bytes, before.pdf_bytes);
  assert.equal(after.sha256, before.sha256);
  await assert.rejects(f.operations.documentPdf(documentId, targetActor), /not found/i);
});
