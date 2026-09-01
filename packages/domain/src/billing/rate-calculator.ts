export interface FixedRateVersion { rateType: "fixed"; amountPerKwh: number; effectiveFrom: Date; effectiveTo?: Date; }
export interface Money { amount: number; currency: "THB"; }
export function calculateRate(kwh: number, rate: FixedRateVersion): Money {
  if (kwh < 0 || !Number.isFinite(kwh)) throw new Error("kwh must be non-negative");
  if (rate.amountPerKwh < 0 || !Number.isFinite(rate.amountPerKwh)) throw new Error("rate must be non-negative");
  return { amount: Math.round(kwh * rate.amountPerKwh * 100) / 100, currency: "THB" };
}
