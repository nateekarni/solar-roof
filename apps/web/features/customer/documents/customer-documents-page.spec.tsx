import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { BillingRow, OperationPage } from "@solar/api-contracts";
import { CustomerDocumentsPage } from "./customer-documents-page";
import {
  customerDocumentsQuery,
  patchCustomerDocumentsQuery,
  appendCustomerDocuments,
  loadCustomerDocuments,
} from "./customer-documents-model";

export const record: BillingRow = {
  id: "bill/a",
  siteId: "site",
  period: "2026-10",
  status: "approved",
  billingStatusView: "partially_paid",
  invoiceId: "invoice",
  invoiceNumber: "INV-001",
  receiptId: "receipt",
  receiptNumber: "REC-001",
  amount: "9007199254740993.13",
  approvedAmount: "100.00",
  outstandingAmount: "863.14",
  dueDate: "2026-11-10",
  pendingEvidenceCount: 0,
  rejectedEvidenceCount: 1,
};
export const initial: OperationPage<BillingRow> = {
  idKey: "id",
  columns: [],
  rows: [record],
  page: { limit: 25, nextCursor: "opaque+/=", hasMore: true },
  facets: {
    billingStatusCounts: {
      all: 99,
      awaiting_payment: 20,
      pending_verification: 30,
      partially_paid: 3,
      overdue: 5,
      paid: 41,
      pending_issue_approval: 0,
      unsuccessful: 0,
    },
  },
};
const render = (
  locale: "th" | "en" = "en",
  canPay = true,
  data: OperationPage<BillingRow> | null = initial,
) =>
  renderToStaticMarkup(
    <CustomerDocumentsPage
      initial={data}
      initialQuery="search=INV&from=2026-10-01&to=2026-10-31&billingStatusView=partially_paid"
      locale={locale}
      capabilities={{
        actions: [],
        unavailable: {},
        operationsActions: canPay ? ["submit_payment"] : [],
      }}
    />,
  );

