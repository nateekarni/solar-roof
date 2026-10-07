const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

const ENGLISH_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function parseToDate(input: Date | string | number): Date | null {
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input;
  }
  if (typeof input === "number") {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof input === "string") {
    // Check YYYY-MM-DD or ISO
    const trimmed = input.trim();
    if (!trimmed) return null;
    const normalized = /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/.test(trimmed) ? trimmed.replace(" ", "T") + "Z" : trimmed;
    const d = new Date(normalized);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/**
 * Formats a date to "d MMMM yyyy":
 * - Thai: 21 กันยายน 2569 (CE + 543)
 * - English: 21 September 2026
 */
export function formatAppDate(
  input: Date | string | number,
  locale: "th" | "en" = "th",
): string {
  const parsed = parseToDate(input);
  const d = parsed ? new Date(parsed.getTime() + 7 * 60 * 60 * 1000) : null;
  if (!d) return String(input);

  const day = d.getUTCDate();
  const monthIdx = d.getUTCMonth();
  const year = locale === "th" ? d.getUTCFullYear() + 543 : d.getUTCFullYear();
  const monthName = locale === "th" ? THAI_MONTHS[monthIdx] : ENGLISH_MONTHS[monthIdx];

  return `${day} ${monthName} ${year}`;
}

/**
 * Formats a date range into a clean, relative human-readable format:
 * - Same month & year: "1-24 กันยายน 2569" / "1–24 September 2026"
 *   (or without year: "1-24 กันยายน" / "1–24 September")
 * - Same year, different months: "1 กันยายน - 31 ตุลาคม 2569" / "1 September – 31 October 2026"
 *   (or without year: "1 กันยายน - 31 ตุลาคม" / "1 September – 31 October")
 * - Different years: "1 มกราคม 2568 - 31 ธันวาคม 2569" / "1 January 2025 – 31 December 2026"
 * - Single day: "24 กันยายน 2569" / "24 September 2026"
 */
export function formatAppDateRange(
  fromInput: Date | string | number,
  toInput: Date | string | number,
  locale: "th" | "en" = "th",
  options: { includeYear?: boolean } = { includeYear: true }
): string {
  const parsed1 = parseToDate(fromInput);
  const d1 = parsed1 ? new Date(parsed1.getTime()+7*60*60*1000) : null;
  const parsed2 = parseToDate(toInput);
  const d2 = parsed2 ? new Date(parsed2.getTime()+7*60*60*1000) : null;
  if (!d1 && !d2) return "";
  if (!d1) return formatAppDate(parsed2!, locale);
  if (!d2) return formatAppDate(parsed1!, locale);

  const day1 = d1.getUTCDate();
  const m1 = d1.getUTCMonth();
  const y1 = d1.getUTCFullYear();

  const day2 = d2.getUTCDate();
  const m2 = d2.getUTCMonth();
  const y2 = d2.getUTCFullYear();

  const monthName1 = locale === "th" ? THAI_MONTHS[m1] : ENGLISH_MONTHS[m1];
  const monthName2 = locale === "th" ? THAI_MONTHS[m2] : ENGLISH_MONTHS[m2];
  const year1Str = locale === "th" ? `${y1 + 543}` : `${y1}`;
  const year2Str = locale === "th" ? `${y2 + 543}` : `${y2}`;

  const includeYear = options.includeYear ?? true;

  // Single Day
  if (day1 === day2 && m1 === m2 && y1 === y2) {
    return includeYear
      ? `${day1} ${monthName1} ${year1Str}`
      : `${day1} ${monthName1}`;
  }

  // Same Year & Same Month
  if (y1 === y2 && m1 === m2) {
    const sep = locale === "th" ? " - " : "–";
    return includeYear
      ? `${day1}${sep}${day2} ${monthName1} ${year1Str}`
      : `${day1}${sep}${day2} ${monthName1}`;
  }

  // Same Year, Different Month
  if (y1 === y2) {
    const sep = locale === "th" ? " - " : " – ";
    return includeYear
      ? `${day1} ${monthName1}${sep}${day2} ${monthName2} ${year1Str}`
      : `${day1} ${monthName1}${sep}${day2} ${monthName2}`;
  }

  // Different Years
  const sep = locale === "th" ? " - " : " – ";
  return `${day1} ${monthName1} ${year1Str}${sep}${day2} ${monthName2} ${year2Str}`;
}

/**
 * Formats a date & time to "d MMMM yyyy HH:mm" (strict 24-hour time):
 * - Thai: 21 กันยายน 2569 14:27
 * - English: 21 September 2026 14:27
 */
export function formatAppDateTime(
  input: Date | string | number,
  locale: "th" | "en" = "th",
): string {
  const parsed = parseToDate(input);
  const d = parsed ? new Date(parsed.getTime() + 7 * 60 * 60 * 1000) : null;
  if (!d) return String(input);

  const dateStr = formatAppDate(parsed!, locale);
  const hours = String(d.getUTCHours()).padStart(2, "0");
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");

  return `${dateStr} ${hours}:${minutes} (Asia/Bangkok)`;
}

/**
 * Formats time as 24-hour "HH:mm" without AM/PM
 */
export function formatAppTime(input: Date | string | number): string {
  const parsed = parseToDate(input);
  const d = parsed ? new Date(parsed.getTime() + 7 * 60 * 60 * 1000) : null;
  if (!d) return "";
  const hours = String(d.getUTCHours()).padStart(2, "0");
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Check if a string looks like a date or ISO timestamp
 */
export function isIsoDateLike(str: string): boolean {
  if (typeof str !== "string") return false;
  // Matches "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ss..." or "YYYY-MM-DD HH:mm:ss..."
  return /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(str.trim());
}

const MONTH_MAP_TH: Record<string, string> = {
  Jan: "มกราคม",
  Feb: "กุมภาพันธ์",
  Mar: "มีนาคม",
  Apr: "เมษายน",
  May: "พฤษภาคม",
  Jun: "มิถุนายน",
  Jul: "กรกฎาคม",
  Aug: "สิงหาคม",
  Sep: "กันยายน",
  Oct: "ตุลาคม",
  Nov: "พฤศจิกายน",
  Dec: "ธันวาคม",
};

const MONTH_MAP_EN: Record<string, string> = {
  Jan: "January",
  Feb: "February",
  Mar: "March",
  Apr: "April",
  May: "May",
  Jun: "June",
  Jul: "July",
  Aug: "August",
  Sep: "September",
  Oct: "October",
  Nov: "November",
  Dec: "December",
};

/**
 * Formats chart XAxis or Tooltip labels according to active locale
 */
export function formatChartTooltipLabel(label: string, locale: "th" | "en" = "th"): string {
  if (!label) return "";
  const trimmed = label.trim();

  // 4-digit Year (e.g. 2024, 2025, 2026)
  if (/^\d{4}$/.test(trimmed)) {
    const yr = Number(trimmed);
    return locale === "th" ? `ปี พ.ศ. ${yr + 543}` : `Year ${yr}`;
  }

  // YYYY-MM (e.g. 2026-01)
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    const [yrStr, moStr] = trimmed.split("-");
    const yr = Number(yrStr);
    const mIdx = Number(moStr) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      return locale === "th"
        ? `${THAI_MONTHS[mIdx]} ${yr + 543}`
        : `${ENGLISH_MONTHS[mIdx]} ${yr}`;
    }
  }

  // Month abbreviations (e.g. Aug, Sep)
  if (MONTH_MAP_TH[trimmed]) {
    return locale === "th" ? MONTH_MAP_TH[trimmed]! : (MONTH_MAP_EN[trimmed] || trimmed);
  }
  // DD/MM (e.g. 21/09)
  if (/^\d{1,2}\/\d{1,2}$/.test(trimmed)) {
    const [day, month] = trimmed.split("/");
    const mIdx = Number(month) - 1;
    const now = new Date();
    const yr = now.getFullYear();
    if (mIdx >= 0 && mIdx < 12) {
      const monthName = locale === "th" ? THAI_MONTHS[mIdx] : ENGLISH_MONTHS[mIdx];
      const yearStr = locale === "th" ? `${yr + 543}` : `${yr}`;
      return locale === "th" ? `วันที่ ${Number(day)} ${monthName} ${yearStr}` : `${Number(day)} ${monthName} ${yearStr}`;
    }
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return formatAppDate(trimmed, locale);
  }
  // 24hr Time (e.g. 14:00)
  if (/^\d{2}:\d{2}$/.test(trimmed)) {
    return locale === "th" ? `${trimmed} น.` : trimmed;
  }
  // Single day (e.g. 1-31)
  if (/^\d{1,2}$/.test(trimmed)) {
    const d = Number(trimmed);
    const now = new Date();
    const mIdx = now.getMonth();
    const yr = now.getFullYear();
    const monthName = locale === "th" ? THAI_MONTHS[mIdx] : ENGLISH_MONTHS[mIdx];
    const yearStr = locale === "th" ? `${yr + 543}` : `${yr}`;
    return locale === "th" ? `วันที่ ${d} ${monthName} ${yearStr}` : `${d} ${monthName} ${yearStr}`;
  }
  return trimmed;
}

