import type { BillingRow, Capabilities } from "@solar/api-contracts";
import { createTranslator, type Locale } from "@solar/i18n";
import {
  CircleCheck,
  Clock,
  FileText,
  TriangleAlert,
  ChartPie,
  ArrowUpRight,
} from "lucide-react";
import {
  billStatus,
  formatDate,
  formatMoney,
} from "../home/customer-home-format";
import { Button } from "@/components/ui/button";

export function CustomerFinancialRecordCard({
  record,
  locale,
  capabilities,
}: {
  record: BillingRow;
  locale: Locale;
  capabilities: Capabilities;
}) {
  const t = createTranslator(locale),
    status = record.billingStatusView;
  const Icon =
    status === "paid"
      ? CircleCheck
      : status === "overdue"
        ? TriangleAlert
        : status === "partially_paid"
          ? ChartPie
          : Clock;
  const tone =
    status === "paid"
      ? "success"
      : status === "overdue"
        ? "warning"
        : "pending";
  const canPay =
    capabilities.operationsActions?.includes("submit_payment") &&
    ["awaiting_payment", "partially_paid", "overdue"].includes(status) &&
    Boolean(record.invoiceId) &&
    record.pendingEvidenceCount === 0 &&
    typeof record.outstandingAmount === "string" &&
    !record.outstandingAmount.startsWith("-") &&
    /[1-9]/.test(record.outstandingAmount);
  const href = `/records/billing/${encodeURIComponent(record.id)}`;
  const text = (value: unknown) => (typeof value === "string" ? value : null);
  return (
    <article className="customer-card min-w-0 rounded-3xl border border-border bg-[var(--customer-surface-elevated)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <FileText
            aria-hidden="true"
            className="mb-3 size-6 text-muted-foreground"
          />
          <h2 className="text-lg font-semibold">
            {formatDate(record.period, locale, true)}
          </h2>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            {record.invoiceNumber ?? t("customerPortal.record.statement")}
          </p>
        </div>
        <p
          data-record-status={status}
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium"
          style={{
            backgroundColor: `var(--customer-${tone})`,
            color: `var(--customer-${tone}-foreground)`,
          }}
        >
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          {status === "pending_issue_approval"
            ? t("customerPortal.common.unavailable")
            : billStatus(status, locale)}
        </p>
      </div>
      <dl className="mt-5 space-y-3 text-sm">
        {(
          [
            ["billedAmount", text(record.amount)],
            ["approvedAmount", record.approvedAmount ?? null],
            ["outstandingAmount", record.outstandingAmount ?? null],
          ] as const
        ).map(([key, value]) => (
          <div key={key} className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">
              {t(`customerPortal.home.${key}`)}
            </dt>
            <dd className="break-all font-medium tabular-nums">
              {formatMoney(value, locale)} {t("customerPortal.common.baht")}
            </dd>
          </div>
        ))}
        <div className="border-t border-border pt-3">
          <dt className="text-muted-foreground">
            {t("customerPortal.home.dueDate")}
          </dt>
          <dd className="mt-1">{formatDate(text(record.dueDate), locale)}</dd>
        </div>
      </dl>
      <div
        data-record-actions="true"
        className="mt-5 flex flex-wrap items-center justify-between gap-3"
      >
        <Button
          variant="outline"
          asChild
          className="min-h-11 bg-background"
        >
          <a href={href}>
            {t("customerPortal.record.details")}
            <ArrowUpRight aria-hidden="true" className="size-4" />
          </a>
        </Button>
        {canPay && (
          <Button
            asChild
            className="customer-primary-action min-h-11 bg-[var(--customer-action-primary)]"
          >
            <a href={`${href}?payment=1`}>{t("customerPortal.home.pay")}</a>
          </Button>
        )}
      </div>
    </article>
  );
}
