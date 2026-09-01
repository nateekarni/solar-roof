import { Injectable } from "@nestjs/common";
import type { BillingQuality, BillingStatus } from "@solar/domain";
export interface CloseBillingResult { cycleKey: string; quality: BillingQuality; status: BillingStatus; }
export interface BillingCycleCloser { close(cycleKey: string, cutoffAt: Date): Promise<CloseBillingResult>; }
export function bangkokMonthEndCutoff(year: number, month: number): Date {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, lastDay, 16, 59, 59, 999));
}
@Injectable()
export class CloseBillingCycleJob {
  private readonly completed = new Map<string, CloseBillingResult>();
  async run(cycleKey: string, closer: BillingCycleCloser, now = new Date()): Promise<CloseBillingResult> {
    const existing = this.completed.get(cycleKey);
    if (existing) return existing;
    const cutoffAt = bangkokMonthEndCutoff(now.getUTCFullYear(), now.getUTCMonth() + 1);
    const result = await closer.close(cycleKey, cutoffAt);
    if (result.quality === "invalid") return result;
    this.completed.set(cycleKey, result);
    return result;
  }
}
