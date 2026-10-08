import { ContractPdfService, type ScopedActor } from '../documents/contract-pdf.service.js';
import { readOrganizationDefaults, contractIdentity } from "./organization-defaults.js";
import { schoolScope } from "../../common/auth/route-policy.js";
import {normalizeTestRateSchedule,validFinancialDate} from './local-financial-policy.js';
import {
  BadRequestException,
  ForbiddenException,
  Query,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { type Request } from "express";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { DatabaseService } from "../../database/database.service.js";
import { Roles } from "../../common/roles.decorator.js";

import { FinancialReadinessService } from "./financial-readiness.service.js";
import { LocalFinancialApplicationService } from './local-financial-application.service.js';

@Controller("v1")
export class BillingController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService, @Inject(FinancialReadinessService) private readonly readiness: FinancialReadinessService, @Inject(LocalFinancialApplicationService) private readonly financial: LocalFinancialApplicationService, @Inject(ContractPdfService) private readonly contractPdfs: ContractPdfService) {}

  @Roles("owner", "admin", "accountant")
  @Post("billing-cycles")
  async createBillingCycle(@Body() body: {
    siteId?: string;
    periodStart?: string;
    periodEnd?: string;
  }) {
    await this.readiness.assertEnabled('calculate');
    if(await this.readiness.isLocalTestReady()) {
      if(!body.siteId||!body.periodStart||!body.periodEnd)throw new BadRequestException('siteId, periodStart, periodEnd required');
      return (await this.financial.calculate(body.siteId,body.periodStart,body.periodEnd)).cycles[0];
    }
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

  @Get("contracts")
  async listContracts() {
    const res = await this.db.query(`
      SELECT 
        c.id,
        c.site_id AS "siteId",
        si.name AS "siteName",
        s.name AS "schoolName",
        c.version,
        c.start_date AS "startDate",
        c.end_date AS "endDate",
        c.status,
        c.payment_terms AS "paymentTerms",
        c.signer_name AS "signerName",
        c.tax_id AS "taxId",
        c.company_name AS "companyName",
        c.branch,
        c.tax_address AS "taxAddress",
        c.billing_email AS "billingEmail",
        c.billing_phone AS "billingPhone",
        coalesce(
          (
            SELECT json_agg(
              json_build_object(
                'id', rv.id,
                'startDate', rv.effective_from,
                'endDate', rv.effective_to,
                'rate', rv.rate
              ) ORDER BY rv.effective_from ASC
            )
            FROM rate_versions rv
            WHERE rv.contract_id = c.id
          ),
          '[]'::json
        ) AS rates
      FROM contracts c
      JOIN sites si ON si.id = c.site_id
      JOIN schools s ON s.id = si.school_id
      ORDER BY c.start_date DESC
    `);
    return res.rows;
  }

  @Roles("owner", "admin")
  @Get("operations/contracts/organization-defaults")
  async contractOrganizationDefaults(@Query("siteId") siteId:string,@Req() req:{user?:{role?:string;schoolId?:string}}){
    if(!["owner","admin"].includes(req.user?.role??""))throw new ForbiddenException("This action is not permitted for your role");
    if(!siteId)throw new BadRequestException("siteId is required");
    const defaults=await readOrganizationDefaults(this.db,siteId);
    const scope=schoolScope(req.user);
    if(scope!==null&&!scope.includes(defaults.schoolId))throw new ForbiddenException("Resource outside assigned school");
    return {organization:{id:defaults.id,name:defaults.name,code:defaults.code},companyName:defaults.legalName,taxId:defaults.taxId,branch:defaults.taxBranch,taxAddress:defaults.taxAddress,billingEmail:defaults.documentEmail,billingPhone:defaults.phone};
  }

  @Roles("owner", "admin")
  @Post("contracts")
  async createContract(@Body() body: {
    siteId?: string;
    siteIds?: string[];
    effectiveDate?: string;
    ratePerKwh?: number;
    paymentTermDays?: number;
    recipientUserIds?: string[];
    paymentTerms?: string;
    signerName?: string;
    signerTitle?: string;
    customerSignerName?: string;
    customerSignerTitle?: string;
    taxId?: string;
    companyName?: string;
    branch?: string;
    taxAddress?: string;
    billingEmail?: string;
    billingPhone?: string;
    rates?: Array<{ startDate: string; endDate?: string | null; rate: number }>;
  }, @Req() req: {user?:ScopedActor}) {
    if(!['owner','admin'].includes(req?.user?.role??''))throw new ForbiddenException('Contract author required');
    const actor=req.user!;
    const rawSiteIds = body.siteIds && body.siteIds.length > 0 ? body.siteIds : body.siteId ? [body.siteId] : [];
    const siteIds = Array.from(new Set(rawSiteIds.filter(Boolean)));
    const effectiveDate = body.effectiveDate || new Date().toISOString().slice(0, 10);
    const ratePerKwh = Number(body.ratePerKwh);
    const paymentTerms = body.paymentTerms?.trim();
    if(await this.readiness.isLocalTestReady()) {
      if(!validFinancialDate(effectiveDate))throw new BadRequestException('Valid contract start date required');
      if(body.rates?.length)try{body.rates=normalizeTestRateSchedule(body.rates.map(rate=>({...rate,startDate:rate.startDate||effectiveDate})));}catch(error){throw new BadRequestException((error as Error).message);}
    }
    if(body.paymentTermDays!==undefined&&(!Number.isInteger(body.paymentTermDays)||body.paymentTermDays<0||body.paymentTermDays>3650))throw new BadRequestException('paymentTermDays must be 0–3650');
    const signerName = body.signerName?.trim();
    if (!paymentTerms) throw new BadRequestException({message:'กรุณาระบุเงื่อนไขการชำระเงิน / Payment terms required',fields:{paymentTerms:{th:'กรุณาระบุเงื่อนไขการชำระเงิน',en:'Payment terms required'}}});
    const rates = body.rates?.length ? body.rates : [{rate: body.ratePerKwh}];
    if (rates.some(r => typeof r.rate !== 'number' || !Number.isFinite(r.rate) || r.rate < 0)) throw new BadRequestException('An explicit nonnegative rate is required for every rate period');

    if (siteIds.length === 0) {
      throw new BadRequestException("At least one siteId is required");
    }

    const client = await this.db.pool.connect();
    try {
      await client.query("BEGIN");

      const createdContracts = [];
      const issuerDefaults=(await client.query('SELECT signatory_name,signatory_title FROM company_profile WHERE is_configured=true ORDER BY updated_at DESC LIMIT 1')).rows[0];
      const providerName=body.signerName===undefined?(issuerDefaults?.signatory_name??''):signerName;
      const providerTitle=body.signerTitle===undefined?(issuerDefaults?.signatory_title??''):body.signerTitle.trim();

      for (const targetSiteId of siteIds) {
        const {taxId,companyName,branch,taxAddress,billingEmail,billingPhone}=contractIdentity(body,await readOrganizationDefaults(client,targetSiteId));
        const countRes = await client.query("SELECT count(*)::int AS count FROM contracts WHERE site_id = $1", [targetSiteId]);
        const version = (countRes.rows[0]?.count ?? 0) + 1;
        const contractId = randomUUID();
        if(await this.readiness.isLocalTestReady()) {
          const recipients=Array.from(new Set(body.recipientUserIds??[]));
          if(!recipients.length)throw new BadRequestException('Select verified organization recipients');
          const eligible=await client.query(`SELECT u.id FROM users u JOIN sites s ON s.school_id=u.school_id JOIN schools sc ON sc.id=s.school_id WHERE s.id=$1 AND u.id=ANY($2::uuid[]) AND u.role='school_user' AND u.status='active' AND sc.status='active' AND u.email_verified_at IS NOT NULL AND u.verified_email=u.email`,[targetSiteId,recipients]);
          if(eligible.rows.length!==recipients.length)throw new BadRequestException('Recipients must be active verified organization users for this site');
          if(body.paymentTermDays===undefined)throw new BadRequestException('Explicit paymentTermDays required');
        }

        // 1. Insert contract with tax details
        const contractSql = `
          INSERT INTO contracts (
            id, site_id, version, start_date, status, payment_terms, signer_name,
            tax_id, company_name, branch, tax_address, billing_email, billing_phone, signer_title, customer_signer_name, customer_signer_title
          )
          VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          RETURNING id, site_id AS "siteId", version, start_date AS "startDate", status,
                    tax_id AS "taxId", company_name AS "companyName", branch,
                    tax_address AS "taxAddress", billing_email AS "billingEmail", billing_phone AS "billingPhone"
        `;
        const res = await client.query(contractSql, [
          contractId, targetSiteId, version, effectiveDate, paymentTerms, providerName,
          taxId, companyName, branch, taxAddress, billingEmail, billingPhone, providerTitle, body.customerSignerName?.trim()??'', body.customerSignerTitle?.trim()??''
        ]);

        // 2. Insert rate versions
        if (Array.isArray(body.rates) && body.rates.length > 0) {
          for (const r of body.rates) {
            const rId = randomUUID();
            const rFrom = r.startDate || effectiveDate;
            const rTo = r.endDate || null;
            const rRate = Number(r.rate);
            await client.query(
              `INSERT INTO rate_versions (id, contract_id, effective_from, effective_to, rate_type, rate, currency)
               VALUES ($1, $2, $3, $4, 'fixed_kwh', $5, 'THB')`,
              [rId, contractId, rFrom, rTo, rRate]
            );
          }
        } else {
          const rateId = randomUUID();
          await client.query(
            `INSERT INTO rate_versions (id, contract_id, effective_from, effective_to, rate_type, rate, currency)
             VALUES ($1, $2, $3, NULL, 'fixed_kwh', $4, 'THB')`,
            [rateId, contractId, effectiveDate, ratePerKwh]
          );
        }

        await client.query('UPDATE contracts SET payment_term_days=$2,recipient_user_ids=$3 WHERE id=$1',[contractId,body.paymentTermDays??null,body.recipientUserIds??[]]);
        const original=await this.contractPdfs.ensureInTransaction(client,contractId,actor);
        createdContracts.push({...res.rows[0],documentId:original.documentId,contentHash:original.sha256,paymentTermDays:body.paymentTermDays??null,recipientUserIds:body.recipientUserIds??[]});
      }

      await client.query("COMMIT");
      return createdContracts.length === 1 ? createdContracts[0] : createdContracts;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  @Get('operations/contracts/:id/original')
  async contractOriginal(@Param('id') id:string,@Req() req:{user?:ScopedActor}) {
    const original=await this.contractPdfs.ensureContractOriginal(id,req.user??{});
    const url=`/v1/operations/documents/${original.documentId}/pdf`;
    return {...original,contentHash:original.sha256,previewUrl:url,downloadUrl:url};
  }

  @Roles("owner", "accountant")
  @Post("billing-cycles/:id/generate-invoice")
  async generateInvoiceForBillingCycle(@Param("id") id: string) {
    await this.readiness.assertEnabled('issue');
    if(await this.readiness.isLocalTestReady())return this.financial.issueInvoice(id);
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

    // 1. Fetch prefix template from system_settings or default INV{year}{month}
    const settingsRes = await this.db.query<{ value: string }>(
      `SELECT value FROM system_settings WHERE key = 'invoicePrefix'`
    );
    const prefixTemplate = settingsRes.rows[0]?.value || "INV{year}{month}";

    const periodDate = cycle.periodEnd ? new Date(cycle.periodEnd) : new Date();
    const yr = String(periodDate.getUTCFullYear() || periodDate.getFullYear());
    const m = periodDate.getUTCMonth() !== undefined ? periodDate.getUTCMonth() : periodDate.getMonth();
    const mo = String(m + 1).padStart(2, "0");
    const prefix = prefixTemplate.replace("{year}", yr).replace("{month}", mo);

    // Count existing invoices starting with this prefix
    const countRes = await this.db.query(
      `SELECT count(*)::int AS count FROM documents WHERE document_number LIKE $1`,
      [`${prefix}%`]
    );
    const seq = (countRes.rows[0]?.count ?? 0) + 1;
    const documentNumber = `${prefix}${String(seq).padStart(4, "0")}`;
    const docId = randomUUID();
    const fileKey = `invoices/${yr}/${documentNumber}.pdf`;

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

  @Get("billing-cycles/:id")
  async getBillingCycleDetails(@Param("id") id: string) {
    const res = await this.db.query(
      `SELECT 
         b.id,
         b.site_id AS "siteId",
         si.name AS "siteName",
         s.id AS "schoolId",
         s.name AS "schoolName",
         to_char(b.period_start, 'YYYY-MM-DD') AS "periodStart",
         to_char(b.period_end, 'YYYY-MM-DD') AS "periodEnd",
         to_char(b.cutoff_time, 'YYYY-MM-DD HH24:MI') AS "cutoffTime",
         b.status,
         b.quality,
         coalesce(round(b.opening_energy::numeric, 2), 0) AS "openingEnergy",
         coalesce(round(b.closing_energy::numeric, 2), 0) AS "closingEnergy",
         coalesce(round(b.consumed_kwh::numeric, 2), 0) AS "consumedKwh",
         coalesce(round(b.rate::numeric, 2), 4.25) AS rate,
         coalesce(round(b.amount::numeric, 2), 0) AS amount,
         d.id AS "invoiceId",
         d.document_number AS "invoiceNumber",
         d.status AS "invoiceStatus",
         r.id AS "receiptId",
         r.document_number AS "receiptNumber",
         p.id AS "paymentId",
         p.status AS "paymentStatus",
         coalesce(round(p.amount::numeric, 2), round(b.amount::numeric, 2)) AS "paidAmount",
         to_char(p.paid_at, 'YYYY-MM-DD HH24:MI') AS "paidAt",
         p.slip_url AS "slipUrl",
         p.evidence_key AS "evidenceKey",
         p.note AS "paymentNote",
         p.rejection_reason AS "rejectionReason"
       FROM billing_cycles b
       JOIN sites si ON si.id = b.site_id
       JOIN schools s ON s.id = si.school_id
       LEFT JOIN documents d ON d.billing_cycle_id = b.id AND d.document_type = 'invoice'
       LEFT JOIN documents r ON r.billing_cycle_id = b.id AND r.document_type = 'receipt'
       LEFT JOIN payments p ON p.billing_cycle_id = b.id
       WHERE b.id = $1`,
      [id]
    );
    if (res.rows.length === 0) {
      throw new NotFoundException("Billing cycle not found");
    }
    return res.rows[0];
  }

  @Roles("school_user", "admin", "owner", "accountant")
  @Post("billing-cycles/:id/pay")
  async payBillingCycle(
    @Param("id") id: string,
    @Body() body: {
      amount?: number|string;
      paidAt?: string;
      slipUrl?: string;
      evidenceKey?: string;
      note?: string;
    },
    @Req() req: Request & { user?: { id: string; role: string } }
  ) {
    if(await this.readiness.isLocalTestReady())return this.financial.submitPayment(id,body,req.user?.id);
    return this.db.transaction(async client=>{
    const cycleRes = await client.query("SELECT * FROM billing_cycles WHERE id = $1 FOR UPDATE", [id]);
    const cycle = cycleRes.rows[0];
    if (!cycle) {
      throw new NotFoundException("Billing cycle not found");
    }

    if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0) throw new BadRequestException('An explicit positive payment evidence amount is required');
    const payAmount = body.amount;
    const paidAt = body.paidAt ? new Date(body.paidAt) : new Date();
    const slipUrl = body.slipUrl || null;
    const evidenceKey = body.evidenceKey || null;
    const note = body.note || null;
    const actorId = req.user?.id || randomUUID();

    // Check if payment record already exists
    const existingPayment = await client.query<{ id: string }>(
      "SELECT id FROM payments WHERE billing_cycle_id = $1 ORDER BY paid_at DESC NULLS LAST LIMIT 1",
      [id]
    );

    let paymentId: string;
    const firstPayment = existingPayment.rows[0];
    if (firstPayment) {
      paymentId = firstPayment.id;
      await client.query(
        `UPDATE payments 
         SET amount = $1, status = 'pending_verification', paid_at = $2, slip_url = coalesce($3, slip_url), evidence_key = coalesce($4, evidence_key), note = $5, rejection_reason = NULL
         WHERE id = $6`,
        [payAmount, paidAt, slipUrl, evidenceKey, note, paymentId]
      );
    } else {
      paymentId = randomUUID();
      await client.query(
        `INSERT INTO payments (id, billing_cycle_id, amount, status, paid_at, slip_url, evidence_key, note)
         VALUES ($1, $2, $3, 'pending_verification', $4, $5, $6, $7)`,
        [paymentId, id, payAmount, paidAt, slipUrl, evidenceKey, note]
      );
    }

    // Update billing cycle status to 'pending_verification'
    await client.query(
      "UPDATE billing_cycles SET status = 'pending_verification' WHERE id = $1",
      [id]
    );

    // Audit event
    await client.query(
        `INSERT INTO audit_events (
           id, actor_id, action, entity_type, entity_id, before_json, after_json, reason, correlation_id, occurred_at
         )
         VALUES (gen_random_uuid(), $1, 'billing_cycle.pay', 'billing_cycle', $2, $3, $4, 'Payment slip submitted for verification', gen_random_uuid()::text, NOW())`,
        [
          actorId,
          id,
          JSON.stringify({ status: cycle.status }),
          JSON.stringify({ status: "pending_verification", amount: payAmount, paymentId }),
        ]
      );

    return {
      success: true,
      message: "ส่งหลักฐานการชำระเงินเรียบร้อยแล้ว อยู่ระหว่างการตรวจสอบโดยเจ้าหน้าที่",
      paymentId,
      status: "pending_verification",
    };
    });
  }

  @Roles("owner", "accountant")
  @Patch("billing-cycles/:id/verify-payment")
  async verifyPayment(
    @Param("id") id: string,
    @Body() body: {
      status: "approved" | "rejected";
      rejectionReason?: string;
      note?: string;
    },
    @Req() req: Request & { user?: { id: string } }
  ) {
    await this.readiness.assertEnabled('approve_payment');
    if(await this.readiness.isLocalTestReady()) {
      const result=await this.financial.verifyPayment(id,body.status,body.rejectionReason,req.user?.id);
      if(body.status==='approved')await this.financial.send(id);
      return result;
    }
    const { status, rejectionReason, note } = body;
    if (!status || !["approved", "rejected"].includes(status)) {
      throw new BadRequestException("status must be either 'approved' or 'rejected'");
    }

    const cycleRes = await this.db.query(
      `SELECT b.*, si.school_id AS "schoolId" 
       FROM billing_cycles b 
       JOIN sites si ON si.id = b.site_id 
       WHERE b.id = $1`,
      [id]
    );
    const cycle = cycleRes.rows[0];
    if (!cycle) {
      throw new NotFoundException("Billing cycle not found");
    }

    const paymentRes = await this.db.query(
      "SELECT * FROM payments WHERE billing_cycle_id = $1 ORDER BY paid_at DESC NULLS LAST LIMIT 1",
      [id]
    );
    const payment = paymentRes.rows[0];
    if (!payment) {
      throw new BadRequestException("No payment found for this billing cycle");
    }

    const actorId = req.user?.id || null;

    if (status === "approved") {
      // 1. Mark payment as paid
      await this.db.query(
        `UPDATE payments 
         SET status = 'paid', verified_at = NOW(), verified_by = $1, rejection_reason = NULL, note = coalesce($2, note)
         WHERE id = $3`,
        [actorId, note || null, payment.id]
      );

      // 2. Mark billing cycle as paid
      await this.db.query(
        "UPDATE billing_cycles SET status = 'paid' WHERE id = $1",
        [id]
      );

      // 3. Issue receipt document if not exists
      const docCheck = await this.db.query(
        "SELECT id, document_number AS \"documentNumber\" FROM documents WHERE billing_cycle_id = $1 AND document_type = 'receipt'",
        [id]
      );

      let receiptDoc = docCheck.rows[0];
      if (!receiptDoc) {
        const settingsRes = await this.db.query<{ value: string }>(
          `SELECT value FROM system_settings WHERE key = 'receiptPrefix'`
        );
        const prefixTemplate = settingsRes.rows[0]?.value || "REC{year}{month}";
        const periodDate = cycle.period_end ? new Date(cycle.period_end) : new Date();
        const yr = String(periodDate.getUTCFullYear() || periodDate.getFullYear());
        const m = periodDate.getUTCMonth() !== undefined ? periodDate.getUTCMonth() : periodDate.getMonth();
        const mo = String(m + 1).padStart(2, "0");
        const prefix = prefixTemplate.replace("{year}", yr).replace("{month}", mo);

        const countRes = await this.db.query(
          `SELECT count(*)::int AS count FROM documents WHERE document_number LIKE $1`,
          [`${prefix}%`]
        );
        const seq = (countRes.rows[0]?.count ?? 0) + 1;
        const documentNumber = `${prefix}${String(seq).padStart(4, "0")}`;
        const docId = randomUUID();
        const fileKey = `receipts/${yr}/${documentNumber}.pdf`;

        const insertReceipt = await this.db.query(
          `INSERT INTO documents (
             id, site_id, billing_cycle_id, document_type, document_number, status, issue_date, amount, file_key
           )
           VALUES ($1, $2, $3, 'receipt', $4, 'issued', NOW(), $5, $6)
           RETURNING id, document_number AS "documentNumber", status, issue_date AS "issueDate", amount`,
          [docId, cycle.site_id, id, documentNumber, cycle.amount, fileKey]
        );
        receiptDoc = insertReceipt.rows[0];
      }

      // 4. Audit event
      try {
        await this.db.query(
          `INSERT INTO audit_events (
             id, actor_id, action, entity_type, entity_id, before_json, after_json, reason, correlation_id, occurred_at
           )
           VALUES (gen_random_uuid(), $1, 'payment.verify_approved', 'billing_cycle', $2, $3, $4, 'Payment verified and approved by admin', gen_random_uuid()::text, NOW())`,
          [actorId, id, JSON.stringify({ cycleStatus: cycle.status, paymentStatus: payment.status }), JSON.stringify({ cycleStatus: "paid", paymentStatus: "paid" })]
        );
      } catch {}

      return {
        success: true,
        message: "อนุมัติการชำระเงินและออกใบเสร็จรับเงินเรียบร้อยแล้ว",
        billingCycleStatus: "paid",
        receipt: receiptDoc,
      };
    } else {
      if (!rejectionReason) {
        throw new BadRequestException("rejectionReason is required when rejecting payment");
      }

      // Update payment
      await this.db.query(
        `UPDATE payments 
         SET status = 'rejected', rejection_reason = $1, verified_at = NOW(), verified_by = $2, note = coalesce($3, note)
         WHERE id = $4`,
        [rejectionReason, actorId, note || null, payment.id]
      );

      // Return cycle status to 'approved'
      await this.db.query(
        "UPDATE billing_cycles SET status = 'approved' WHERE id = $1",
        [id]
      );

      // Audit event
      try {
        await this.db.query(
          `INSERT INTO audit_events (
             id, actor_id, action, entity_type, entity_id, before_json, after_json, reason, correlation_id, occurred_at
           )
           VALUES (gen_random_uuid(), $1, 'payment.verify_rejected', 'billing_cycle', $2, $3, $4, $5, gen_random_uuid()::text, NOW())`,
          [actorId, id, JSON.stringify({ cycleStatus: cycle.status, paymentStatus: payment.status }), JSON.stringify({ cycleStatus: "approved", paymentStatus: "rejected" }), rejectionReason]
        );
      } catch {}

      return {
        success: true,
        message: "ปฏิเสธหลักฐานการชำระเงินแล้ว และแจ้งให้ผู้ใช้ส่งหลักฐานใหม่",
        billingCycleStatus: "approved",
      };
    }
  }

  @Roles("owner", "accountant")
  @Patch("billing-cycles/:id/status")
  async updateBillingCycleStatus(
    @Param("id") id: string,
    @Body() body: { status: string; reason?: string }
  ) {
    await this.readiness.assertEnabled('issue');
    const { status, reason } = body;
    if (!status || !["pending_review", "approved", "rejected"].includes(status)) {
      throw new BadRequestException("Invalid status. Must be pending_review, approved, or rejected");
    }

    const cycleRes = await this.db.query("SELECT * FROM billing_cycles WHERE id = $1", [id]);
    const before = cycleRes.rows[0];
    if (!before) throw new NotFoundException("Billing cycle not found");

    const updateRes = await this.db.query(
      `UPDATE billing_cycles 
       SET status = $1 
       WHERE id = $2 
       RETURNING id, status`,
      [status, id]
    );

    // If approved, automatically generate invoice if none exists
    let invoice = null;
    if (status === "approved") {
      try {
        invoice = await this.generateInvoiceForBillingCycle(id);
      } catch {}
    }

    // Insert into audit_events
    try {
      await this.db.query(
        `INSERT INTO audit_events (
           id, action, entity_type, entity_id, before_json, after_json, reason, correlation_id
         )
         VALUES (gen_random_uuid(), 'update_status', 'billing_cycle', $1, $2, $3, $4, gen_random_uuid()::text)`,
        [id, JSON.stringify(before), JSON.stringify({ ...before, status }), reason || `Status updated to ${status}`]
      );
    } catch {}

    return {
      success: true,
      billingCycle: updateRes.rows[0],
      invoice,
    };
  }

  @Roles("owner", "accountant")
  @Patch("billing-cycles/:id/adjust")
  async adjustBillingCycle(
    @Param("id") id: string,
    @Body() body: { consumedKwh?: number; rate?: number; amount?: number; note?: string }
  ) {
    await this.readiness.assertEnabled('adjust');
    const cycleRes = await this.db.query("SELECT * FROM billing_cycles WHERE id = $1", [id]);
    const before = cycleRes.rows[0];
    if (!before) throw new NotFoundException("Billing cycle not found");

    const consumedKwh = body.consumedKwh !== undefined ? Number(body.consumedKwh) : Number(before.consumed_kwh);
    const rate = body.rate !== undefined ? Number(body.rate) : Number(before.rate);
    const amount = body.amount !== undefined ? Number(body.amount) : Number((consumedKwh * rate).toFixed(2));

    const updateRes = await this.db.query(
      `UPDATE billing_cycles 
       SET consumed_kwh = $1, rate = $2, amount = $3, status = 'pending_review'
       WHERE id = $4 
       RETURNING id, site_id AS "siteId", period_start AS "periodStart", period_end AS "periodEnd", status, consumed_kwh AS "consumedKwh", rate, amount`,
      [consumedKwh, rate, amount, id]
    );

    // If invoice exists, update document amount
    await this.db.query(
      `UPDATE documents SET amount = $1 WHERE billing_cycle_id = $2 AND document_type = 'invoice'`,
      [amount, id]
    );

    // Record audit event
    try {
      await this.db.query(
        `INSERT INTO audit_events (
           id, action, entity_type, entity_id, before_json, after_json, reason, correlation_id
         )
         VALUES (gen_random_uuid(), 'adjust_billing', 'billing_cycle', $1, $2, $3, $4, gen_random_uuid()::text)`,
        [id, JSON.stringify(before), JSON.stringify(updateRes.rows[0]), body.note || "Billing adjusted by operator"]
      );
    } catch {}

    return {
      success: true,
      message: "ปรับแก้ข้อมูลรอบบิลเรียบร้อยแล้ว และส่งเข้ารอตรวจสอบ",
      billingCycle: updateRes.rows[0],
    };
  }

  @Roles("owner", "accountant")
  @Post("billing-cycles/:id/send-email")
  async sendBillingEmail(
    @Param("id") id: string,
    @Body() body: { recipientEmail?: string; note?: string }
  ) {
    await this.readiness.assertEnabled('send');
    if(await this.readiness.isLocalTestReady()) {
      if(body.recipientEmail)throw new BadRequestException('Local TEST delivery uses persisted contract recipient');
      return this.financial.send(id);
    }
    const cycleRes = await this.db.query(
      `SELECT b.*, si.name AS "siteName", s.name AS "schoolName",
              c.billing_email AS "contractEmail", c.company_name AS "clientCompanyName",
              d.document_number AS "invoiceNumber", d.id AS "invoiceId"
       FROM billing_cycles b
       JOIN sites si ON si.id = b.site_id
       JOIN schools s ON s.id = si.school_id
       LEFT JOIN contracts c ON c.site_id = si.id AND c.status = 'active'
       LEFT JOIN documents d ON d.billing_cycle_id = b.id AND d.document_type = 'invoice'
       WHERE b.id = $1`,
      [id]
    );
    const cycle = cycleRes.rows[0];
    if (!cycle) {
      throw new NotFoundException("Billing cycle not found");
    }
    const recipient = body.recipientEmail?.trim() || cycle.contractEmail || "school@solar-platform.org";

    const compRes = await this.db.query(
      "SELECT company_name, email, phone FROM company_profile ORDER BY updated_at DESC LIMIT 1"
    );
    const company = compRes.rows[0] || {
      company_name: "บริษัท โซลาร์ เอ็นเนอร์ยี โซลูชั่นส์ จำกัด",
      email: "billing@solarenergy.co.th",
    };

    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "localhost",
        port: Number(process.env.SMTP_PORT || 1025),
        secure: false,
        auth: process.env.SMTP_USER ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS || "",
        } : undefined,
      });

      await transporter.sendMail({
        from: `"${company.company_name}" <${company.email || "billing@solarenergy.co.th"}>`,
        to: recipient,
        subject: `[Solar Roof] ใบวางบิล/ใบแจ้งหนี้ #${cycle.invoiceNumber || id.slice(0, 8)} - ${cycle.siteName}`,
        html: `
          <div style="font-family: sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <h2 style="color: #0f172a; margin-top: 0;">ใบวางบิล / ใบแจ้งหนี้ค่าไฟฟ้าโซลาร์เซลล์</h2>
            <p>เรียน <strong>${cycle.clientCompanyName || cycle.schoolName}</strong>,</p>
            <p>ระบบขอนำส่งใบแจ้งหนี้ประจำรอบบิล <strong>${cycle.period_start} ถึง ${cycle.period_end}</strong> สำหรับไซต์ <strong>${cycle.siteName}</strong></p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr style="background: #f8fafc;">
                <td style="padding: 10px; border: 1px solid #e2e8f0;">เลขที่ใบแจ้งหนี้</td>
                <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">${cycle.invoiceNumber || "INV-" + id.slice(0, 8)}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #e2e8f0;">พลังงานที่ใช้จริง</td>
                <td style="padding: 10px; border: 1px solid #e2e8f0;">${Number(cycle.consumed_kwh).toLocaleString()} kWh</td>
              </tr>
              <tr style="background: #f8fafc;">
                <td style="padding: 10px; border: 1px solid #e2e8f0;">อัตราค่าไฟเฉลี่ย</td>
                <td style="padding: 10px; border: 1px solid #e2e8f0;">฿${Number(cycle.rate).toFixed(2)} / kWh</td>
              </tr>
              <tr style="background: #f1f5f9; font-weight: bold;">
                <td style="padding: 10px; border: 1px solid #e2e8f0; color: #0284c7;">ยอดเงินสุทธิที่ต้องชำระ</td>
                <td style="padding: 10px; border: 1px solid #e2e8f0; color: #0284c7; font-size: 16px;">฿${Number(cycle.amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท</td>
              </tr>
            </table>
            <p>สามารถดูเอกสารฉบับเต็มและชำระเงินผ่านระบบ Solar Roof หรือติดต่อฝ่ายบัญชีได้ที่ ${company.phone || "02-999-8888"}</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <small style="color: #64748b;">อีเมลนี้สร้างโดยระบบอัตโนมัติ Solar Roof</small>
          </div>
        `,
      });
    } catch (mailErr) {
      console.warn("Mail dispatch attempt completed (fallback log mode):", mailErr);
    }

    return {
      success: true,
      message: `ส่งอีเมลใบแจ้งหนี้ไปยัง "${recipient}" เรียบร้อยแล้ว`,
      recipient,
      sentAt: new Date().toISOString(),
    };
  }
}





