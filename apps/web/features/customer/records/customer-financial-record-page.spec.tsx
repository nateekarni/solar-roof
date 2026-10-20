import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { CustomerFinancialRecordPage } from "./customer-financial-record-page";
import {
  customerRecordDocuments,
  customerRecordCanPay,
} from "./customer-record-model";
import {
  CustomerDocumentContent,
  loadCustomerDocument,
} from "./customer-document-viewer";
import {
  createCustomerDocumentBlobUrl,
  revokeCustomerDocumentBlobUrl,
} from "./customer-document-url";
import {
  safeCustomerDocumentUrl,
  customerEvidenceBlob,
} from "./customer-document-url";
export const record = {
  id: "bill/a",
  siteId: "site",
  period: "2026-10",
  status: "approved",
  billingStatusView: "awaiting_payment",
  invoiceId: "invoice",
  invoiceNumber: "INV-001",
  receiptId: null,
  receiptNumber: null,
  amount: "1070.13",
  subtotal: "999.99",
  simulatedTax: "70.14",
  approvedAmount: "400.00",
  outstandingAmount: "670.13",
  pendingEvidenceCount: 0,
  rejectedEvidenceCount: 0,
  dueDate: "2026-11-01",
  issueDate: "2026-10-01",
  payments: [],
};
const permissions = {
  actions: [],
  unavailable: {},
  operationsActions: ["submit_payment", "verify_payment", "approve_invoice"],
};
const render = (
  patch = {},
  locale: "en" | "th" = "en",
  capabilities = permissions,
) =>
  renderToStaticMarkup(
    <CustomerFinancialRecordPage
      row={{ ...record, ...patch }}
      locale={locale}
      capabilities={capabilities}
    />,
  );
