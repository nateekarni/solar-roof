import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const req = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { Pool } = req('pg');

const databaseUrl = process.env.DATABASE_URL || 'postgresql://review:local-financial-only@127.0.0.1:15449/solar_financial_flow_review';
const pool = new Pool({ connectionString: databaseUrl });

async function seedQaState() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Ensure owner@demo.solar.test has NO company_position_id (to test position setup flow)
    await client.query("UPDATE users SET company_position_id=NULL WHERE email='owner@demo.solar.test'");
    console.log('✓ Reset owner@demo.solar.test company_position_id to NULL');

    // 2. Find eligible approved cycles to use for:
    //    a) Two cycles set to pending_issue_approval (for single and bulk approval testing)
    //    b) One cycle with a pending replacement draft (for replacement approval testing)
    const cycles = (await client.query(`
      SELECT b.id, b.site_id, b.amount, b.rate, b.subtotal, b.simulated_tax, b.due_date, d.id as doc_id
      FROM billing_cycles b
      JOIN documents d ON d.billing_cycle_id = b.id AND d.document_type = 'invoice' AND d.is_current = true
      WHERE b.status = 'approved'
      ORDER BY b.period_start DESC
      LIMIT 3
    `)).rows;

    if (cycles.length < 3) {
      throw new Error(`Expected at least 3 approved invoice cycles, found ${cycles.length}`);
    }

    const [cycleForSingle, cycleForBulk, cycleForReplacement] = cycles;

    // Reset any previous test artifacts for these cycles
    await client.query(`
      DELETE FROM billing_replacement_drafts
      WHERE billing_cycle_id IN ($1, $2, $3)
    `, [cycleForSingle.id, cycleForBulk.id, cycleForReplacement.id]);

    // Set first two cycles to pending_issue_approval
    // Also remove their current document so they act as fresh drafts awaiting approval
    await client.query(`
      UPDATE documents SET is_current = false
      WHERE billing_cycle_id IN ($1, $2)
    `, [cycleForSingle.id, cycleForBulk.id]);

    await client.query(`
      UPDATE billing_cycles
      SET status = 'pending_issue_approval'
      WHERE id IN ($1, $2)
    `, [cycleForSingle.id, cycleForBulk.id]);

    console.log(`✓ Prepared 2 pending drafts awaiting issuance approval: ${cycleForSingle.id}, ${cycleForBulk.id}`);

    // For the third cycle, keep it approved with its current document,
    // and insert a pending_issue_approval replacement draft with updated rate 5.0000
    const proposedRate = '5.0000';
    const originalSubtotal = Number(cycleForReplacement.subtotal || 5000);
    const newSubtotal = (originalSubtotal * 1.15).toFixed(2);
    const newTax = (Number(newSubtotal) * 0.07).toFixed(2);
    const newTotal = (Number(newSubtotal) + Number(newTax)).toFixed(2);

    const proposedCycle = {
      id: cycleForReplacement.id,
      site_id: cycleForReplacement.site_id,
      rate: proposedRate,
      subtotal: newSubtotal,
      simulated_tax: newTax,
      amount: newTotal,
      due_date: cycleForReplacement.due_date || '2026-11-30'
    };

    const ownerUser = (await client.query("SELECT id FROM users WHERE email='owner@demo.solar.test'")).rows[0];

    await client.query(`
      INSERT INTO billing_replacement_drafts(
        id, billing_cycle_id, supersedes_document_id, rate, amount, snapshot, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending_issue_approval', $7)
    `, [
      randomUUID(),
      cycleForReplacement.id,
      cycleForReplacement.doc_id,
      proposedRate,
      newTotal,
      JSON.stringify({ cycle: proposedCycle, reason: 'อัตราค่าไฟฟ้าปรับปรุงตามสัญญาใหม่' }),
      ownerUser.id
    ]);

    console.log(`✓ Prepared 1 pending replacement draft on cycle: ${cycleForReplacement.id} (superseding doc: ${cycleForReplacement.doc_id})`);

    await client.query('COMMIT');
    console.log('✓ QA state seeded successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to seed QA state:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seedQaState();
