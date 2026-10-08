import assert from "node:assert/strict";
import test from "node:test";
import { documentDefinition } from "./document-layout.js";
import {
  refinementFixtures,
  layoutDocumentPages,
  pageLines,
  lineText,
} from "./document-layout.test-fixtures.js";
import { buildContractSnapshot } from "./contract-pdf.service.js";
const fixtures = refinementFixtures();
const text = (v: any): string =>
  typeof v === "string"
    ? v.replaceAll("\u200b", "")
    : Array.isArray(v)
      ? v.map(text).join("")
      : v && typeof v === "object"
        ? "text" in v
          ? text(v.text)
          : Object.entries(v)
              .filter(([k]) => k !== "image")
              .map(([, x]) => text(x))
              .join("\n")
        : "";
test("reference typography, paired cards, frozen accent and blank footer identity", () => {
  const s = { ...fixtures.invoice!, brandPrimary: "#a25a00" };
  const d = documentDefinition(s);
  assert.equal(d.defaultStyle.fontSize, 16);
  const all = JSON.stringify(d.content);
  assert.match(all, /#a25a00/);
  assert.doesNotMatch(all, /#f29700/);
  assert.match(all, /"fontSize":26/);
  assert.match(all, /"fontSize":18/);
  assert.match(all, /"fontSize":22/);
  const pair = d.content.find(
    (n) =>
      n.table?.widths?.length === 2 && text(n).includes("Project Information"),
  );
  assert.ok(pair);
  assert.match(text(pair), /Customer/);
  assert.match(text(d.content[0]), /Due/);
  assert.equal(d.footer(1, 2), null);
  assert.doesNotMatch(text(d.footer(2, 2)), /INV|Page|หน้า/);
  assert.equal((text(d.footer(2, 2)).match(/วันที่ลงนาม:/g) ?? []).length, 2);
});
test("receipt preserves invoice reference and every truthful transfer field without double-counting totals", () => {
  const d = documentDefinition({
    ...fixtures.receipt!,
    invoiceNumber: "INV261000001",
    approvedTransfers: [
      {
        status: "paid",
        paidAt: "2026-10-08T06:10:29Z",
        amount: "2000.00",
        payerName: "ผู้โอนจริง",
        paymentMethod: "promptpay",
        originBank: "ธนาคารต้นทาง",
        originAccount: "1234",
        evidence: "TRANSFER-A",
      },
      {
        status: "approved",
        paidAt: "2026-10-08T07:00:00Z",
        amount: "2623.45",
        evidence: "TRANSFER-B",
      },
    ],
  } as any);
  const t = text(d.content);
  for (const value of [
    "INV261000001",
    "ผู้โอนจริง",
    "PromptPay",
    "ธนาคารต้นทาง",
    "1234",
    "TRANSFER-A",
    "TRANSFER-B",
    "2,000.00",
    "2,623.45",
    "4,623.45",
    "Receipt / Test Tax Invoice",
  ])
    assert.ok(t.includes(value), value);
  assert.equal(
    (text(d.footer(1, 1)).match(/________________________/g) ?? []).length,
    1,
  );
  assert.match(text(d.footer(1, 1)), /Authorised Signature/);
  assert.doesNotMatch(
    text(d.footer(1, 1)),
    /Prepared by|Document received by|8 ตุลาคม/,
  );
});
test("ordinary invoice and receipt fit one page with bottom signatures and no visible footer labels", () => {
  for (const name of ["invoice", "receipt"]) {
    const pages = layoutDocumentPages(fixtures[name]!);
    assert.equal(pages.length, 1, name);
    const lines = pageLines(pages[0]);
    assert.doesNotMatch(lines.map(lineText).join("\n"), /Page 1 \/ 1/);
    const signatures = lines.filter((l) =>
      lineText(l).startsWith("________________________"),
    );
    assert.equal(signatures.length, name === "receipt" ? 1 : 2);
    assert.ok(signatures[0].y > 690);
    for (const line of lines)
      assert.ok(
        line.x >= 39.9 &&
          line.x + line.getWidth() <= 555.4 &&
          line.y + line.getHeight() < 830,
        lineText(line),
      );
  }
});
const source = {
  id: "contract-id",
  site_id: "site-id",
  site_name: "ไซต์จริง",
  external_site_id: "PROTOCOL-1",
  capacity_mwp: "0.012345",
  school_id: "school-id",
  start_date: "2026-01-01",
  end_date: null,
  document_number: "PPA261000001",
  company_name: "ผู้ซื้อจริง",
  tax_id: "1111111111111",
  tax_address: "ที่อยู่ผู้ซื้อ",
  payment_terms: "เงื่อนไขที่บันทึก",
  payment_term_days: 30,
  signer_name: "ผู้ขายลงนาม",
};
const issuer = {
  company_name: "ผู้ขายจริง",
  tax_id: "0000000000000",
  address: "ที่อยู่ผู้ขาย",
};
test("PPA freezes exact converted capacity and ten dynamic draft clauses only under the exact local binding", () => {
  const before = { ...process.env };
  try {
    Object.assign(process.env, {
      NODE_ENV: "test",
      DATABASE_URL:
        "postgres://local:local@127.0.0.1:15449/solar_financial_flow_review",
      LOCAL_FINANCIAL_FIXTURE_MARKER: "solar-financial-flow-review-v1",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "11049",
    });
    const snapshot = buildContractSnapshot(
      source,
      issuer,
      [{ startDate: "2026-01-01", endDate: "2026-12-31", rate: "4.1234" }],
      "logo",
    ) as any;
    assert.equal(snapshot.capacityKwp, "12.345");
    assert.equal(snapshot.brandPrimary, "#f29700");
    assert.equal(snapshot.syntheticTest, true);
    assert.equal(snapshot.ppaClauses.length, 10);
    assert.match(snapshot.ppaClauses[0].body, /ผู้ขายจริง.*ผู้ซื้อจริง/s);
    assert.match(snapshot.ppaClauses[6].body, /30 วัน/);
    assert.match(snapshot.ppaClauses[8].body, /90วัน/);
    assert.equal(snapshot.templateVersion, "ppa-th-sarabun-new-v4");
    process.env.SMTP_HOST = "outside.test";
    const factual = buildContractSnapshot(
      source,
      issuer,
      [{ startDate: "2026-01-01", rate: "4.1234" }],
      "logo",
    );
    assert.equal((factual as any).ppaClauses, undefined);
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in before)) delete process.env[key];
    Object.assign(process.env, before);
  }
});

