export type QualityStatus = "complete" | "partial" | "estimated" | "invalid";
export interface QualityRule { min?: number; max?: number; maxAgeSeconds?: number; }
export interface QualityResult { status: QualityStatus; reasons: string[]; }
export function evaluateQuality(value: number, sourceTime: Date, receivedTime: Date, rule: QualityRule = {}): QualityResult {
  const reasons: string[] = [];
  if (!Number.isFinite(value)) reasons.push("value_not_finite");
  if (rule.min !== undefined && value < rule.min) reasons.push("below_minimum");
  if (rule.max !== undefined && value > rule.max) reasons.push("above_maximum");
  if (rule.maxAgeSeconds !== undefined && (receivedTime.getTime() - sourceTime.getTime()) / 1000 > rule.maxAgeSeconds) reasons.push("stale_sample");
  return { status: reasons.length ? "invalid" : "complete", reasons };
}
export function normalizeValue(raw: number, scale: number, unit: string): { value: number; unit: string } {
  if (!Number.isFinite(raw) || !Number.isFinite(scale)) throw new Error("Invalid numeric value");
  return { value: raw * scale, unit };
}