"use client";
import * as React from "react";
import { CircleCheck, Clock3, ArrowUpRight } from "lucide-react";
import type { CustomerPortalBill } from "@solar/api-contracts";
import { createTranslator, type Locale } from "@solar/i18n";
import { billStatus, formatDate, formatMoney } from "./customer-home-format";
import { CustomerPaymentFlow } from "../payment/customer-payment-flow";

export function CurrentBillHero({
  bill,
  additionalOpenBillCount,
  canPay,
  locale,
}: {
  bill: CustomerPortalBill | null;
  additionalOpenBillCount: number;
  canPay: boolean;
  locale: Locale;
}) {
  const t = createTranslator(locale);
  const [paymentOpen, setPaymentOpen] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const paymentTrigger = React.useRef<HTMLAnchorElement | null>(null);
  return (
    <section
      aria-labelledby="current-bill-title"
      className="flex min-w-0 flex-col rounded-3xl bg-[var(--customer-surface-hero)] p-6 text-[var(--customer-surface-hero-foreground)] sm:p-8"
    >
      <h2 id="current-bill-title" className="text-sm font-medium">
        {t("customerPortal.home.currentBill")}
      </h2>
      {bill ? (
        <>
          <div className="mt-5 flex items-center gap-2 text-sm">
            <Clock3 size={16} aria-hidden="true" />
            {billStatus(bill.status, locale)}
          </div>
          <p className="mt-7 text-sm">{t("customerPortal.home.amountDue")}</p>
          <p className="mt-1 break-words text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
            {formatMoney(bill.outstandingAmount, locale)}{" "}
            <span className="text-base font-normal">
              {t("customerPortal.common.baht")}
            </span>
          </p>
          <p className="mt-5 text-sm">
            {t("customerPortal.home.dueDate")} ·{" "}
            <time dateTime={bill.dueDate ?? undefined}>
              {formatDate(bill.dueDate, locale)}
            </time>
          </p>
          <p className="mt-2 text-sm">
            {bill.invoiceNumber ?? formatDate(bill.period, locale, true)}
          </p>
          {(additionalOpenBillCount > 0 || (canPay && bill.canPay)) && (
            <div
              data-current-bill-actions="true"
              className="mt-auto flex flex-col gap-2 pt-8"
            >
              {additionalOpenBillCount > 0 && (
                <a
                  href="/billing"
                  className="inline-flex min-h-11 items-center underline underline-offset-4"
                >
                  {t("customerPortal.home.additionalOpenBills", {
                    count: additionalOpenBillCount,
                  })}
                </a>
              )}
              {canPay && bill.canPay && (
                <a
                  ref={paymentTrigger}
                  href={`/records/billing/${encodeURIComponent(bill.id)}${submitted ? "" : "?payment=1"}`}
                  onClick={(event) => {
                    if (!submitted) {
                      event.preventDefault();
                      setPaymentOpen(true);
                    }
                  }}
                  className="customer-primary-action inline-flex min-h-12 items-center justify-center gap-3 rounded-xl bg-[var(--customer-action-primary)] px-5 py-3 text-center text-sm font-semibold"
                >
                  {t(
                    submitted
                      ? "customerPortal.payment.viewRecord"
                      : "customerPortal.home.pay",
                  )}
                  <ArrowUpRight size={18} aria-hidden="true" />
                </a>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="my-auto py-10">
          <CircleCheck className="mb-5" size={36} aria-hidden="true" />
          <p className="text-2xl font-semibold">
            {t("customerPortal.home.paidUpToDate")}
          </p>
          <p className="mt-3 text-sm">{t("customerPortal.home.noOpenBill")}</p>
        </div>
      )}
      {bill && (
        <CustomerPaymentFlow
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
          billingCycle={bill}
          locale={locale}
          canSubmit={canPay && bill.canPay}
          onSuccess={() => setSubmitted(true)}
          returnFocusRef={paymentTrigger}
        />
      )}
    </section>
  );
}
