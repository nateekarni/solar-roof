import test from "node:test";
import assert from "node:assert/strict";
import { loadOrganizationRows } from "./organization-document-loader";
test("loader follows opaque cursor and retains each scoped page", async () => {
  const requests: string[] = [];
  const rows = await loadOrganizationRows("billing", async (endpoint) => {
    requests.push(endpoint);
    return requests.length === 1
      ? {
          rows: [{ id: "one" }],
          page: { hasMore: true, nextCursor: "opaque & value" },
        }
      : { rows: [{ id: "two" }], page: { hasMore: false, nextCursor: null } };
  });
  assert.deepEqual(
    rows.map((row) => row.id),
    ["one", "two"],
  );
  assert.match(requests[1]!, /cursor=opaque\+%26\+value/);
});
test("loader propagates access errors without returning earlier data", async () => {
  await assert.rejects(
    () =>
      loadOrganizationRows("contracts", async () => {
        throw Object.assign(new Error("denied"), { status: 403 });
      }),
    /denied/,
  );
});
test("loader rejects repeating cursor rather than looping forever", async () => {
  await assert.rejects(
    () =>
      loadOrganizationRows("billing", async () => ({
        rows: [{ id: "one" }],
        page: { hasMore: true, nextCursor: "same" },
      })),
    /pagination/i,
  );
});
