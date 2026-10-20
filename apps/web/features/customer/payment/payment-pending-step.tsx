import { createTranslator, type Locale } from "@solar/i18n";
import { paymentControl } from "./customer-evidence-picker";
export function PaymentPendingStep({
  locale,
  recordHref,
}: {
  locale: Locale;
  recordHref: string;
}) {
  const t = createTranslator(locale);
  return (
    <div className="space-y-6">
      <p role="status">{t("customerPortal.payment.pending")}</p>
      <p>{t("customerPortal.payment.pendingDescription")}</p>
      <ol className="list-inside list-decimal space-y-3">
        <li>{t("customerPortal.payment.evidence")}</li>
        <li>{t("customerPortal.status.pendingVerification")}</li>
      </ol>
      <div className="flex flex-wrap gap-3">
        <a className={paymentControl} href="/">
          {t("customerPortal.payment.returnHome")}
        </a>
        <a className={paymentControl} href={recordHref}>
          {t("customerPortal.payment.viewRecord")}
        </a>
      </div>
    </div>
  );
}
