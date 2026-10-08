import assert from "node:assert/strict";
import test from "node:test";
import { createContractSchema } from "./contract-schema";

const validContract = {
  siteId: "site-1",
  effectiveDate: "2026-10-08",
  paymentTerms: "Within 30 days",
  signerName: "Authorized signer",
  companyName:"Customer legal",taxId:"1234567890123",taxAddress:"Bangkok",
};

for (const [locale, messages] of [
  ["en", { siteId: "Please select a site", effectiveDate: "Please enter an effective date", paymentTerms: "Please enter payment terms", signerName: "Please enter the signer's name", companyName:"Please enter the legal name", taxId:"Please enter the tax ID", taxAddress:"Please enter the billing address" }],
  ["th", { siteId: "กรุณาเลือกไซต์งาน", effectiveDate: "กรุณาระบุวันที่มีผล", paymentTerms: "กรุณาระบุเงื่อนไขการชำระเงิน", signerName: "กรุณาระบุชื่อผู้ลงนาม", companyName:"กรุณาระบุชื่อทางกฎหมาย", taxId:"กรุณาระบุเลขประจำตัวผู้เสียภาษี", taxAddress:"กรุณาระบุที่อยู่สำหรับออกเอกสาร" }],
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

  test(`valid contract accepts omitted optional contact fields in ${locale}`, () => {
    assert.deepEqual(createContractSchema(locale).parse(validContract), validContract);
  });
}

test('contract schema retains provider title and optional customer signer fields',()=>{
 const input={...validContract,signerTitle:'Director',customerSignerName:'Customer Person',customerSignerTitle:'Manager'};
 assert.deepEqual(createContractSchema('en').parse(input),input);
 const blank={...validContract,signerTitle:'',customerSignerName:'',customerSignerTitle:''};assert.deepEqual(createContractSchema('th').parse(blank),blank);
});
