import test from "node:test";
import assert from "node:assert/strict";
import {
  createPaymentDraft,
  validatePaymentDraft,
  evidenceError,
  paymentSubmission,
  paymentTransition,
  submissionErrorKey,
} from "./customer-payment-model";

test("full outstanding amount is default and submission requires review before pending", () => {
  const draft = createPaymentDraft("1000.0000", "2026-10-18");
  assert.equal(draft.amount, "1000.00");
  assert.equal(draft.amountMode, "full");
  assert.equal(draft.evidence, null);
  assert.equal("paymentMethod" in draft, false);
  assert.equal(draft.transferChannel, "bank_account");
  assert.equal(paymentTransition("payment", "review"), "review");
  assert.equal(paymentTransition("review", "edit"), "payment");
  assert.equal(paymentTransition("review", "submitted"), "pending");
  assert.equal(paymentTransition("payment", "submitted"), "payment");
});
test("strict decimal strings reject coercion, excess precision, nonpositive and excess amounts", () => {
  for (const amount of [
    "0",
    "-1",
    "1e2",
    "1,000",
    " 1 ",
    "1.001",
    "Infinity",
    ".50",
    "1.",
  ]) {
    assert.equal(
      validatePaymentDraft(
        { amount, outstanding: "1000", paidAt: "2026-10-18" },
        "2026-10-18",
      ).amount,
      "customerPortal.validation.positiveAmount",
      amount,
    );
  }
  assert.deepEqual(
    validatePaymentDraft(
      { amount: "1200", outstanding: "1000", paidAt: "2026-10-19" },
      "2026-10-18",
    ),
    {
      amount: "customerPortal.validation.amountExceedsOutstanding",
      paidAt: "customerPortal.validation.futurePaidDate",
    },
  );
  for (const paidAt of ["2026-02-30", "", "2026-1-01"])
    assert.equal(
      validatePaymentDraft(
        { amount: "1", outstanding: "1000", paidAt },
        "2026-10-18",
      ).paidAt,
      "customerPortal.validation.invalidPaidDate",
    );
  assert.deepEqual(
    validatePaymentDraft(
      {
        amount: "9007199254740991.99",
        outstanding: "9007199254740992.00",
        paidAt: "2026-10-18",
      },
      "2026-10-18",
    ),
    {},
  );
});
test("evidence accepts JPEG PNG PDF at the 10 MB boundary only", () => {
  for (const type of ["image/jpeg", "image/png", "application/pdf"])
    assert.equal(evidenceError({ type, size: 10485760 }), null);
  assert.equal(
    evidenceError({ type: "image/png", size: 10485761 }),
    "customerPortal.validation.fileTooLarge",
  );
  for (const type of ["image/svg+xml", "image/gif", "text/html", ""])
    assert.equal(
      evidenceError({ type, size: 1 }),
      "customerPortal.validation.unsupportedFileType",
    );
});
test("submission declares a Bangkok date and metadata without claiming a verified amount", () => {
  const draft = {
    ...createPaymentDraft("1000", "2026-10-18"),
    amountMode: "other" as const,
    amount: "012.5",
    note: "  reference  ",
    evidence: { name: "receipt.png", type: "image/png", size: 1 },
    evidenceKey: "unique",
    slipUrl: "data:image/png;base64,aA==",
    transferChannel: "promptpay" as const,
  };
  assert.deepEqual(paymentSubmission(draft), {
    amount: "12.50",
    paidAt: "2026-10-18T05:00:00.000Z",
    paymentMethod: "bank_transfer",
    transferChannel: "promptpay",
    note: "reference",
    slipUrl: draft.slipUrl,
    evidenceKey: "unique",
  });
  assert.equal(
    submissionErrorKey({
      status: 409,
      details: { message: "Transfer evidence already submitted" },
    }),
    "customerPortal.payment.duplicateEvidence",
  );
  assert.equal(
    submissionErrorKey({
      status: 409,
      details: { message: "Issued unpaid invoice required" },
    }),
    "customerPortal.payment.failed",
  );
});
