import { strict as assert } from "node:assert";
import test from "node:test";
import { GenerateMonthlyInvoicesJob } from "../src/jobs/generate-monthly-invoices.job.js";

test("generates invoice for billing cycles without existing invoices", async () => {
  const job = new GenerateMonthlyInvoicesJob();
  const mockDb = {
    async transaction<T>(work:(client:any)=>Promise<T>):Promise<T>{return work(this);},
    async query(sql: string, params?: unknown[]) {
      if (sql.includes("SELECT b.id")) {
        return {
          rows: [
            { id: "cycle-1", site_id: "site-1", amount: 10414.63, status: "approved" },
          ],
        };
      }
      if(sql.includes('FOR UPDATE'))return {rows:[{id:'cycle-1',site_id:'site-1',amount:10414.63}]};
      if(sql.includes('AS day'))return {rows:[{day:'2026-10-08'}]};
      if(sql.includes('document_number_series'))return {rows:[{last_value:6}]};
      if (sql.includes("INSERT INTO documents")) {
        return { rows: [{ document_number: "INV261000006", amount: 10414.63 }] };
      }
      return { rows: [] };
    },
  };

  const results = await job.run(mockDb, 2026, 1);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.billingCycleId, "cycle-1");
  assert.equal(results[0]?.documentNumber, "INV261000006");
  assert.equal(results[0]?.created, true);
});
