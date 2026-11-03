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
    ["subtotal", bill.subtotal, "baht"],
    ["tax", bill.tax, "baht"],
    ["billedAmount", bill.billedAmount, "baht"],
  ] as const;
  return (
    <div
      aria-labelledby="bill-breakdown-title"
      className="min-w-0 border-t border-border/70 pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0"
    >
      <h3 id="bill-breakdown-title" className="sr-only">
        {t("customerPortal.home.breakdown")}
      </h3>
      <dl className="divide-y divide-border/70">
        {rows.filter(([key, value]) => value !== null && (key !== "billedAmount" || bill.billedAmount !== bill.outstandingAmount)).map(([key, value, unit]) => (
          <div
            key={key}
            data-bill-summary-row={key}
            className="flex min-h-8 items-center justify-between gap-3 py-1.5"
          >
            <dt className="text-xs text-muted-foreground">
              {t(`customerPortal.home.${key}`)}
              {key === "subtotal" && bill.rate !== null && (
                <span className="block text-[11px] text-muted-foreground">
                  {t("customerPortal.home.rate")} {formatDecimal(bill.rate, locale)} {t("customerPortal.common.baht")}/{t("customerPortal.common.kwh")}
                </span>
              )}
            </dt>
            <dd className="break-words text-right font-medium tabular-nums">
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
    </div>
  );
}
