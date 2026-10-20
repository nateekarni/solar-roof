import { createTranslator, type Locale } from "@solar/i18n";
import { CircleCheck, Clock, TriangleAlert } from "lucide-react";
import { billStatus, formatDate } from "../home/customer-home-format";
import {
  customerRecordStatus,
  recordText,
  type CustomerRecord,
} from "./customer-record-model";
import { CustomerPaymentProgress } from "./customer-payment-progress";
export function CustomerRecordStatusHeader({
  row,
  locale,
}: {
  row: CustomerRecord;
  locale: Locale;
}) {
  const t = createTranslator(locale),
    status = customerRecordStatus(row);
  const Icon =
    status === "paid"
      ? CircleCheck
      : status === "overdue"
        ? TriangleAlert
        : Clock;
  return (
    <header className="min-w-0 rounded-3xl bg-[var(--customer-surface-hero)] p-6 text-[var(--customer-surface-hero-foreground)] sm:p-8">
      <div className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)] md:items-center">
        <div className="min-w-0">
          <p className="text-sm">{t("customerPortal.record.title")}</p>
          <h1 className="mt-2 break-words text-2xl font-semibold">
            {recordText(row, "invoiceNumber") ?? t("customerPortal.record.statement")}
          </h1>
          <p className="mt-3 flex items-center gap-2" data-record-status={status ?? "unknown"}>
            <Icon className="size-5" aria-hidden="true" />
            {status ? billStatus(status, locale) : t("customerPortal.common.unavailable")}
          </p>
          <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 text-sm">
            <div><dt>{t("customerPortal.record.period")}</dt><dd>{formatDate(recordText(row, "period"), locale, true)}</dd></div>
            <div><dt>{t("customerPortal.home.dueDate")}</dt><dd>{formatDate(recordText(row, "dueDate"), locale)}</dd></div>
          </dl>
        </div>
        <div className="md:justify-self-end">
          <CustomerPaymentProgress approved={recordText(row, "approvedAmount")} outstanding={recordText(row, "outstandingAmount")} locale={locale} />
        </div>
      </div>
    </header>
  );
}
