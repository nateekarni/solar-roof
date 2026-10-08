import type { Locale } from "@solar/i18n";

const actionStatus: Record<string, Record<Locale, string>> = {
  billing: {
    en: "Billing calculation is currently unavailable.",
    th: "ยังไม่สามารถคำนวณยอดเรียกเก็บได้ในขณะนี้",
  },
  contracts: {
    en: "Contract creation is currently unavailable.",
    th: "ยังไม่สามารถสร้างสัญญาได้ในขณะนี้",
  },
  documents: {
    en: "Document issuance is currently unavailable.",
    th: "ยังไม่สามารถออกเอกสารได้ในขณะนี้",
  },
  receipts: {
    en: "Receipt issuance is currently unavailable.",
    th: "ยังไม่สามารถออกใบเสร็จรับเงินได้ในขณะนี้",
  },
};

export function FinancialAvailabilityNotice({ locale, role, resource }: { locale: Locale; role: string; resource: string }) {
  const status = actionStatus[resource]?.[locale];
  if (!status) return null;
  const staff = ["owner", "admin", "operator", "accountant"].includes(role);

  return (
    <div className="max-w-sm space-y-1 text-xs text-muted-foreground">
      <p role="status">{status}</p>
      {staff && (
        <details>
          <summary className="cursor-pointer">{locale === "th" ? "เหตุใดจึงยังไม่พร้อมใช้งาน" : "Why is this unavailable?"}</summary>
          <p className="pt-1 leading-relaxed">
            {locale === "th"
              ? "การดำเนินการทางการเงินยังรอการยืนยันข้อกำหนดทางบัญชีและความพร้อมของระบบ"
              : "Financial actions are pending verified accounting requirements and implementation readiness."}
          </p>
        </details>
      )}
    </div>
  );
}
