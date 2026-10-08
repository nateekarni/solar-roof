import test from "node:test";
import assert from "node:assert/strict";
import { formatOrganizationMonth } from "./organization-month-format";
test("billing months use Buddhist years in Thai and Gregorian years in English with unchanged API values", () => {
  assert.equal(formatOrganizationMonth("2026-10", "en"), "October 2026");
  assert.match(formatOrganizationMonth("2026-10", "th"), /ตุลาคม 2569/);
  assert.equal(formatOrganizationMonth("2026-13", "en"), "—");
});
