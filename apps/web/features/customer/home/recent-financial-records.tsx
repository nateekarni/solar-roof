import { ArrowUpRight, FileText } from "lucide-react";
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
    <section
      aria-labelledby="recent-records-title"
      data-dashboard-area="records"
      className="customer-dashboard-panel min-w-0 overflow-hidden border border-primary/30 bg-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3.5">
        <h2 id="recent-records-title" className="text-base font-semibold sm:text-lg">
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
      <div data-financial-record-list="compact" className="divide-y divide-border/70">
        {records.map((record) => (
          <article
            data-financial-record={record.id}
            key={record.id}
            className="min-w-0 p-4"
          >
            <div data-record-header="true" className="flex min-w-0 items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-primary/35 bg-primary/8 text-primary">
                <FileText aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="break-words text-sm font-semibold">{record.invoiceNumber ?? t("customerPortal.record.statement")}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(record.period, locale, true)}</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center rounded-md border border-primary/25 bg-[var(--customer-pending)] px-2 py-1 font-mono text-[10px] font-medium text-[var(--customer-pending-foreground)]">
                    {billStatus(record.status, locale)}
                  </span>
                </div>
                <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-border/60 pt-2">
                  <span className="text-xs text-muted-foreground">{t("customerPortal.home.outstandingAmount")}</span>
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {formatMoney(record.outstandingAmount, locale)} {t("customerPortal.common.baht")}
                  </span>
                </div>
              </div>
            </div>
            {(canViewDocuments || (canPay && record.canPay)) && (
              <div
                data-record-actions="true"
                className="mt-2 flex flex-wrap items-center justify-end gap-2"
              >
                {canViewDocuments && (
                  <Button
                    variant="outline"
                    asChild
                    className="min-h-11 rounded-lg px-3 text-xs"
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
                    className="customer-primary-action min-h-11 min-w-11 rounded-lg bg-[var(--customer-action-primary)] px-3 text-xs"
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
        <p className="p-5 text-sm text-muted-foreground">
          {t("customerPortal.home.noRecords")}
        </p>
      )}
    </section>
  );
}
