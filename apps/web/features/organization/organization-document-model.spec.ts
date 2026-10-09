import test from "node:test";
import assert from "node:assert/strict";
import {
  outstandingInvoices,
  documentsForContract,
  filterDocuments,
} from "./organization-document-model";
test("outstanding includes pending and rejected evidence and excludes terminal invoices", () => {
  const rows = [
    "issued",
    "pending_verification",
    "rejected",
    "paid",
    "draft",
    "cancelled",
  ].map((status) => ({ id: status, status }));
  assert.deepEqual(
    outstandingInvoices(rows).map((row) => row.id),
    ["issued", "pending_verification", "rejected"],
  );
  assert.equal(
    outstandingInvoices([
      { id: "paid", status: "issued", paymentStatus: "paid" },
    ]).length,
    0,
  );
});
test("contract association requires explicit matching contractId, never a site match", () => {
  const rows = [
    { id: "legacy", siteId: "site" },
    { id: "linked", siteId: "site", contractId: "contract" },
    { id: "other", contractId: "other" },
  ];
  assert.deepEqual(
    documentsForContract(rows, "contract").map((row) => row.id),
    ["linked"],
  );
  assert.deepEqual(
    documentsForContract(rows, null).map((row) => row.id),
    ["legacy"],
  );
});
test("month and status filters combine without treating missing dates as a match", () => {
  const rows = [
    { id: "a", period: "2026-10", status: "issued" },
    { id: "b", issueDate: "2026-10-08", status: "paid" },
    { id: "c", status: "issued" },
  ];
  assert.deepEqual(
    filterDocuments(rows, "2026-10", "issued").map((row) => row.id),
    ["a"],
  );
});

test("clearing document filters restores only the selected contract's documents", () => {
  const rows = [
    { id: "october", contractId: "chosen", period: "2026-10", status: "issued" },
    { id: "september", contractId: "chosen", period: "2026-09", status: "paid" },
    { id: "other", contractId: "other", period: "2026-10", status: "issued" },
    { id: "unlinked", period: "2026-10", status: "issued" },
  ];
  const selected = documentsForContract(rows, "chosen");
  assert.deepEqual(filterDocuments(selected, "2026-10", "issued").map(row => row.id), ["october"]);
  assert.deepEqual(filterDocuments(selected, "", "").map(row => row.id), ["october", "september"]);
  assert.deepEqual(filterDocuments(documentsForContract(rows, null), "", "").map(row => row.id), ["unlinked"]);
});
