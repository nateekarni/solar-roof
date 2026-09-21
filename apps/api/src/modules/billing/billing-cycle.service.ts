import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { assertTransition } from "@solar/domain";
import type { BillingStatus } from "@solar/domain";
import { DatabaseService } from "../../database/database.service.js";
import { BillingCalculationService } from "./billing-calculation.service.js";
import type { BillingPreview, BillingPreviewInput } from "./billing-calculation.service.js";

@Injectable()
export class BillingCycleService {
  constructor(
    @Inject(BillingCalculationService) private readonly calculator: BillingCalculationService,
    @Inject(DatabaseService) private readonly db: DatabaseService
  ) {}

  preview(input: BillingPreviewInput): BillingPreview {
    return this.calculator.preview(input);
  }

  async approve(id: string, actorId: string, reason?: string) {
    const res = await this.db.query("SELECT * FROM billing_cycles WHERE id = $1", [id]);
    const cycle = res.rows[0];
    if (!cycle) throw new NotFoundException("Billing cycle not found");

    if ((cycle.quality === "partial" || cycle.quality === "estimated") && !reason?.trim()) {
      throw new ConflictException("Approval reason is required for non-complete billing");
    }

    assertTransition(cycle.status as BillingStatus, "approved");
    const updated = await this.db.query(
      `UPDATE billing_cycles SET status = 'approved' WHERE id = $1 RETURNING *`,
      [id]
    );
    return updated.rows[0];
  }

  async finalize(id: string) {
    const res = await this.db.query("SELECT * FROM billing_cycles WHERE id = $1", [id]);
    const cycle = res.rows[0];
    if (!cycle) throw new NotFoundException("Billing cycle not found");

    if (cycle.quality === "invalid") {
      throw new ConflictException("Invalid billing cannot be finalized");
    }

    assertTransition(cycle.status as BillingStatus, "finalized");
    const updated = await this.db.query(
      `UPDATE billing_cycles SET status = 'finalized' WHERE id = $1 RETURNING *`,
      [id]
    );
    return updated.rows[0];
  }

  async get(id: string) {
    const res = await this.db.query("SELECT * FROM billing_cycles WHERE id = $1", [id]);
    return res.rows[0];
  }
}
