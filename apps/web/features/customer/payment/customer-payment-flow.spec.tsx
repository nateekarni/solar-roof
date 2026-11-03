import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { PaymentEvidenceStep } from "./payment-evidence-step";
import { PaymentPendingStep } from "./payment-pending-step";
import { createPaymentDraft } from "./customer-payment-model";
test("evidence has mobile camera selection and no partial amount controls", () => {
  const html = renderToStaticMarkup(
    <PaymentEvidenceStep
      draft={{
        ...createPaymentDraft("123.45", "2026-10-18"),
      }}
      onChange={() => {}}
      onFile={() => {}}
      locale="en"
      errors={{}}
    />,
  );
  assert.match(html, /accept="image\/jpeg,image\/png,application\/pdf"/);
  assert.match(html, /capture="environment"/);
  assert.doesNotMatch(html, /Other amount/);
  assert.doesNotMatch(html, /id="customer-amount"/);
});
test("payment amount is a read-only full outstanding amount and evidence immediately follows it", () => {
  const full = renderToStaticMarkup(
    <PaymentEvidenceStep
      draft={createPaymentDraft("123.45", "2026-10-18")}
      onChange={() => {}}
      onFile={() => {}}
      locale="en"
      errors={{}}
    />,
  );
  assert.match(full, /Full outstanding amount/);
  assert.doesNotMatch(full, /role="tablist"/);
  assert.doesNotMatch(full, /id="customer-amount"/);
  assert.ok(
    full.indexOf('Full outstanding amount') <
      full.indexOf('data-customer-evidence-picker="true"'),
  );
});
test("payment details use one clickable uploader, a date picker, and no customer cash or channel selector", () => {
  const html = renderToStaticMarkup(
    <PaymentEvidenceStep
      draft={createPaymentDraft("123.45", "2026-10-18")}
      onChange={() => {}}
      onFile={() => {}}
      locale="en"
      errors={{}}
    />,
  );

  assert.match(
    html,
    /<label[^>]*data-testid="evidence-dropzone"[^>]*for="customer-evidence"/,
  );
  assert.match(html, /type="file"[^>]*hidden=""/);
  assert.doesNotMatch(html, /type="date"/);
  assert.doesNotMatch(html, /<select/);
  assert.match(html, /id="customer-paidAt"[^>]*aria-haspopup="dialog"/);
  assert.doesNotMatch(html, /id="customer-method"/);
  assert.doesNotMatch(html, /Cash|เงินสด/);
  assert.match(html, /id="customer-note"/);
  assert.match(html, /data-customer-date-note="true"/);
  assert.match(html, /data-slot="field-group"[^>]*class="[^"]*md:grid-cols-2/);
});
test("selected evidence uses an icon-only destructive remove action in the preview corner", () => {
  const draft = {
    ...createPaymentDraft("123.45", "2026-10-18"),
    evidence: { name: "transfer.png", type: "image/png" } as File,
    slipUrl: "data:image/png;base64,iVBORw0KGgo=",
  };
  const html = renderToStaticMarkup(
    <PaymentEvidenceStep
      draft={draft}
      onChange={() => {}}
      onFile={() => {}}
      locale="en"
      errors={{}}
    />,
  );

  assert.match(html, /aria-label="Remove file"/);
  assert.match(html, /data-variant="destructive"/);
  assert.match(html, /data-testid="evidence-preview"[^>]*class="[^"]*relative/);
  assert.match(html, /class="[^"]*absolute[^"]*right-2[^"]*top-2/);
  assert.doesNotMatch(html, />Remove file<\/button>/);
});
test("completion explicitly awaits staff verification and offers record and home actions", () => {
  const html = renderToStaticMarkup(
    <PaymentPendingStep locale="th" recordHref="/records/billing/bill" />,
  );
  assert.match(html, /รอตรวจหลักฐาน/);
  assert.match(html, /href="\/records\/billing\/bill"/);
  assert.match(html, /href="\/"/);
  assert.doesNotMatch(html, /customerPortal\./);
});
