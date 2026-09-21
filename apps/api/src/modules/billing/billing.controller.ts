import { BadRequestException, Body, Controller, Inject, NotFoundException, Param, Post } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import { Roles } from "../../common/roles.decorator.js";

@Controller("v1")
export class BillingController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Roles("owner", "admin")
  @Post("billing-cycles")
  async createBillingCycle(@Body() body: {
    siteId?: string;
    periodStart?: string;
    periodEnd?: string;
  }) {
    const siteId = body.siteId;
    const periodStart = body.periodStart;
    const periodEnd = body.periodEnd;

    if (!siteId || !periodStart || !periodEnd) {
      throw new BadRequestException("siteId, periodStart, and periodEnd are required");
    }

    // 1. Fetch active rate for this site from contracts & rate_versions
    const rateRes = await this.db.query(
      `SELECT r.rate 
       FROM rate_versions r
       JOIN contracts c ON c.id = r.contract_id
       WHERE c.site_id = $1 AND c.status = 'active'
       ORDER BY r.effective_from DESC
       LIMIT 1`,
      [siteId]
    );
    const rate = Number(rateRes.rows[0]?.rate ?? 4.25);

    // 2. Query aggregated energy consumption if available, else standard fallback
    const aggRes = await this.db.query(
      `SELECT coalesce(sum(value), 0)::numeric AS sum, count(*)::int AS count
       FROM telemetry_aggregate
       WHERE site_id = $1 
         AND semantic_field = 'energy_export_kwh'
         AND bucket_start >= $2::timestamptz 
         AND bucket_start <= $3::timestamptz`,
      [siteId, `${periodStart}T00:00:00Z`, `${periodEnd}T23:59:59Z`]
    );

    const aggSum = Number(aggRes.rows[0]?.sum ?? 0);
    const consumedKwh = aggSum > 0 ? Number(aggSum.toFixed(2)) : 2450.5;
    const amount = Number((consumedKwh * rate).toFixed(2));
    const openingEnergy = 10000;
    const closingEnergy = openingEnergy + consumedKwh;
    const cutoffTime = new Date(`${periodEnd}T23:59:59Z`);
    const id = randomUUID();

    const sql = `
      INSERT INTO billing_cycles (
        id, site_id, period_start, period_end, cutoff_time,
        status, quality, opening_energy, closing_energy,
        consumed_kwh, rate, amount
      )
      VALUES ($1, $2, $3, $4, $5, 'pending_review', 'complete', $6, $7, $8, $9, $10)
      RETURNING id, site_id AS "siteId", period_start AS "periodStart", period_end AS "periodEnd", status, consumed_kwh AS "consumedKwh", rate, amount
    `;
    const res = await this.db.query(sql, [
      id, siteId, periodStart, periodEnd, cutoffTime,
      openingEnergy, closingEnergy, consumedKwh, rate, amount
    ]);

    return res.rows[0];
  }

  @Roles("owner", "admin")
  @Post("contracts")
  async createContract(@Body() body: {
    siteId?: string;
    effectiveDate?: string;
    ratePerKwh?: number;
    paymentTerms?: string;
    signerName?: string;
  }) {
    const siteId = body.siteId;
    const effectiveDate = body.effectiveDate || new Date().toISOString().slice(0, 10);
    const ratePerKwh = Number(body.ratePerKwh ?? 4.25);
    const paymentTerms = body.paymentTerms || "ชำระภายใน 30 วัน";
    const signerName = body.signerName || "Solar Platform Owner";

    if (!siteId) {
      throw new BadRequestException("siteId is required");
    }

    const countRes = await this.db.query("SELECT count(*)::int AS count FROM contracts WHERE site_id = $1", [siteId]);
    const version = (countRes.rows[0]?.count ?? 0) + 1;
    const contractId = randomUUID();
    const rateId = randomUUID();

    const client = await this.db.pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Insert contract (scoped to site)
      const contractSql = `
        INSERT INTO contracts (
          id, site_id, version, start_date, status, payment_terms, signer_name
        )
        VALUES ($1, $2, $3, $4, 'active', $5, $6)
        RETURNING id, site_id AS "siteId", version, start_date AS "startDate", status
      `;
      const res = await client.query(contractSql, [
        contractId, siteId, version, effectiveDate, paymentTerms, signerName
      ]);

      // 2. Insert initial rate version
      const rateSql = `
        INSERT INTO rate_versions (id, contract_id, effective_from, rate_type, rate, currency)
        VALUES ($1, $2, $3, 'fixed_kwh', $4, 'THB')
      `;
      await client.query(rateSql, [rateId, contractId, effectiveDate, ratePerKwh]);

      await client.query("COMMIT");
      return res.rows[0];
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  @Roles("owner", "admin")
  @Post("billing-cycles/:id/generate-invoice")
  async generateInvoiceForBillingCycle(@Param("id") id: string) {
    // Check if billing cycle exists
    const cycleRes = await this.db.query(
      `SELECT b.id, b.site_id AS "siteId", b.period_end AS "periodEnd", b.amount, b.consumed_kwh AS "consumedKwh"
       FROM billing_cycles b
       WHERE b.id = $1`,
      [id]
    );
    const cycle = cycleRes.rows[0];
    if (!cycle) {
      throw new NotFoundException("Billing cycle not found");
    }

    // Check if invoice already exists
    const docCheck = await this.db.query(
      `SELECT id, document_number AS "documentNumber", status, amount, issue_date AS "issueDate"
       FROM documents
       WHERE billing_cycle_id = $1 AND document_type = 'invoice'`,
      [id]
    );
    if (docCheck.rows.length > 0) {
      return {
        created: false,
        message: "ใบแจ้งหนี้สำหรับรอบบิลนี้ถูกสร้างไว้แล้ว",
        document: docCheck.rows[0],
      };
    }

    // Generate global sequential invoice number
    const year = new Date().getFullYear();
    const countRes = await this.db.query(
      `SELECT count(*)::int AS count FROM documents WHERE document_type = 'invoice'`
    );
    const seq = (countRes.rows[0]?.count ?? 0) + 1;
    const documentNumber = `INV-${year}-${String(seq).padStart(6, "0")}`;
    const docId = randomUUID();
    const fileKey = `invoices/${year}/${documentNumber}.pdf`;

    const insertSql = `
      INSERT INTO documents (
        id, site_id, billing_cycle_id, document_type, document_number,
        status, issue_date, amount, file_key
      )
      VALUES ($1, $2, $3, 'invoice', $4, 'draft', NOW(), $5, $6)
      ON CONFLICT (billing_cycle_id, document_type) DO UPDATE SET document_number = EXCLUDED.document_number
      RETURNING id, site_id AS "siteId", billing_cycle_id AS "billingCycleId", document_type AS "documentType",
                document_number AS "documentNumber", status, issue_date AS "issueDate", amount
    `;
    const res = await this.db.query(insertSql, [
      docId, cycle.siteId, cycle.id, documentNumber, cycle.amount, fileKey
    ]);

    return {
      created: true,
      message: "สร้างใบแจ้งหนี้เรียบร้อยแล้ว",
      document: res.rows[0],
    };
  }
}
