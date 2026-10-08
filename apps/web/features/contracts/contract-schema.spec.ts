import assert from "node:assert/strict";
import test from "node:test";
import { createContractSchema } from "./contract-schema";

const validContract = {
  siteId: "site-1",
  effectiveDate: "2026-10-08",
  paymentTerms: "Within 30 days",
  signerName: "Authorized signer",
};

for (const [locale, messages] of [
  ["en", { siteId: "Please select a site", effectiveDate: "Please enter an effective date", paymentTerms: "Please enter payment terms", signerName: "Please enter the signer's name" }],
  ["th", { siteId: "กรุณาเลือกไซต์งาน", effectiveDate: "กรุณาระบุวันที่มีผล", paymentTerms: "กรุณาระบุเงื่อนไขการชำระเงิน", signerName: "กรุณาระบุชื่อผู้ลงนาม" }],
] as const) {
  test(`required contract fields return ${locale} validation messages`, () => {
    for (const [field, message] of Object.entries(messages)) {
      for (const value of ["", undefined]) {
        const result = createContractSchema(locale).safeParse({ ...validContract, [field]: value });
        assert.equal(result.success, false);
        if (result.success) throw new Error("Missing required field was accepted");
        assert.deepEqual(result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })), [{ path: [field], message }]);
      }
    }
  });

  test(`valid contract accepts omitted optional billing fields in ${locale}`, () => {
    assert.deepEqual(createContractSchema(locale).parse(validContract), validContract);
  });
}
