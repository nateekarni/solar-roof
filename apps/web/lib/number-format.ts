/**
 * Formats numbers flexibly according to Solar Roof domain guidelines:
 * - For currency/money or tariff rates (isCurrencyOrRate: true):
 *   Always formats strictly to 2 decimal places (e.g., "1,250.00", "4.50").
 * - For general display numbers (thresholds, counts, metrics, temperatures):
 *   - Whole numbers or numbers with redundant zero decimals (e.g., "65.00000000", 65.0) are displayed as integers ("65").
 *   - Numbers with explicitly provided higher precision (> 2 decimal places, e.g., "65.1234", "0.0025") preserve the full entered precision.
 *   - Numbers with 1 or 2 decimal places (e.g. "65.5") are displayed cleanly with stripped redundant trailing zeros.
 */
export function formatFlexibleDecimal(
  val: number | string | null | undefined,
  options?: {
    isCurrencyOrRate?: boolean;
    useGrouping?: boolean;
    locale?: 'th' | 'en';
  }
): string {
  if (val === null || val === undefined || val === '') return '';
  const str = String(val).trim();
  const num = Number(str);
  if (isNaN(num)) return str;

  const locale = options?.locale ?? 'th';
  const numberLocale = locale === 'th' ? 'th-TH' : 'en-US';
  const useGrouping = options?.useGrouping ?? (options?.isCurrencyOrRate ? true : false);

  if (options?.isCurrencyOrRate) {
    return new Intl.NumberFormat(numberLocale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping,
    }).format(num);
  }

  // General display numbers:
  // If input string doesn't contain a decimal point, format as integer
  if (!str.includes('.')) {
    return new Intl.NumberFormat(numberLocale, { useGrouping }).format(num);
  }

  const [intPartStr, fractionStr = ''] = str.split('.');
  const intNum = Number(intPartStr);

  // If the fractional part is all zeros (e.g., "65.00000000" or "65.0")
  if (/^0+$/.test(fractionStr)) {
    return new Intl.NumberFormat(numberLocale, { useGrouping }).format(intNum);
  }

  // Strip trailing zeros from fractional part
  const cleanFraction = fractionStr.replace(/0+$/, '');

  // Format the integer part
  const formattedInt = new Intl.NumberFormat(numberLocale, { useGrouping }).format(intNum);

  // If cleanFraction is empty after stripping zeros, return integer part
  if (!cleanFraction) {
    return formattedInt;
  }

  // Preserve whatever precision is remaining (whether 1, 2, or > 2 digits)
  return `${formattedInt}.${cleanFraction}`;
}