/**
 * Formats short labels for XAxis ticks (e.g. 1/9, 2/9 in month view)
 */
export function formatChartAxisLabel(label: string, locale: "th" | "en" = "th"): string {
  if (!label) return "";
  const trimmed = label.trim();

  // 4-digit Year (e.g. 2024) -> 2567 or 2024
  if (/^\d{4}$/.test(trimmed)) {
    const yr = Number(trimmed);
    return locale === "th" ? String(yr + 543) : String(yr);
  }

  // YYYY-MM-DD -> D/M (e.g. 1/9)
  if (/^\d{4}-(\d{2})-(\d{2})$/.test(trimmed)) {
    const [, mo, d] = trimmed.match(/^\d{4}-(\d{2})-(\d{2})$/)!;
    return `${Number(d)}/${Number(mo)}`;
  }

  // YYYY-MM (e.g. 2026-01) -> ม.ค. or Jan
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    const [, moStr] = trimmed.split("-");
    const mIdx = Number(moStr) - 1;
    const monthsTh = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    const monthsEn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    if (mIdx >= 0 && mIdx < 12) {
      return locale === "th" ? monthsTh[mIdx]! : monthsEn[mIdx]!;
    }
  }

  // DD/MM (e.g. 01/09) -> 1/9
  if (/^(\d{1,2})\/(\d{1,2})$/.test(trimmed)) {
    const [, d, m] = trimmed.match(/^(\d{1,2})\/(\d{1,2})$/)!;
    return `${Number(d)}/${Number(m)}`;
  }

  // Single or 2-digit Day (e.g. "01", "1", "15") in month view -> 1/9, 15/9
  if (/^\d{1,2}$/.test(trimmed)) {
    const day = Number(trimmed);
    const month = new Date().getMonth() + 1;
    return `${day}/${month}`;
  }

  // Month abbreviations (e.g. Aug)
  const shortMapTh: Record<string, string> = {
    Jan: "ม.ค.",
    Feb: "ก.พ.",
    Mar: "มี.ค.",
    Apr: "เม.ย.",
    May: "พ.ค.",
    Jun: "มิ.ย.",
    Jul: "ก.ค.",
    Aug: "ส.ค.",
    Sep: "ก.ย.",
    Oct: "ต.ค.",
    Nov: "พ.ย.",
    Dec: "ธ.ค.",
  };
  if (shortMapTh[trimmed]) {
    return locale === "th" ? shortMapTh[trimmed]! : trimmed;
  }

  return trimmed;
}
