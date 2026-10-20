import { createTranslator, type Locale } from "@solar/i18n";
import { formatMoney } from "../home/customer-home-format";
export function CustomerPaymentProgress({
  approved,
  outstanding,
  locale,
}: {
  approved: string | null;
  outstanding: string | null;
  locale: Locale;
}) {
  const t = createTranslator(locale),
    paid = Number(approved),
    remaining = Number(outstanding);
  const available =
    approved !== null &&
    outstanding !== null &&
    /^\d+(\.\d+)?$/.test(approved) &&
    /^\d+(\.\d+)?$/.test(outstanding) &&
    Number.isFinite(paid + remaining) &&
    paid + remaining > 0;
  const percent = available
    ? Math.min(100, Math.max(0, (paid / (paid + remaining)) * 100))
    : 0;
  return (
    <div
      aria-label={t("customerPortal.record.paymentProgress")}
      className="w-full max-w-sm"
    >
      <h2 className="text-sm font-semibold">
        {t("customerPortal.record.paymentProgress")}
      </h2>
      <p className="mt-2 text-sm font-semibold tabular-nums">
        {t("customerPortal.record.paid")} {formatMoney(approved, locale)} / {available ? formatMoney(String(paid + remaining), locale) : t("customerPortal.common.unavailable")} {available && t("customerPortal.common.baht")}
      </p>
      {available && (
        <div
          role="progressbar"
          aria-label={t("customerPortal.record.paymentProgress")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
          className="mt-3 h-2 max-w-sm overflow-hidden rounded-full bg-black/20 dark:bg-white/20"
        >
          <div
            className="h-full bg-[var(--customer-action-primary)]"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}
