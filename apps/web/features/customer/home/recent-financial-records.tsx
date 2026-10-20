import { ArrowUpRight } from "lucide-react";
import type { CustomerPortalBill } from "@solar/api-contracts";
import { createTranslator, type Locale } from "@solar/i18n";
import { Button } from "@/components/ui/button";
import { billStatus, formatDate, formatMoney } from "./customer-home-format";

export function RecentFinancialRecords({
  records,
  locale,
  canViewDocuments,
  canPay,
}: {
  records: CustomerPortalBill[];
  locale: Locale;
  canViewDocuments: boolean;
  canPay: boolean;
}) {
  const t = createTranslator(locale);
  return (
    <section aria-labelledby="recent-records-title" className="min-w-0">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 id="recent-records-title" className="text-xl font-semibold">
          {t("customerPortal.home.recentRecords")}
        </h2>
        {canViewDocuments && (
          <a
            className="inline-flex min-h-11 items-center gap-2 text-sm underline underline-offset-4"
            href="/billing"
          >
            {t("customerPortal.home.viewAllDocuments")}
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {records.map((record) => (
          <article
            data-financial-record={record.id}
            key={record.id}
            className="customer-card flex min-w-0 flex-col rounded-2xl border border-border bg-card p-5"
          >
            <div
              data-record-header="true"
              className="flex min-w-0 items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <h3 className="break-words font-semibold">
                  {record.invoiceNumber ?? t("customerPortal.record.statement")}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatDate(record.period, locale, true)}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center rounded-full bg-[var(--customer-pending)] px-3 py-1.5 text-xs font-medium text-[var(--customer-pending-foreground)]">
                {billStatus(record.status, locale)}
              </span>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              {(
                [
                  ["billedAmount", record.billedAmount],
                  ["approvedAmount", record.approvedAmount],
                  ["outstandingAmount", record.outstandingAmount],
                ] as const
              ).map(([key, value]) => (
                <div key={key} className="flex flex-wrap justify-between gap-2">
                  <dt className="text-muted-foreground">
                    {t(`customerPortal.home.${key}`)}
                  </dt>
                  <dd className="break-words tabular-nums">
                    {formatMoney(value, locale)}{" "}
                    {t("customerPortal.common.baht")}
                  </dd>
                </div>
              ))}
              <div className="pt-2">
                <dt className="text-muted-foreground">
                  {t("customerPortal.home.dueDate")}
                </dt>
                <dd>{formatDate(record.dueDate, locale)}</dd>
              </div>
            </dl>
            {(canViewDocuments || (canPay && record.canPay)) && (
              <div
                data-record-actions="true"
                className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4"
              >
                {canViewDocuments && (
                  <Button
                    variant="outline"
                    asChild
                    className="min-h-11 bg-background"
                  >
                    <a href={`/records/billing/${encodeURIComponent(record.id)}`}>
                      {t("customerPortal.record.details")}
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </a>
                  </Button>
                )}
                {canPay && record.canPay && (
                  <Button
                    asChild
                    className="customer-primary-action min-h-11 bg-[var(--customer-action-primary)]"
                  >
                    <a
                      href={`/records/billing/${encodeURIComponent(record.id)}?payment=1`}
                    >
                      {t("customerPortal.home.pay")}
                    </a>
                  </Button>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
      {records.length === 0 && (
        <p className="rounded-2xl border border-border bg-card p-6 text-muted-foreground">
          {t("customerPortal.home.noRecords")}
        </p>
      )}
    </section>
  );
}
