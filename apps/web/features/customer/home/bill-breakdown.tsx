import type { CustomerPortalBill } from "@solar/api-contracts";
import { createTranslator, type Locale } from "@solar/i18n";
import { formatDecimal, formatMoney } from "./customer-home-format";

export function BillBreakdown({
  bill,
  locale,
}: {
  bill: CustomerPortalBill;
  locale: Locale;
}) {
  const t = createTranslator(locale);
  const rows = [
    ["consumedEnergy", bill.consumedKwh, "kwh"],
    ["rate", bill.rate, "baht"],
    ["subtotal", bill.subtotal, "baht"],
    ["tax", bill.tax, "baht"],
    ["total", bill.billedAmount, "baht"],
    ["approvedAmount", bill.approvedAmount, "baht"],
    ["outstandingAmount", bill.outstandingAmount, "baht"],
  ] as const;
  return (
    <section
      aria-labelledby="bill-breakdown-title"
      className="customer-card min-w-0 rounded-3xl border border-border bg-card p-6 sm:p-8"
    >
      <h2 id="bill-breakdown-title" className="text-lg font-semibold">
        {t("customerPortal.home.breakdown")}
      </h2>
      <dl className="mt-5 divide-y divide-border">
        {rows.map(([key, value, unit]) => (
          <div
            key={key}
            className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 ${key === "outstandingAmount" ? "font-semibold" : ""}`}
          >
            <dt className="text-sm text-muted-foreground">
              {t(`customerPortal.home.${key}`)}
            </dt>
            <dd className="break-words text-right tabular-nums">
              {unit === "baht"
                ? formatMoney(value, locale)
                : formatDecimal(value, locale)}
              {value !== null && (
                <span className="ml-1 text-xs">
                  {t(`customerPortal.common.${unit}`)}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
