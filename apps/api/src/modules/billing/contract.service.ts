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

  async create(input: Omit<ContractRecord, "active">): Promise<ContractRecord> {
    await this.validateNoOverlap(input.siteId, input);
    const signer = input.signerName || input.signers?.[0] || "Solar Roof Owner";
    await this.db.query(
      `INSERT INTO contracts (id, site_id, version, start_date, end_date, status, payment_terms, signer_name)
       VALUES ($1, $2, $3, $4, $5, 'active', $6, $7)`,
      [input.id, input.siteId, input.version, input.startsAt, input.endsAt ?? null, input.paymentTerms, signer]
    );
    return { ...input, active: true };
  }

  async listBySite(siteId: string): Promise<any[]> {
    const res = await this.db.query("SELECT * FROM contracts WHERE site_id = $1 ORDER BY start_date DESC", [siteId]);
    return res.rows;
  }
}
