export interface EnergyDiffResult { consumedKwh: number; status: "complete" | "invalid"; reason?: string; }
export function calculateCumulativeDiff(opening: number, closing: number): EnergyDiffResult {
  if (!Number.isFinite(opening) || !Number.isFinite(closing)) return { consumedKwh: 0, status: "invalid", reason: "non_finite_reading" };
  if (closing < opening) return { consumedKwh: 0, status: "invalid", reason: "meter_reset_or_rollover" };
  return { consumedKwh: closing - opening, status: "complete" };
}