test("record detail starts with an outlined back-to-documents action", () => {
  const html = render();
  const link = html.match(/<a[^>]*href="\/billing"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? "";
  assert.match(link, /Back to documents/);
  assert.match(link, /border/);
  assert.match(link, /bg-background/);
});
test("customer detail uses canonical lifecycle states and persisted financial values", () => {
  for (const [status, label] of [
    ["awaiting_payment", "Awaiting payment"],
    ["pending_verification", "Evidence review"],
    ["partially_paid", "Partially paid"],
    ["paid", "Paid"],
    ["overdue", "Overdue"],
  ]) {
    const html = render({ billingStatusView: status });
    assert.ok(html.includes(label!), label!);
    for (const value of ["999.99", "70.14", "1,070.13", "400.00"])
      assert.ok(html.includes(value), value);
    assert.doesNotMatch(
      html,
      />Approve<|>Reject<|Send original|Issue document|Replacement|Verify pending/,
    );
  }
});
test("payment progress is integrated once inside the status hero", () => {
  const html=render();
  assert.equal((html.match(/role="progressbar"/g)??[]).length,1);
  assert.equal((html.match(/aria-label="Payment progress"/g)??[]).length,2);
  const hero=html.match(/<header[^>]*>[\s\S]*?<\/header>/)?.[0]??"";
  assert.match(hero,/Paid 400\.00 \/ 1,070\.13/);
  assert.match(hero,/role="progressbar"/);
  assert.match(hero,/max-w-/);
});
test("rejected attempt stays visible with server reason and eligible resubmission", () => {
  const html = render({
    rejectedEvidenceCount: 1,
    payments: [
      {
        id: "rejected",
        amount: "670.13",
        status: "rejected",
        rejectionReason: "The amount is unreadable",
        submittedAt: "2026-10-02",
        slipUrl: "https://example.test/old.png",
      },
    ],
  });
  assert.match(html, /Evidence rejected/);
  assert.match(html, /The amount is unreadable/);
  assert.match(html, /Report payment again/);
  assert.match(html, /bill%2Fa\?payment=1/);
  assert.match(html, /data-document-id="payment:rejected"/);
});
test("payment and resubmission fail closed for missing permission, pending evidence, settled and unsuccessful records", () => {
  for (const patch of [
    { pendingEvidenceCount: 1 },
    { billingStatusView: "pending_verification" },
    { billingStatusView: "paid" },
    { billingStatusView: "unsuccessful" },
    { outstandingAmount: "0.00" },
    { invoiceId: null },
  ])
    assert.equal(
      customerRecordCanPay({ ...record, ...patch }, permissions),
      false,
    );
  assert.equal(
    customerRecordCanPay(record, { actions: [], unavailable: {} }),
    false,
  );
  assert.equal(customerRecordCanPay(record, permissions), true);
});
test("timeline retains every evidence attempt in chronological order between statement and receipt", () => {
  const docs = customerRecordDocuments({
    ...record,
    receiptId: "receipt",
    receiptNumber: "REC-001",
    payments: [
      {
        id: "new",
        amount: "670.13",
        status: "pending_verification",
        submittedAt: "2026-10-03",
      },
      {
        id: "old",
        amount: "400",
        status: "rejected",
        submittedAt: "2026-10-02",
      },
    ],
  });
  assert.deepEqual(
    docs.map((d) => d.id),
    ["invoice", "payment:old", "payment:new", "receipt"],
  );
});
test("unknown financial values stay unavailable and Thai customer copy is localized", () => {
  const html = render({
    subtotal: null,
    simulatedTax: null,
    approvedAmount: undefined,
    outstandingAmount: undefined,
  });
  assert.match(html, /Unavailable/);
  assert.doesNotMatch(html, /role="progressbar"/);
  const thai = render({}, "th");
  assert.match(thai, /รายละเอียดค่าใช้จ่าย/);
  assert.match(thai, /รอชำระเงิน/);
  assert.doesNotMatch(thai, /customerPortal\./);
});
test("preview fallback retains a download only when a file exists", () => {
  const blobUrl = createCustomerDocumentBlobUrl(new Blob(["file"]));
  const fallback = renderToStaticMarkup(
    <CustomerDocumentContent
      url={blobUrl}
      kind="unavailable"
      title="INV"
      locale="en"
    />,
  );
  assert.match(fallback, /Preview is unavailable/);
  assert.match(fallback, /download=/);
  const missing = renderToStaticMarkup(
    <CustomerDocumentContent
      url=""
      kind="unavailable"
      title="INV"
      locale="en"
    />,
  );
  assert.doesNotMatch(missing, /<a/);
  const image = renderToStaticMarkup(
    <CustomerDocumentContent
      url={blobUrl}
      kind="image"
      title="Evidence"
      locale="en"
    />,
  );
  assert.match(image, /<img/);
  assert.match(image, /download=/);
  revokeCustomerDocumentBlobUrl(blobUrl);
});
test("unverified evidence shows its declared amount without treating it as approved and unknown status is localized", () => {
  const html = render({
    payments: [
      {
        id: "pending",
        amount: null,
        declaredAmount: "321.45",
        status: "pending_verification",
      },
      { id: "legacy", amount: null, status: "legacy" },
    ],
  });
  assert.match(html, /321.45/);
  assert.match(html, /Evidence review/);
  assert.match(html, /Unknown/);
  assert.doesNotMatch(html, /customerPortal\./);
});
test("all installment receipts interleave with evidence by persisted issue/submission date", () => {
  const patch = {
    receiptId: "second",
    receiptNumber: "REC-002",
    receipts: [
      { id: "second", documentNumber: "REC-002", issueDate: "2026-10-06" },
      { id: "first", documentNumber: "REC-001", issueDate: "2026-10-03" },
    ],
    payments: [
      {
        id: "later",
        amount: null,
        status: "pending_verification",
        submittedAt: "2026-10-08T12:00:00Z",
      },
      {
        id: "two",
        amount: "200",
        status: "paid",
        submittedAt: "2026-10-05T12:00:00Z",
      },
      {
        id: "one",
        amount: "300",
        status: "paid",
        submittedAt: "2026-10-02T12:00:00Z",
      },
    ],
  };
  const docs = customerRecordDocuments({ ...record, ...patch });
  assert.deepEqual(
    docs.map((d) => [d.id, d.date]),
    [
      ["invoice", "2026-10-01"],
      ["payment:one", "2026-10-02T12:00:00Z"],
      ["receipt:first", "2026-10-03"],
      ["payment:two", "2026-10-05T12:00:00Z"],
      ["receipt:second", "2026-10-06"],
      ["payment:later", "2026-10-08T12:00:00Z"],
    ],
  );
  const html = render(patch);
  assert.match(html, /REC-001/);
  assert.match(html, /REC-002/);
  assert.match(html, /October 3, 2026/);
  assert.match(html, /October 6, 2026/);
});
test("unsafe persisted preview and download URLs never become interactive destinations", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "file:///etc/passwd",
    "https://unapproved.test/slip.png",
    "//unapproved.test/slip.png",
    "blob:https://unapproved.test/stolen",
  ]) {
    const html = renderToStaticMarkup(
      <CustomerDocumentContent
        url={url}
        kind="image"
        title="Unsafe"
        locale="en"
      />,
    );
    assert.doesNotMatch(html, /<a|<img|<iframe/, url);
  }
});
test("document URL policy accepts only current/explicit API origins and locally created blobs", () => {
  assert.equal(
    safeCustomerDocumentUrl("/evidence.png", "https://portal.test"),
    "https://portal.test/evidence.png",
  );
  assert.equal(
    safeCustomerDocumentUrl(
      "https://api.test/evidence.png",
      "https://portal.test",
      "https://api.test/v1",
    ),
    "https://api.test/evidence.png",
  );
  for (const url of [
    "https://arbitrary.test/slip.png",
    "https://portal.test.attacker.test/x",
    "https://user:password@portal.test/file",
    "//portal.test/file",
    "/\\attacker.test/file",
    "javascript:alert(1)",
    "file:///file",
    "data:image/png;base64,iVBORw0KGgo=",
    "blob:https://portal.test/not-created-here",
  ])
    assert.equal(
      safeCustomerDocumentUrl(url, "https://portal.test"),
      null,
      url,
    );
  const blob = createCustomerDocumentBlobUrl(new Blob(["test"]));
  assert.equal(safeCustomerDocumentUrl(blob), blob);
  revokeCustomerDocumentBlobUrl(blob);
  assert.equal(safeCustomerDocumentUrl(blob), null);
});
test("legacy evidence data is validated as a file and converted to a managed blob, never a data destination", async () => {
  const png = "data:image/png;base64,iVBORw0KGgo=";
  assert.equal(customerEvidenceBlob(png)?.type, "image/png");
  assert.equal(
    customerEvidenceBlob("data:image/jpeg;base64,/9j/AA==")?.type,
    "image/jpeg",
  );
  assert.equal(
    customerEvidenceBlob("data:application/pdf;base64,JVBERi0xLjQ=")?.type,
    "application/pdf",
  );
  for (const invalid of [
    "data:text/html;base64,PHNjcmlwdD4=",
    "data:image/png;base64,PHNjcmlwdD4=",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:image/png;base64,!!!",
    "data:application/pdf;base64,AA==",
  ])
    assert.equal(customerEvidenceBlob(invalid), null, invalid);
  const result = await loadCustomerDocument({
    id: "legacy",
    kind: "evidence",
    number: null,
    date: null,
    payment: { id: "legacy", amount: null, status: "rejected", slipUrl: png },
  });
  assert.equal(result.kind, "image");
  assert.equal(result.revoke, true);
  assert.match(result.url, /^blob:/);
  assert.doesNotMatch(result.url, /^data:/);
  assert.equal(safeCustomerDocumentUrl(result.url), result.url);
  revokeCustomerDocumentBlobUrl(result.url);
  for (const unsafe of [
    "javascript:alert(1)",
    "file:///file",
    "data:text/html;base64,PHNjcmlwdD4=",
    "https://unapproved.test/x",
  ])
    assert.deepEqual(
      await loadCustomerDocument({
        id: "unsafe",
        kind: "evidence",
        number: null,
        date: null,
        payment: {
          id: "unsafe",
          amount: null,
          status: "rejected",
          slipUrl: unsafe,
        },
      }),
      { url: "", kind: "unavailable", revoke: false },
    );
});
