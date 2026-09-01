export type BillingQuality = "complete" | "partial" | "estimated" | "invalid";
export interface MeterSnapshot { meterId: string; valueKwh: number; observedAt: Date; targetAt?: Date; }
export interface CumulativeDiffResult { meterId: string; openingKwh: number; closingKwh: number; consumedKwh: number; quality: BillingQuality; reason?: string; }
export function calculateCumulativeDiff(opening: MeterSnapshot | undefined, closing: MeterSnapshot | undefined, toleranceMinutes = 15): CumulativeDiffResult {
  const meterId = closing?.meterId ?? opening?.meterId ?? "unknown";
  if (!opening || !closing) return { meterId, openingKwh: opening?.valueKwh ?? 0, closingKwh: closing?.valueKwh ?? 0, consumedKwh: 0, quality: "invalid", reason: "missing_reading" };
  if (closing.valueKwh < opening.valueKwh) return { meterId, openingKwh: opening.valueKwh, closingKwh: closing.valueKwh, consumedKwh: 0, quality: "invalid", reason: "negative_diff_or_meter_reset" };
  const openingAge = opening.targetAt ? Math.abs(opening.observedAt.getTime() - opening.targetAt.getTime()) : 0;
  const closingAge = closing.targetAt ? Math.abs(closing.observedAt.getTime() - closing.targetAt.getTime()) : 0;
  const quality: BillingQuality = Math.max(openingAge, closingAge) <= toleranceMinutes * 60_000 ? "complete" : "partial";
  return { meterId, openingKwh: opening.valueKwh, closingKwh: closing.valueKwh, consumedKwh: closing.valueKwh - opening.valueKwh, quality, ...(quality === "partial" ? { reason: "reading_outside_tolerance" } : {}) };
}