test("customer documents render financial cards at every breakpoint with canonical strings, status icon and evidence state", () => {
  const html = render();
  assert.doesNotMatch(html, /<table|role="table"/);
  assert.match(html, /<article/);
  assert.match(html, /October 2026/);
  assert.match(html, /INV-001/);
  for (const label of [
    "Billed amount",
    "Approved payments",
    "Outstanding amount",
    "9,007,199,254,740,993.13",
    "100.00",
    "863.14",
    "Due date",
    "Partially paid",
  ])
    assert.ok(html.includes(label), label);
  assert.doesNotMatch(
    html,
    /Pending evidence|Evidence rejected|No receipt issued yet|REC-001/,
  );
  assert.match(html, /data-record-status="partially_paid"[^>]*><svg/);
  assert.match(html, /href="\/records\/billing\/bill%2Fa\?payment=1"/);
  assert.match(html, /href="\/records\/billing\/bill%2Fa"/);
  assert.match(
    html,
    /data-record-actions="true"[^>]*class="[^"]*justify-between/,
  );
  assert.match(
    html.replaceAll("<!-- -->", ""),
    />View details<.*>Pay</s,
  );
  assert.match(html, /Load more documents/);
});
test("responsive document toolbar preserves the query and exposes search, date range and one status selector", () => {
  const html = render().replaceAll("<!-- -->", "");
  assert.match(html, /data-slot="input-group"/);
  assert.match(html, /aria-label="Search documents"/);
  assert.match(html, /aria-label="Billing period"/);
  assert.match(html, /aria-label="Document status"/);
  assert.equal((html.match(/role="tab"/g) ?? []).length, 0);
  assert.match(html, /Partially paid \(3\)/);
  assert.doesNotMatch(html, /Awaiting issuance|Unsuccessful/);
  assert.match(html, /value="INV"/);
  assert.match(html, /October 1, 2026/);
  assert.match(html, /October 31, 2026/);
});
test("capabilities and canonical eligibility gate payment, and Thai labels use dictionary keys", () => {
  assert.doesNotMatch(render("en", false), />Pay</);
  assert.doesNotMatch(
    render("en", true, {
      ...initial,
      rows: [
        {
          ...record,
          billingStatusView: "pending_verification",
          pendingEvidenceCount: 1,
        },
      ],
    }),
    />Pay</,
  );
  const thai = render("th");
  assert.match(thai, /เอกสาร|ยอด/);
  assert.doesNotMatch(thai, /Billed amount|Partially paid|Load more documents/);
});
test("empty and unavailable lists remain distinct and retry preserves the query", () => {
  assert.match(
    render("en", false, {
      ...initial,
      rows: [],
      page: { limit: 25, nextCursor: null, hasMore: false },
    }),
    /No matching documents/,
  );
  const html = render("en", false, null);
  assert.match(html, /Documents are unavailable/);
  assert.match(html, /Try again/);
  assert.doesNotMatch(html, /No matching documents/);
});
test("customer query normalizes internal views, preserves search and period, and clears cursor on filter changes", () => {
  assert.equal(
    customerDocumentsQuery(
      new URLSearchParams(
        "search=INV&from=2026-10-01&to=2026-10-31&billingStatusView=partially_paid&cursor=opaque",
      ),
    ).toString(),
    "search=INV&from=2026-10-01&to=2026-10-31&billingStatusView=partially_paid&cursor=opaque",
  );
  const query = patchCustomerDocumentsQuery(
    new URLSearchParams("search=INV&from=2026-10-01&to=2026-10-31&cursor=old"),
    { billingStatusView: "paid" },
  );
  assert.equal(query.get("cursor"), null);
  assert.equal(query.get("search"), "INV");
  assert.equal(query.get("from"), "2026-10-01");
  assert.equal(query.get("to"), "2026-10-31");
  assert.equal(
    customerDocumentsQuery(
      new URLSearchParams("billingStatusView=pending_issue_approval"),
    ).get("billingStatusView"),
    "all",
  );
});
test("load more forwards the opaque cursor and merges without duplicate record identities", async (context) => {
  const query = patchCustomerDocumentsQuery(
    new URLSearchParams("search=INV&from=2026-10-01"),
    { cursor: "opaque+/=" },
  );
  context.mock.method(globalThis, "fetch", async (url: string) => {
    const actual = new URL(url, "http://test");
    assert.equal(actual.pathname, "/v1/operations/billing");
    assert.equal(actual.searchParams.get("cursor"), "opaque+/=");
    assert.equal(actual.searchParams.get("search"), "INV");
    assert.equal(actual.searchParams.get("from"), "2026-10-01");
    return Response.json({
      ...initial,
      rows: [record, { ...record, id: "next" }],
      page: { limit: 25, nextCursor: null, hasMore: false },
    });
  });
  const next = await loadCustomerDocuments(query);
  assert.deepEqual(
    appendCustomerDocuments(initial, next).rows.map((row) => row.id),
    ["bill/a", "next"],
  );
  assert.equal(next.page.hasMore, false);
});

test("legacy partial payment filters select the public partial-payment tab while explicit views retain precedence", () => {
  for (const legacy of [
    "status=partially_paid",
    "collectionStatus=partially_paid",
  ]) {
    const query = customerDocumentsQuery(
      new URLSearchParams(`search=INV&from=2026-10-01&${legacy}`),
    );
    assert.equal(query.get("billingStatusView"), "partially_paid");
    assert.equal(query.get("search"), "INV");
    assert.equal(query.get("from"), "2026-10-01");
    assert.equal(query.has("status"), false);
    assert.equal(query.has("collectionStatus"), false);
    assert.equal(
      customerDocumentsQuery(
        new URLSearchParams(`${legacy}&billingStatusView=paid`),
      ).get("billingStatusView"),
      "paid",
    );
  }
});
