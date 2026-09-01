import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { FixedRateVersion } from "@solar/domain";
export interface RateRecord extends FixedRateVersion { id: string; contractId: string; }
@Injectable()
export class RateService {
  private readonly rates = new Map<string, RateRecord>();
  create(input: RateRecord): RateRecord {
    if (input.rateType !== "fixed") throw new ConflictException("Only fixed rates are enabled in Phase 1");
    if (input.amountPerKwh < 0) throw new ConflictException("Rate must be non-negative");
    for (const rate of this.rates.values()) if (rate.contractId === input.contractId && input.effectiveFrom < (rate.effectiveTo ?? new Date("9999-12-31")) && rate.effectiveFrom < (input.effectiveTo ?? new Date("9999-12-31"))) throw new ConflictException("Rate period overlaps existing rate");
    this.rates.set(input.id, input); return input;
  }
  get(id: string): RateRecord { const rate = this.rates.get(id); if (!rate) throw new NotFoundException("Rate not found"); return rate; }
  listByContract(contractId: string): RateRecord[] { return [...this.rates.values()].filter(r => r.contractId === contractId); }
}
