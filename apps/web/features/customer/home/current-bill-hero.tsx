"use client";
import * as React from "react";
import { Clock3, ArrowUpRight, FileDown } from "lucide-react";
import type { CustomerPortalBill } from "@solar/api-contracts";
import { createTranslator, type Locale } from "@solar/i18n";
import { billStatus, formatDate, formatMoney } from "./customer-home-format";
import { CustomerPaymentFlow } from "../payment/customer-payment-flow";
import { BillBreakdown } from "./bill-breakdown";

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
  if (!bill) return null;
  return (
    <section
      aria-labelledby="current-bill-title"
      data-dashboard-area="bill"
      className="customer-dashboard-panel customer-bill-panel min-w-0 overflow-hidden border border-primary/55 bg-card p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="current-bill-title" className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t("customerPortal.home.currentBill")}
        </h2>
        <div className="inline-flex items-center gap-2 text-xs font-medium text-[var(--customer-link)]">
            <Clock3 size={16} aria-hidden="true" />
            {billStatus(bill.status, locale)}
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1.15fr)_minmax(13rem,.85fr)] sm:items-end">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{t("customerPortal.home.amountDue")}</p>
          <p className="mt-1 break-words text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
            {formatMoney(bill.outstandingAmount, locale)}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              {t("customerPortal.common.baht")}
            </span>
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{bill.invoiceNumber ?? formatDate(bill.period, locale, true)}</span>
            <span>
              {t("customerPortal.home.dueDate")} ·{" "}
              <time dateTime={bill.dueDate ?? undefined}>{formatDate(bill.dueDate, locale)}</time>
            </span>
          </div>
        </div>
        <BillBreakdown bill={bill} locale={locale} />
      </div>

      <div data-current-bill-actions="true" className="mt-4 grid grid-cols-2 gap-2 border-t border-border/70 pt-3 sm:flex sm:flex-wrap sm:items-center">
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
            className="customer-primary-action inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--customer-action-primary)] px-3 text-center text-sm font-semibold sm:order-2 sm:ml-auto"
          >
            {t(submitted ? "customerPortal.payment.viewRecord" : "customerPortal.home.pay")}
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        )}
        <a
          href={`/records/billing/${encodeURIComponent(bill.id)}`}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-muted/40 px-3 text-center text-xs font-medium sm:order-1 sm:text-sm"
        >
          <FileDown size={16} aria-hidden="true" />
          {t("customerPortal.record.details")}
        </a>
        {additionalOpenBillCount > 0 && (
          <a href="/billing" className="col-span-2 inline-flex min-h-9 items-center justify-center px-1 text-xs text-muted-foreground underline underline-offset-4 sm:order-1 sm:min-h-11 sm:text-sm">
            {t("customerPortal.home.additionalOpenBills", { count: additionalOpenBillCount })}
          </a>
        )}
      </div>
      <CustomerPaymentFlow
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        billingCycle={bill}
        locale={locale}
        canSubmit={canPay && bill.canPay}
        onSuccess={() => setSubmitted(true)}
        returnFocusRef={paymentTrigger}
      />
    </section>
  );
}
