import test from "node:test";
import assert from "node:assert/strict";
import { formatDecimal, formatMoney } from "./customer-home-format";

test("customer bill numbers remove database scale while money keeps two decimals", () => {
  assert.equal(formatDecimal("11900.00000000", "en"), "11,900");
  assert.equal(formatMoney("44565.50000000", "en"), "44,565.50");
  assert.equal(formatMoney("0", "th"), "0.00");
  assert.equal(
    formatMoney("9007199254740993.13", "en"),
    "9,007,199,254,740,993.13",
  );
});
