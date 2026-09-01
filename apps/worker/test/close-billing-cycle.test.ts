import { strict as assert } from "node:assert";
import test from "node:test";
import { CloseBillingCycleJob, bangkokMonthEndCutoff } from "../src/jobs/close-billing-cycle.job.js";

test("uses Bangkok month-end cutoff at 23:59:59.999", () => { assert.equal(bangkokMonthEndCutoff(2026, 2).toISOString(), "2026-02-28T16:59:59.999Z"); });
test("is idempotent and does not cache invalid results", async () => {
  const job = new CloseBillingCycleJob(); let calls = 0;
  const closer = { close: async (cycleKey: string, cutoffAt: Date) => { calls++; assert.equal(cycleKey, "2026-01"); assert.equal(cutoffAt.toISOString(), "2026-01-31T16:59:59.999Z"); return { cycleKey, quality: calls === 1 ? "invalid" as const : "complete" as const, status: "pending_approval" as const }; } };
  await job.run("2026-01", closer, new Date("2026-01-31T10:00:00Z"));
  await job.run("2026-01", closer, new Date("2026-01-31T10:01:00Z"));
  await job.run("2026-01", closer, new Date("2026-01-31T10:02:00Z"));
  assert.equal(calls, 2);
});
