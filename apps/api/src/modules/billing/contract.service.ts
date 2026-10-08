import { ConflictException, Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";

export interface ContractRecord {
  id: string;
  siteId: string;
  version: number;
  startsAt: Date;
  endsAt?: Date;
  rateId?: string;
  paymentTerms: string;
  signers?: string[];
  signerName?: string;
  active: boolean;
}

export interface ContractPeriod {
  startsAt: Date;
  endsAt?: Date;
}

@Injectable()
export class ContractService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async validateNoOverlap(siteId: string, period: ContractPeriod, exceptId?: string): Promise<void> {
    const res = await this.db.query(
      `SELECT id, start_date AS "startDate", end_date AS "endDate"
       FROM contracts
       WHERE site_id = $1 AND status = 'active' ${exceptId ? "AND id != $2" : ""}`,
      exceptId ? [siteId, exceptId] : [siteId]
    );

    for (const c of res.rows) {
      const existingStarts = new Date(c.startDate).getTime();
      const existingEnds = c.endDate ? new Date(c.endDate).getTime() : Number.POSITIVE_INFINITY;
      const periodStarts = period.startsAt.getTime();
      const periodEnds = period.endsAt ? period.endsAt.getTime() : Number.POSITIVE_INFINITY;

      if (periodStarts < existingEnds && existingStarts < periodEnds) {
        throw new ConflictException("Contract period overlaps existing active contract");
      }
    }
  }

  // Creation is owned by BillingController: contract, rates and original PDF share one transaction.

  async listBySite(siteId: string): Promise<any[]> {
    const res = await this.db.query("SELECT * FROM contracts WHERE site_id = $1 ORDER BY start_date DESC", [siteId]);
    return res.rows;
  }
}
