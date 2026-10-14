import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {ConflictException, ForbiddenException} from '@nestjs/common';
import {Pool} from 'pg';
import {DocumentIdentityService} from './document-identity.js';

const service = new DocumentIdentityService();

test('resolves active approver identity from canonical company position', async () => {
  const client = {query: async (sql: string, params: unknown[]) => {
    assert.deepEqual(params, ['user-a']);
    assert.match(sql, /p\.id\s*=\s*u\.company_position_id/);
    assert.match(sql, /u\.status\s*=\s*'active'/);
    assert.match(sql, /FOR SHARE OF u/i);
    return {rows: [{id: 'user-a', display_name: 'สมชาย ใจดี', position: 'กรรมการบริษัท', signature_data: null}]};
  }};
  assert.deepEqual(await service.resolve(client as never, 'user-a'), {
    userId: 'user-a', displayName: 'สมชาย ใจดี', position: 'กรรมการบริษัท',
  });
});

test('includes the personal signature when one is stored', async () => {
  const client = {query: async () => ({rows: [{
    id: 'user-a', display_name: 'สมชาย ใจดี', position: 'กรรมการบริษัท',
    signature_data: 'data:image/png;base64,iVBORw0KGgo=',
  }]})};
  assert.deepEqual(await service.resolve(client as never, 'user-a'), {
    userId: 'user-a', displayName: 'สมชาย ใจดี', position: 'กรรมการบริษัท',
    signatureDataUri: 'data:image/png;base64,iVBORw0KGgo=',
  });
});

test('rejects inactive or missing approvers with readable guidance', async () => {
  const client = {query: async () => ({rows: []})};
  await assert.rejects(() => service.resolve(client as never, 'user-a'), error => {
    assert.ok(error instanceof ForbiddenException);
    assert.equal(error.getStatus(), 403);
    assert.match(error.message, /บัญชีผู้อนุมัติไม่พร้อมใช้งาน/);
    assert.ok(!error.message.includes('user-a'));
    return true;
  });
});

for (const position of [null, '', '   ']) {
  test(`rejects positionless approvers (${JSON.stringify(position)}) with named guidance`, async () => {
    const client = {query: async () => ({rows: [{
      id: 'user-a', display_name: 'สมชาย ใจดี', position, signature_data: null,
    }]})};
    await assert.rejects(() => service.resolve(client as never, 'user-a'), error => {
      assert.ok(error instanceof ConflictException);
      assert.equal(error.getStatus(), 409);
      assert.match(error.message, /กำหนดตำแหน่งของ สมชาย ใจดี/);
      assert.match(error.message, /หน้าพนักงานและสิทธิ์/);
      assert.ok(!error.message.includes('user-a'));
      return true;
    });
  });
}

// Dedicated loopback review/test database only; never uses application DATABASE_URL.
test('migration backfills unambiguous positions and enforces identity storage constraints', {
  skip: !process.env.DOCUMENT_IDENTITY_TEST_DATABASE_URL,
}, async () => {
  const connectionString = process.env.DOCUMENT_IDENTITY_TEST_DATABASE_URL!;
  const target = new URL(connectionString);
  assert.ok(['postgres:', 'postgresql:'].includes(target.protocol)
    && ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
    && !target.search && !target.hash, 'Dedicated loopback PostgreSQL test URL required');
  assert.match(target.pathname, /^\/[a-z0-9_]*(?:test|review)[a-z0-9_]*$/i);
  const schema = 'document_identity_test_' + randomUUID().replaceAll('-', '');
  const pool = new Pool({connectionString, options: `-c search_path=${schema}`, max: 2});
  try {
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(`
      CREATE TABLE users(id uuid PRIMARY KEY, display_name text, status text);
      CREATE TABLE employee_positions(id uuid PRIMARY KEY, name text);
      CREATE TABLE employee_domain_grants(user_id uuid REFERENCES users(id), domain text, position_id uuid REFERENCES employee_positions(id));
      INSERT INTO employee_positions VALUES
        ('00000000-0000-0000-0000-000000000001','กรรมการบริษัท'),
        ('00000000-0000-0000-0000-000000000002','วิศวกร');
      INSERT INTO users VALUES
        ('00000000-0000-0000-0000-000000000011','สมชาย ใจดี','active'),
        ('00000000-0000-0000-0000-000000000012','หลายตำแหน่ง','active'),
        ('00000000-0000-0000-0000-000000000013','ไม่มีตำแหน่ง','active'),
        ('00000000-0000-0000-0000-000000000014','ปิดบัญชี','disabled');
      INSERT INTO employee_domain_grants VALUES
        ('00000000-0000-0000-0000-000000000011','business','00000000-0000-0000-0000-000000000001'),
        ('00000000-0000-0000-0000-000000000011','technical','00000000-0000-0000-0000-000000000001'),
        ('00000000-0000-0000-0000-000000000012','business','00000000-0000-0000-0000-000000000001'),
        ('00000000-0000-0000-0000-000000000012','technical','00000000-0000-0000-0000-000000000002'),
        ('00000000-0000-0000-0000-000000000013','business',NULL);
    `);
    await pool.query(await readFile(new URL('../../../../../infra/migrations/058_user_document_identity.sql', import.meta.url), 'utf8'));
    assert.deepEqual((await pool.query('SELECT company_position_id FROM users ORDER BY id')).rows, [
      {company_position_id: '00000000-0000-0000-0000-000000000001'},
      {company_position_id: null}, {company_position_id: null}, {company_position_id: null},
    ]);
    const userId = '00000000-0000-0000-0000-000000000011';
    assert.deepEqual(await service.resolve(pool as never, userId), {
      userId, displayName: 'สมชาย ใจดี', position: 'กรรมการบริษัท',
    });
    await assert.rejects(service.resolve(pool as never, '00000000-0000-0000-0000-000000000014'), ForbiddenException);
    await assert.rejects(service.resolve(pool as never, '00000000-0000-0000-0000-000000000013'), ConflictException);
    for (const signature of ['data:image/png;base64,AA==', 'data:image/jpeg;base64,AA==', null]) {
      await pool.query('UPDATE users SET signature_data=$1 WHERE id=$2', [signature, userId]);
    }
    for (const signature of ['data:image/svg+xml;base64,AA==', 'https://example.test/signature.png', 'data:image/png;base64,' + 'A'.repeat(350000)]) {
      await assert.rejects(pool.query('UPDATE users SET signature_data=$1 WHERE id=$2', [signature, userId]), /users_signature_data_bounded/);
    }
    await assert.rejects(pool.query('UPDATE users SET company_position_id=$1 WHERE id=$2', [randomUUID(), userId]), /foreign key/);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await service.resolve(client, userId);
      await pool.query("SET lock_timeout='100ms'");
      await assert.rejects(pool.query('UPDATE users SET display_name=$1 WHERE id=$2', ['Changed', userId]), /lock timeout/);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
  }
});