import { capacityKwp, freezeLocalPpaDraft } from "./local-ppa-draft.js";
import { localTestDocumentSnapshot } from "./local-test-pdf.js";
import {
  TEST_FINANCIAL_POLICY,
  TEST_FINANCIAL_POLICY_HASH,
} from "../billing/local-financial-policy.js";
import { createHash } from "node:crypto";
test("exact capacity conversion and frozen draft do not re-read mutable facts while rendering", () => {
  for (const [input, expected] of [
    ["0.000001", "0.001"],
    ["0012.340000", "12340"],
    ["0", "0"],
    [null, undefined],
    [undefined, undefined],
    ["bad", undefined],
  ] as const)
    assert.equal(capacityKwp(input), expected);
  const snapshot = { ...fixtures.contract! };
  const frozen = freezeLocalPpaDraft(snapshot);
  Object.assign(snapshot, frozen);
  const saved = JSON.stringify(snapshot.ppaClauses);
  snapshot.paymentTermDays = 99;
  snapshot.customer = { ...snapshot.customer, name: "Changed after issuance" };
  const d = documentDefinition(snapshot);
  assert.equal(JSON.stringify(snapshot.ppaClauses), saved);
  assert.match(text(d.content), /30 วัน/);
  assert.doesNotMatch(text(d.content), /99 วัน|Changed after issuance/);
});
test("financial adapter preserves frozen palette, invoice reference, approved recorded notes and original totals", () => {
  const snapshot = {
    brandPrimary: "#663300",
    invoiceNumber: "INV261000007",
    templateVersion: "sarabun-a4-v5",
    company: {
      company_name: "Issuer",
      tax_id: "0000000000000",
      address: "Address",
    },
    customer: {
      company_name: "Buyer",
      tax_id: "1111111111111",
      tax_address: "Buyer address",
    },
    issueDate: "2026-10-08",
    logo: "logo",
    banks: [],
    cycle: {
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      subtotal: "100.00",
      simulated_tax: "7.00",
      amount: "107.00",
      meter_snapshot: [],
    },
    payments: [
      {
        status: "paid",
        paid_at: "2026-10-08",
        amount: "50.00",
        note: "First accepted note",
      },
      {
        status: "approved",
        paid_at: "2026-10-08",
        amount: "57.00",
        note: "Second accepted note",
      },
      {
        status: "rejected",
        paid_at: "2026-10-08",
        amount: "1.00",
        note: "Rejected note",
      },
    ],
  };
  const before = JSON.stringify(snapshot);
  const s = localTestDocumentSnapshot({
    document_type: "receipt",
    document_number: "RCP261000001",
    snapshot,
  });
  assert.equal(s.brandPrimary, "#663300");
  assert.equal(s.invoiceNumber, "INV261000007");
  assert.deepEqual(s.remarks, ["First accepted note", "Second accepted note"]);
  assert.equal(s.totals!.total, "107.00");
  assert.equal(JSON.stringify(snapshot), before);
  const policy = {
    scope: "TEST",
    taxMode: "exclusive",
    taxPercent: 7,
    withholding: false,
    kwhScale: 3,
    rateScale: 4,
    moneyScale: 2,
    rounding: "half_up",
    receipt: "combined_test_tax_invoice",
    number: "typeYYYYMM0001",
    logo: "/brand/solar-roof-document.png",
  };
  assert.deepEqual(TEST_FINANCIAL_POLICY, policy);
  assert.equal(
    TEST_FINANCIAL_POLICY_HASH,
    createHash("sha256").update(JSON.stringify(policy)).digest("hex"),
  );
});

test('ordinary receipt with complete reviewed payer metadata still fits one A4 page',()=>{
 const snapshot={...fixtures.receipt!,approvedTransfers:[{...fixtures.receipt!.approvedTransfers[0]!,payerName:'บริษัท ลูกค้าทดสอบเอกสาร จำกัด',paymentMethod:'bank_transfer' as const,originBank:'ธนาคารต้นทางทดสอบ',originAccount:'001-2-34567-8'}]};
 assert.equal(layoutDocumentPages(snapshot).length,1);
});
