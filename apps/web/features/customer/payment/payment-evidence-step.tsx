import { createTranslator, type Locale } from "@solar/i18n";
import { CustomerEvidencePicker } from "./customer-evidence-picker";
import type { PaymentDraft, PaymentErrors } from "./customer-payment-model";
import { bangkokTransferWallTime } from "../../billing/payment-input";
import { formatMoney } from "../home/customer-home-format";
import {
  CustomerPaymentDatePicker,
} from "./customer-payment-pickers";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
export function PaymentEvidenceStep({
  draft,
  onChange,
  onFile,
  errors,
  locale,
}: {
  draft: PaymentDraft;
  onChange: (patch: Partial<PaymentDraft>) => void;
  onFile: (file: File | null) => void;
  errors: PaymentErrors;
  locale: Locale;
}) {
  const t = createTranslator(locale);
  return (
    <section
      aria-labelledby="customer-payment-details-title"
      className="min-w-0 rounded-2xl border border-border bg-[var(--customer-surface-elevated)] p-4"
    >
      <h2 id="customer-payment-details-title" className="font-semibold">
        {t("customerPortal.payment.details")}
      </h2>
      <p className="sr-only">
        {t("customerPortal.payment.detailsDescription")}
      </p>
      <div className="mt-3 flex min-w-0 flex-col gap-4">
        <section className="min-w-0 rounded-xl bg-muted p-3" aria-label={t("customerPortal.payment.amount")}>
          <p className="text-sm font-semibold">{t("customerPortal.payment.fullAmount")}</p>
          <p className="mt-1 text-lg font-bold tabular-nums">{formatMoney(draft.outstanding, locale)}</p>
          {errors.amount && (
            <p id="customer-amount-error" className="text-sm text-destructive">
              {t(errors.amount)}
            </p>
          )}
        </section>
        <CustomerEvidencePicker
          draft={draft}
          onFile={onFile}
          error={errors.evidence}
          locale={locale}
        />
        <FieldGroup data-customer-date-note="true" className="grid min-w-0 gap-3 md:grid-cols-2">
          <CustomerPaymentDatePicker
            value={draft.paidAt}
            max={bangkokTransferWallTime().slice(0, 10)}
            locale={locale}
            error={errors.paidAt}
            onChange={(paidAt) => onChange({ paidAt })}
          />
          <Field>
            <FieldLabel htmlFor="customer-note">
              {t("customerPortal.payment.note")}
            </FieldLabel>
            <Input
              id="customer-note"
              type="text"
              value={draft.note}
              onChange={(event) => onChange({ note: event.target.value })}
              className="h-11! rounded-xl!"
            />
          </Field>
        </FieldGroup>
      </div>
    </section>
  );
}
