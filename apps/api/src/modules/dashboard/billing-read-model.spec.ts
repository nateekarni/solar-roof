import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { approvedAmount, daysOverdue, collectionStatus, billingStatusView } from './billing-read-model.js';

test('billing lifecycle SQL preserves public precedence and excludes non-payable cycles', {
  skip: !process.env.FINANCIAL_READINESS_TEST_DATABASE_URL,
}, async () => {
  const connectionString = process.env.FINANCIAL_READINESS_TEST_DATABASE_URL!;
  const url = new URL(connectionString);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '15449');
  assert.equal(url.pathname, '/solar_financial_flow_review');
  assert.equal(url.search, '');
  assert.equal(url.hash, '');
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TEMP TABLE payments(billing_cycle_id int, amount numeric, verified_amount numeric, status text) ON COMMIT DROP;
      CREATE TEMP TABLE documents(billing_cycle_id int, document_type text, is_current boolean, status text) ON COMMIT DROP;
      INSERT INTO payments VALUES
        (3,40,NULL,'paid'),(4,40,NULL,'paid'),(4,60,NULL,'pending_verification'),
        (5,1,100,'paid'),(5,20,NULL,'pending_verification'),
        (6,100,NULL,'pending_verification'),(7,100,NULL,'paid'),(8,100,NULL,'paid'),
        (9,100,NULL,'paid'),(10,100,NULL,'paid'),(11,100,NULL,'paid'),
        (12,100,NULL,'rejected');
      INSERT INTO documents SELECT n,'invoice',true,'issued' FROM generate_series(1,12) n WHERE n<>10;
      UPDATE documents SET is_current=false WHERE billing_cycle_id=11;
    `);
    const { rows } = await client.query(`
      SELECT q.id,q."collectionStatus",q.approved,q."daysOverdue",${billingStatusView} AS status FROM (
        SELECT b.id,b.status,NULL::jsonb AS "pendingReplacement",${collectionStatus} AS "collectionStatus",
          (${approvedAmount})::text AS approved,${daysOverdue} AS "daysOverdue"
        FROM (SELECT id,status,100::numeric AS amount,
          (now() AT TIME ZONE 'Asia/Bangkok')::date+offset_days AS due_date
          FROM (VALUES (1,'issued',10),(2,'issued',-1),(3,'issued',-1),(4,'issued',-1),
            (5,'issued',-1),(6,'pending_issue_approval',-1),(7,'draft',-1),
            (8,'cancelled',-1),(9,'superseded',-1),(10,'issued',-1),
            (11,'issued',-1),(12,'issued',10)) fixture(id,status,offset_days)) b
      ) q ORDER BY q.id
    `);
    const expected = [
      [1,'awaiting_payment','awaiting_payment','0',0],
      [2,'overdue','overdue','0',1],
      [3,'partially_paid','partially_paid','40',1],
      [4,'pending_verification','pending_review','40',1],
      [5,'paid','paid','100',1],
      [6,'pending_issue_approval','pending_review','0',1],
      [7,'unsuccessful',null,'100',1],
      [8,'unsuccessful',null,'100',1],
      [9,'unsuccessful',null,'100',1],
      [10,'unsuccessful',null,'100',1],
      [11,'unsuccessful',null,'100',1],
      [12,'awaiting_payment','awaiting_payment','0',0],
    ];
    assert.deepEqual(rows.map(row => [row.id,row.status,row.collectionStatus,row.approved,row.daysOverdue]), expected);
    const replacement = await client.query(`SELECT ${billingStatusView} AS status FROM
      (SELECT 'issued' AS status,'paid' AS "collectionStatus",'{}'::jsonb AS "pendingReplacement") q`);
    assert.equal(replacement.rows[0].status, 'pending_issue_approval');
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
