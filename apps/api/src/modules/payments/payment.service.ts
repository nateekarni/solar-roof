import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";

export interface Payment {
  id: string;
  invoiceId?: string;
  billingCycleId?: string;
  siteId?: string;
  amount: number;
  status: "pending" | "paid" | "rejected";
  paidAt?: Date;
  markedBy?: string;
  evidenceFileId?: string;
  note?: string;
}

@Injectable()
export class PaymentService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async create(input: Omit<Payment, "status">): Promise<Payment> {
    const cycleId = input.billingCycleId || input.invoiceId;
    if (cycleId) {
      await this.db.query(
        `INSERT INTO payments (id, billing_cycle_id, status, paid_at, evidence_key, note)
         VALUES ($1, $2, 'pending', NULL, $3, $4)`,
        [input.id, cycleId, input.evidenceFileId ?? null, input.note ?? null]
      );
    }
    return { ...input, status: "pending" };
  }

  async markPaid(input: { paymentId: string; actorId: string; evidenceFileId?: string }): Promise<Payment> {
    const res = await this.db.query(
      `UPDATE payments 
       SET status = 'paid', paid_at = NOW(), evidence_key = coalesce($2, evidence_key)
       WHERE id = $1
       RETURNING id, billing_cycle_id AS "billingCycleId", status, paid_at AS "paidAt", evidence_key AS "evidenceFileId"`,
      [input.paymentId, input.evidenceFileId ?? null]
    );

    const row = res.rows[0];
    if (!row) {
      throw new NotFoundException("Payment not found");
    }

    return {
      id: row.id,
      billingCycleId: row.billingCycleId,
      amount: 0,
      status: row.status,
      paidAt: row.paidAt,
      markedBy: input.actorId,
      evidenceFileId: row.evidenceFileId,
    };
  }

  async get(id: string): Promise<Payment> {
    const res = await this.db.query(
      `SELECT p.id,p.billing_cycle_id AS "billingCycleId",b.site_id AS "siteId",p.status,p.paid_at AS "paidAt",p.evidence_key AS "evidenceFileId"
       FROM payments p JOIN billing_cycles b ON b.id=p.billing_cycle_id WHERE p.id=$1`,
      [id]
    );
    const row = res.rows[0];
    if (!row) {
      throw new NotFoundException("Payment not found");
    }
    return {
      id: row.id,
      billingCycleId: row.billingCycleId,
      siteId: row.siteId,
      amount: 0,
      status: row.status,
      paidAt: row.paidAt,
      evidenceFileId: row.evidenceFileId,
    };
  }
}
