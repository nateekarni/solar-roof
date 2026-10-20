import { createTranslator, type Locale } from "@solar/i18n";
import { CustomerEvidencePicker } from "./customer-evidence-picker";
import type { PaymentDraft, PaymentErrors } from "./customer-payment-model";
import { bangkokTransferWallTime } from "../../billing/payment-input";
import { formatMoney } from "../home/customer-home-format";
import {
  CustomerPaymentDatePicker,
} from "./customer-payment-pickers";
import { Button } from "@/components/ui/button";
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
        <fieldset className="min-w-0">
          <legend className="mb-2 font-semibold">
            {t("customerPortal.payment.amount")}
          </legend>
          <div role="tablist" aria-label={t("customerPortal.payment.amount")} className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
            {(["full", "other"] as const).map((mode) => (
              <Button
                key={mode}
                type="button"
                role="tab"
                aria-selected={draft.amountMode === mode}
                variant={draft.amountMode === mode ? "secondary" : "ghost"}
                className="min-h-11 rounded-lg px-2 py-2 text-sm font-medium"
                onClick={() => onChange({ amountMode: mode })}
              >
                {t(
                  `customerPortal.payment.${{ full: "fullAmount", other: "otherAmount" }[mode]}`,
                )}
                {mode === "full" && (
                  <span className="ml-1 tabular-nums">
                    {formatMoney(draft.outstanding, locale)}
                  </span>
                )}
              </Button>
            ))}
          </div>
          {draft.amountMode === "other" && (
            <>
              <Field data-invalid={Boolean(errors.amount)} className="mt-2">
               <FieldLabel className="sr-only" htmlFor="customer-amount">
                 {t("customerPortal.payment.amount")}
               </FieldLabel>
               <Input
                id="customer-amount"
                type="text"
                inputMode="decimal"
                value={draft.amount}
                onChange={(event) => onChange({ amount: event.target.value })}
                aria-invalid={Boolean(errors.amount)}
                aria-describedby={
                  errors.amount ? "customer-amount-error" : undefined
                }
                className="min-h-11 tabular-nums"
               />
              </Field>
            </>
          )}
          {errors.amount && (
            <p id="customer-amount-error" className="text-sm text-destructive">
              {t(errors.amount)}
            </p>
          )}
        </fieldset>
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
