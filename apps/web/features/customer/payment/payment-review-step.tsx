import type { CustomerPaymentInstructions } from "@solar/api-contracts";
import { createTranslator, type Locale } from "@solar/i18n";
import { formatDate, formatMoney } from "../home/customer-home-format";
import type { PaymentDraft } from "./customer-payment-model";
export function PaymentReviewStep({
  draft,
  instructions,
  invoiceNumber,
  locale,
}: {
  draft: PaymentDraft;
  instructions: CustomerPaymentInstructions;
  invoiceNumber?: string | null;
  locale: Locale;
}) {
  const t = createTranslator(locale);
  const fields = [
    ["customerPortal.record.statement", invoiceNumber],
    ["customerPortal.payment.accountName", instructions.accountName],
    ["customerPortal.payment.accountNumber", instructions.accountNumber],
    ["customerPortal.payment.promptpay", instructions.promptpayId],
    [
      "customerPortal.payment.amount",
      `${formatMoney(draft.amount, locale)} ${t("customerPortal.common.baht")}`,
    ],
    ["customerPortal.payment.paidAt", formatDate(draft.paidAt, locale)],
    [
      "customerPortal.payment.method",
      t(
        draft.transferChannel === "promptpay"
          ? "customerPortal.payment.promptpay"
          : "customerPortal.payment.bankTransfer",
      ),
    ],
    ["customerPortal.payment.evidence", draft.evidence?.name],
    ["customerPortal.payment.note", draft.note],
  ];
  return (
    <dl className="divide-y divide-border">
      {fields
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <div key={label} className="grid min-w-0 gap-2 py-4 sm:grid-cols-2">
            <dt className="text-sm text-muted-foreground">{t(label!)}</dt>
            <dd className="min-w-0 break-words font-medium">{value}</dd>
          </div>
        ))}
    </dl>
  );
}
