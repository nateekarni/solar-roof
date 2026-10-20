import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Pool } from 'pg';

function testDatabaseUrl() {
  const value = process.env.NOTIFICATION_TEST_DATABASE_URL;
  assert.ok(value);
  const url = new URL(value);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.match(url.pathname, /^\/[a-z0-9_]*(?:test|review)[a-z0-9_]*$/i);
  return value;
}

test('invoice notification migration deep-links new and existing events to the customer document preview', { skip: process.env.NOTIFICATION_SQL_TEST !== 'true' }, async () => {
  const pool = new Pool({ connectionString: testDatabaseUrl() });
  const client = await pool.connect();
  const schema = `invoice_notification_${randomUUID().replaceAll('-', '')}`;
  const site = '20000000-0000-0000-0000-000000000001';
  const cycle = '40000000-0000-0000-0000-000000000001';
  const document = '50000000-0000-0000-0000-000000000001';
  const legacyDocument = '50000000-0000-0000-0000-000000000002';
  const destination = `/records/billing/${cycle}?document=${document}`;
  try {
    await client.query(`CREATE SCHEMA ${schema}; SET search_path=${schema},public`);
    await client.query(`
      CREATE TABLE sites(id uuid PRIMARY KEY);
      CREATE TABLE billing_cycles(id uuid PRIMARY KEY,site_id uuid NOT NULL REFERENCES sites(id));
      CREATE TABLE documents(id uuid PRIMARY KEY,site_id uuid NOT NULL REFERENCES sites(id),billing_cycle_id uuid REFERENCES billing_cycles(id),document_type text,status text,document_number text);
      CREATE TABLE payments(id uuid PRIMARY KEY,billing_cycle_id uuid REFERENCES billing_cycles(id),verified_at timestamptz,status text);
      CREATE TABLE notification_feed_events(id text PRIMARY KEY,site_id uuid,title text,detail text,destination text,created_at timestamptz DEFAULT now());
    `);
    await client.query(await readFile(new URL('../../../../../infra/migrations/066_customer_invoice_notification_links.sql', import.meta.url), 'utf8'));
    await client.query('CREATE TRIGGER documents_notification_feed AFTER INSERT OR UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION capture_notification_feed_event()');
    await client.query('INSERT INTO sites VALUES($1)', [site]);
    await client.query('INSERT INTO billing_cycles VALUES($1,$2)', [cycle, site]);
    await client.query("INSERT INTO documents VALUES($1,$2,$3,'invoice','draft','INV-1')", [document, site, cycle]);
    await client.query("UPDATE documents SET status='issued' WHERE id=$1", [document]);
    assert.equal((await client.query('SELECT destination FROM notification_feed_events WHERE id=$1', [`document:${document}`])).rows[0].destination, destination);

    await client.query("INSERT INTO documents VALUES($1,$2,NULL,'invoice','draft','INV-LEGACY')", [legacyDocument, site]);
    await client.query("UPDATE documents SET status='issued' WHERE id=$1", [legacyDocument]);
    assert.equal((await client.query('SELECT destination FROM notification_feed_events WHERE id=$1', [`document:${legacyDocument}`])).rows[0].destination, `/records/documents/${legacyDocument}`);

    await client.query('UPDATE notification_feed_events SET destination=$1 WHERE id=$2', [`/records/documents/${document}`, `document:${document}`]);
    await client.query(await readFile(new URL('../../../../../infra/migrations/066_customer_invoice_notification_links.sql', import.meta.url), 'utf8'));
    assert.equal((await client.query('SELECT destination FROM notification_feed_events WHERE id=$1', [`document:${document}`])).rows[0].destination, destination);
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    client.release();
    await pool.end();
  }
});
