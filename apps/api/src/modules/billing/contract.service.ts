import { ConflictException, Injectable } from "@nestjs/common";
export interface ContractRecord { id: string; siteId: string; version: number; startsAt: Date; endsAt?: Date; rateId: string; paymentTerms: string; signers: string[]; attachmentKeys: string[]; active: boolean; }
export interface ContractPeriod { startsAt: Date; endsAt?: Date; }
@Injectable()
export class ContractService {
  private readonly contracts = new Map<string, ContractRecord>();
  validateNoOverlap(siteId: string, period: ContractPeriod, exceptId?: string): void {
    for (const c of this.contracts.values()) {
      if (c.siteId !== siteId || c.id === exceptId) continue;
      const ends = (period.endsAt?.getTime() ?? Number.POSITIVE_INFINITY);
      const existingEnds = c.endsAt?.getTime() ?? Number.POSITIVE_INFINITY;
      if (period.startsAt.getTime() < existingEnds && c.startsAt.getTime() < ends) throw new ConflictException("Contract period overlaps existing contract");
    }
  }
  create(input: Omit<ContractRecord, "active">): ContractRecord {
    this.validateNoOverlap(input.siteId, input);
    const record = { ...input, active: true };
    this.contracts.set(record.id, record);
    return record;
  }
  listBySite(siteId: string): ContractRecord[] { return [...this.contracts.values()].filter(c => c.siteId === siteId); }
}
