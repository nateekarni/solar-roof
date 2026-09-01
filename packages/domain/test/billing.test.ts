import { strict as assert } from "node:assert";
import test from "node:test";
import { calculateBillingCumulativeDiff, calculateRate, assertTransition } from "../src/index.js";

test("billing calculates cumulative diff and fixed rate", () => {
  const opening = { meterId: "BM-1", valueKwh: 100, observedAt: new Date("2026-08-01T16:45:00Z"), targetAt: new Date("2026-08-01T16:45:00Z") };
  const closing = { meterId: "BM-1", valueKwh: 250.125, observedAt: new Date("2026-09-01T16:45:00Z"), targetAt: new Date("2026-09-01T16:45:00Z") };
  const result = calculateBillingCumulativeDiff(opening, closing);
  assert.equal(result.consumedKwh, 150.125);
  assert.equal(result.quality, "complete");
  assert.deepEqual(calculateRate(result.consumedKwh, { rateType: "fixed", amountPerKwh: 4.123, effectiveFrom: new Date("2026-01-01") }), { amount: 618.97, currency: "THB" });
});

test("billing rejects missing and negative/reset readings", () => {
  assert.equal(calculateBillingCumulativeDiff(undefined, undefined).quality, "invalid");
  assert.equal(calculateBillingCumulativeDiff({ meterId: "x", valueKwh: 9, observedAt: new Date() }, { meterId: "x", valueKwh: 8, observedAt: new Date() }).reason, "negative_diff_or_meter_reset");
});

test("billing lifecycle is explicit", () => { assertTransition("draft", "pending_approval"); assert.throws(() => assertTransition("finalized", "approved")); });


