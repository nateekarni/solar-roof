import { Injectable } from "@nestjs/common";
import { calculateBillingCumulativeDiff, calculateRate } from "@solar/domain";
import type { BillingQuality, MeterSnapshot, Money } from "@solar/domain";
export interface BillingPreviewInput { cycleKey: string; siteId: string; opening: MeterSnapshot[]; closing: MeterSnapshot[]; rate: { rateType: "fixed"; amountPerKwh: number; effectiveFrom: Date; effectiveTo?: Date }; toleranceMinutes?: number; }
export interface BillingPreview { cycleKey: string; siteId: string; consumedKwh: number; charge: Money; quality: BillingQuality; meterResults: ReturnType<typeof calculateBillingCumulativeDiff>[]; status: "draft" | "pending_approval" | "approved" | "finalized" | "cancelled"; }
@Injectable()
export class BillingCalculationService {
  preview(input: BillingPreviewInput): BillingPreview {
    const closingByMeter = new Map(input.closing.map(s => [s.meterId, s]));
    const results = input.opening.map(opening => calculateBillingCumulativeDiff(opening, closingByMeter.get(opening.meterId), input.toleranceMinutes ?? 15));
    const quality: BillingQuality = results.some(r => r.quality === "invalid") ? "invalid" : results.some(r => r.quality === "partial") ? "partial" : "complete";
    const consumedKwh = results.reduce((sum, r) => sum + r.consumedKwh, 0);
    return { cycleKey: input.cycleKey, siteId: input.siteId, consumedKwh, charge: calculateRate(consumedKwh, input.rate), quality, meterResults: results, status: quality === "complete" ? "draft" : "pending_approval" };
  }
}
