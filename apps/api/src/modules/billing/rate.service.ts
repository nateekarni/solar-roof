import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { FixedRateVersion } from "@solar/domain";
import { DatabaseService } from "../../database/database.service.js";

export interface RateRecord extends FixedRateVersion {
  id: string;
  contractId: string;
}

@Injectable()
export class RateService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async create(input: RateRecord): Promise<RateRecord> {
    if (input.rateType !== "fixed") throw new ConflictException("Only fixed rates are enabled in Phase 1");
    if (input.amountPerKwh < 0) throw new ConflictException("Rate must be non-negative");

    await this.db.query(
      `INSERT INTO rate_versions (id, contract_id, effective_from, effective_to, rate_type, rate, currency)
       VALUES ($1, $2, $3, $4, 'fixed_kwh', $5, 'THB')`,
      [input.id, input.contractId, input.effectiveFrom, input.effectiveTo ?? null, input.amountPerKwh]
    );

    return input;
  }

  async get(id: string): Promise<any> {
    const res = await this.db.query("SELECT * FROM rate_versions WHERE id = $1", [id]);
    if (res.rows.length === 0) throw new NotFoundException("Rate not found");
    return res.rows[0];
  }

  async listByContract(contractId: string): Promise<any[]> {
    const res = await this.db.query(
      "SELECT * FROM rate_versions WHERE contract_id = $1 ORDER BY effective_from DESC",
      [contractId]
    );
    return res.rows;
  }
}
