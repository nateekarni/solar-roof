import type { Locale } from "@solar/i18n";
import { z } from "zod";

export function createContractSchema(locale: Locale) {
  const requiredText = (thai: string, english: string) => {
    const message = locale === "th" ? thai : english;
    return z.string({ error: message }).min(1, message);
  };

  return z.object({
    siteId: requiredText("กรุณาเลือกไซต์งาน", "Please select a site"),
    effectiveDate: requiredText("กรุณาระบุวันที่มีผล", "Please enter an effective date"),
    paymentTerms: requiredText("กรุณาระบุเงื่อนไขการชำระเงิน", "Please enter payment terms"),
    signerName: requiredText("กรุณาระบุชื่อผู้ลงนาม", "Please enter the signer's name"),
    signerTitle: z.string().optional(),
    customerSignerName: z.string().optional(),
    customerSignerTitle: z.string().optional(),
    taxId: requiredText("กรุณาระบุเลขประจำตัวผู้เสียภาษี", "Please enter the tax ID").pipe(z.string().regex(/^[0-9]{13}$/,locale==="th"?"เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก":"Tax ID must contain 13 digits")),
    companyName: requiredText("กรุณาระบุชื่อทางกฎหมาย", "Please enter the legal name"),
    branch: z.string().optional(),
    taxAddress: requiredText("กรุณาระบุที่อยู่สำหรับออกเอกสาร", "Please enter the billing address"),
    billingEmail: z.string().optional(),
    billingPhone: z.string().optional(),
  });
}

export type ContractFormValues = z.infer<ReturnType<typeof createContractSchema>>;
