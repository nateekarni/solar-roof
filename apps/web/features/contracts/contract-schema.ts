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
    taxId: z.string().optional(),
    companyName: z.string().optional(),
    branch: z.string().optional(),
    taxAddress: z.string().optional(),
    billingEmail: z.string().optional(),
    billingPhone: z.string().optional(),
  });
}

export type ContractFormValues = z.infer<ReturnType<typeof createContractSchema>>;
