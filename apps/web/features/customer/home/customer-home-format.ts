import { createTranslator, type Locale } from "@solar/i18n";
import type { CustomerBillingStatus } from "@solar/api-contracts";

export function formatDecimal(value: string | null, locale: Locale): string {
  if (value === null || !/^-?\d+(\.\d+)?$/.test(value))
    return createTranslator(locale)("customerPortal.common.unavailable");
  const [whole = "0", rawFraction] = value.split(".");
  const fraction = rawFraction?.replace(/0+$/, "");
  const formatter = new Intl.NumberFormat(locale);
  const separator =
    formatter.formatToParts(1.1).find((part) => part.type === "decimal")
      ?.value ?? ".";
  return (
    formatter.format(BigInt(whole)) + (fraction ? separator + fraction : "")
  );
}
export function formatMoney(value: string | null, locale: Locale): string {
  if (value === null || !/^-?\d+(\.\d+)?$/.test(value))
    return createTranslator(locale)("customerPortal.common.unavailable");
  const negative = value.startsWith("-");
  const [whole = "0", fraction = ""] = value.replace(/^-/, "").split(".");
  let minor = BigInt((fraction + "00").slice(0, 2));
  if ((fraction[2] ?? "0") >= "5") minor += 1n;
  let major = BigInt(whole);
  if (minor === 100n) {
    major += 1n;
    minor = 0n;
  }
  const formatter = new Intl.NumberFormat(locale);
  const separator =
    formatter.formatToParts(1.1).find((part) => part.type === "decimal")
      ?.value ?? ".";
  return `${negative ? "-" : ""}${formatter.format(major)}${separator}${minor.toString().padStart(2, "0")}`;
}
export function formatDate(
  value: string | null,
  locale: Locale,
  monthOnly = false,
): string {
  if (!value)
    return createTranslator(locale)("customerPortal.common.unavailable");
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "long",
    ...(!monthOnly && { day: "numeric" }),
  }).format(
    new Date(value.length === 7 ? `${value}-01T00:00:00+07:00` : value),
  );
}
const statusKeys: Record<CustomerBillingStatus, string> = {
  awaiting_payment: "awaitingPayment",
  pending_verification: "pendingVerification",
  partially_paid: "partiallyPaid",
  overdue: "overdue",
  paid: "paid",
  unsuccessful: "unsuccessful",
};
export function billStatus(status: CustomerBillingStatus, locale: Locale) {
  return createTranslator(locale)(
    `customerPortal.status.${statusKeys[status]}`,
  );
}
