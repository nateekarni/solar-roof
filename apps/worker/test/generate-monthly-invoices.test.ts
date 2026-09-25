import { strict as assert } from "node:assert";
import test from "node:test";
import { GenerateMonthlyInvoicesJob } from "../src/jobs/generate-monthly-invoices.job.js";

test("generates invoice for billing cycles without existing invoices", async () => {
  const job = new GenerateMonthlyInvoicesJob();
  const mockDb = {
    async query(sql: string, params?: unknown[]) {
      if (sql.includes("SELECT b.id")) {
        return {
          rows: [
            { id: "cycle-1", site_id: "site-1", amount: 10414.63, status: "approved" },
          ],
        };
      }
      if (sql.includes("SELECT count(*)")) {
        return { rows: [{ count: 5 }] };
      }
      if (sql.includes("INSERT INTO documents")) {
        return { rows: [{ document_number: "INV2026010006", amount: 10414.63 }] };
      }
      return { rows: [] };
    },
  };

  const results = await job.run(mockDb, 2026, 1);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.billingCycleId, "cycle-1");
  assert.equal(results[0]?.documentNumber, "INV2026010006");
  assert.equal(results[0]?.created, true);
});
