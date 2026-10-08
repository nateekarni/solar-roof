export function formatOrganizationMonth(value: string, locale: "th" | "en") {
  const month = value.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return "—";
  return new Intl.DateTimeFormat(
    locale === "th" ? "th-TH-u-ca-buddhist" : "en-US-u-ca-gregory",
    { month: "long", year: "numeric", timeZone: "Asia/Bangkok" },
  ).format(new Date(`${month}-01T12:00:00Z`));
}
