import {SiteBillingService} from './site-billing.service.js';
import type { PaymentSubmission } from '@solar/api-contracts';
import { reviewedPaymentMetadata } from './payment-metadata.js';
import {allocateDocumentNumber} from '../documents/document-number.js';
import { ContractPdfService, type ScopedActor } from '../documents/contract-pdf.service.js';
import { readOrganizationDefaults, contractIdentity } from "./organization-defaults.js";
import { customerScope } from "../../common/auth/route-policy.js";
import {hasPermission,siteScope,type AuthorizationPrincipal} from '../../common/auth/authorization.js';
import {normalizeTestRateSchedule,validFinancialDate} from './local-financial-policy.js';
import {
  BadRequestException, ConflictException,
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

import { FinancialReadinessService } from "../financial-readiness/financial-readiness.service.js";
import { FinancialApplicationService } from './financial-application.service.js';

@Controller("v1")
export class BillingController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService, @Inject(FinancialReadinessService) private readonly readiness: FinancialReadinessService, @Inject(FinancialApplicationService) private readonly financial: FinancialApplicationService, @Inject(ContractPdfService) private readonly contractPdfs: ContractPdfService, @Inject(SiteBillingService) private readonly siteBilling?:SiteBillingService) {}

  @Roles("owner", "admin", "accountant")
  @Post("billing-cycles")
  async createBillingCycle(@Body() body: {
    siteId?: string;
    periodStart?: string;
    periodEnd?: string;
  }, @Req() req?: {user?:ScopedActor}) {
    if(!body.siteId||!body.periodStart||!body.periodEnd)throw new BadRequestException('siteId, periodStart, periodEnd required');
    return (await this.financial.calculate(body.siteId,body.periodStart,body.periodEnd,req?.user?.id)).cycles[0];
  }

  @Get("contracts")
  async listContracts() {
    const res = await this.db.query(`
      SELECT 
        c.id,
        c.site_id AS "siteId",
        si.name AS "siteName",
        s.name AS "customerName",
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
      JOIN customers s ON s.id = si.customer_id
      ORDER BY c.start_date DESC
    `);
    return res.rows;
  }

  @Roles("owner", "admin")
  @Get("operations/contracts/organization-defaults")
  async contractOrganizationDefaults(@Query("siteId") siteId:string,@Req() req:{user?:AuthorizationPrincipal}){
    if(!hasPermission(req.user,'business.billing.view'))throw new ForbiddenException("This action is not permitted for your permissions");
    if(!siteId)throw new BadRequestException("siteId is required");
    const defaults=await readOrganizationDefaults(this.db,siteId);
    const scope=siteScope(req.user,'business');
    if(scope!==null&&!scope.includes(siteId))throw new ForbiddenException("Resource outside assigned site");
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
    if(!hasPermission(req?.user,'business.billing.edit'))throw new ForbiddenException('Contract author required');
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
          const eligible=await client.query(`SELECT u.id FROM users u JOIN sites s ON s.customer_id=u.customer_id JOIN customers sc ON sc.id=s.customer_id WHERE s.id=$1 AND u.id=ANY($2::uuid[]) AND u.role='customer_user' AND u.status='active' AND sc.status='active' AND u.email_verified_at IS NOT NULL AND u.verified_email=u.email`,[targetSiteId,recipients]);
          if(eligible.rows.length!==recipients.length)throw new BadRequestException('Recipients must be active verified organization users for this site');
          if(body.paymentTermDays===undefined)throw new BadRequestException('Explicit paymentTermDays required');
        }

        // 1. Insert contract with tax details
        const contractSql = `
          INSERT INTO contracts (
            id, site_id, version, start_date, status, payment_terms, signer_name,
            tax_id, company_name, branch, tax_address, billing_email, billing_phone, signer_title, customer_signer_name, customer_signer_title, payment_term_days, recipient_user_ids
          )
          VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          RETURNING id, site_id AS "siteId", version, start_date AS "startDate", status,
                    tax_id AS "taxId", company_name AS "companyName", branch,
                    tax_address AS "taxAddress", billing_email AS "billingEmail", billing_phone AS "billingPhone"
        `;
        const res = await client.query(contractSql, [
          contractId, targetSiteId, version, effectiveDate, paymentTerms, providerName,
          taxId, companyName, branch, taxAddress, billingEmail, billingPhone, providerTitle, body.customerSignerName?.trim()??'', body.customerSignerTitle?.trim()??'', body.paymentTermDays??null, body.recipientUserIds??[]
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

        const original=await this.contractPdfs.ensureInTransaction(client,contractId,actor);
        createdContracts.push({...res.rows[0],documentId:original.documentId,contractNumber:original.documentNumber,documentNumber:original.documentNumber,contentHash:original.sha256,paymentTermDays:body.paymentTermDays??null,recipientUserIds:body.recipientUserIds??[]});
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

  @Roles('owner','admin')
  @Post('contracts/:id/send-email')
  async sendContractEmail(@Param('id') id:string,@Body() body:Record<string,unknown>,@Req() req:{user?:ScopedActor}) {
    if(Object.keys(body??{}).length)throw new BadRequestException('Contract delivery uses frozen recipients; no address override is permitted');
    return this.financial.sendContract(id,req.user??{});
  }

  @Get('operations/contracts/:id/original')
  async contractOriginal(@Param('id') id:string,@Req() req:{user?:ScopedActor}) {
    const original=await this.contractPdfs.ensureContractOriginal(id,req.user??{});
    const url=`/v1/operations/documents/${original.documentId}/pdf`;
    return {...original,contentHash:original.sha256,previewUrl:url,downloadUrl:url};
  }

  @Roles("owner", "accountant")
  @Post("billing-cycles/:id/generate-invoice")
  async generateInvoiceForBillingCycle(@Param("id") id: string, @Req() req?: {user?:ScopedActor}) {
    return this.financial.issueInvoice(id,req?.user?.id);
  }

  @Get("billing-cycles/:id")
  async getBillingCycleDetails(@Param("id") id: string) {
    const res = await this.db.query(
      `SELECT 
         b.id,
         b.site_id AS "siteId",
         si.name AS "siteName",
         s.id AS "customerId",
         s.name AS "customerName",
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
       JOIN customers s ON s.id = si.customer_id
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

  @Roles("customer_user", "admin", "owner", "accountant")
  @Post("billing-cycles/:id/pay")
  async payBillingCycle(
    @Param("id") id: string,
    @Body() body: PaymentSubmission,
    @Req() req: Request & { user?: { id: string; role: string } }
  ) {
    return this.financial.submitPayment(id,body,req.user?.id);
  }

  @Roles("owner", "accountant")
  @Patch("billing-cycles/:id/verify-payment")
  async verifyPayment(
    @Param("id") id: string,
    @Body() body: {
      status: "approved" | "rejected";
      rejectionReason?: string;
      paymentId?: string;
      verifiedAmount?: string | number;
      verifiedTransferAt?: string;
      transferReference?: string;
      payerName?:string|null;
      paymentMethod?:'bank_transfer'|'promptpay'|null;
      originBank?:string|null;
      originAccount?:string|null;
      note?: string;
    },
    @Req() req: Request & { user?: { id: string } }
  ) {
    const result=await this.financial.verifyPayment(id,body.status,body.rejectionReason,req.user?.id,{...body,paymentId:body.paymentId??''});
    if(result.billingCycleStatus==='paid')await this.financial.send(id,req.user?.id);
    return result;
  }

  @Roles("owner", "accountant")
  @Patch("billing-cycles/:id/status")
  async updateBillingCycleStatus(
    @Param("id") id: string,
    @Body() body: { status: string; reason?: string },
    @Req() req?: {user?:ScopedActor}
  ) {
    if(!['pending_review','approved','rejected'].includes(body.status))throw new BadRequestException('Invalid billing cycle status');
    if(body.status==='approved')return {success:true,invoice:await this.financial.issueInvoice(id,req?.user?.id)};
    return this.db.transaction(async client=>{
      await this.readiness.assertEnabled('issue',{billingCycleId:id},client);
      const before=(await client.query('SELECT * FROM billing_cycles WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!before)throw new NotFoundException('Billing cycle not found');
      if(['paid','pending_verification'].includes(before.status))throw new ConflictException('Settled or transfer review cycle cannot change status');
      const billingCycle=(await client.query('UPDATE billing_cycles SET status=$2 WHERE id=$1 RETURNING id,status',[id,body.status])).rows[0];
      await client.query(`INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,before_json,after_json,reason,correlation_id) VALUES($1,$2,'finance.status','billing_cycle',$3,$4,$5,$6,$7)`,[randomUUID(),req?.user?.id??null,id,JSON.stringify(before),JSON.stringify(billingCycle),body.reason?.trim()||'Status updated',randomUUID()]);
      return {success:true,billingCycle};
    });
  }

  @Roles('owner')
  @Patch('billing-cycles/:id/adjust')
  async adjustBillingCycle(@Param('id') id:string,@Body() body:{rate?:number;consumedKwh?:number;amount?:number;note?:string;replaceFuture?:boolean},@Req() req:{user?:ScopedActor}) {
    await this.readiness.assertEnabled('adjust',{billingCycleId:id});if(body.rate===undefined)throw new BadRequestException('Explicit replacement rate required');
    if(!this.siteBilling)throw new ConflictException('Site billing service unavailable');
    return this.siteBilling.reprice(id,{rate:body.rate,reason:body.note?.trim()||'Owner bill rate correction',...(body.replaceFuture===undefined?{}:{replaceFuture:body.replaceFuture})},req.user??{});
  }

  @Roles("owner", "accountant")
  @Post("billing-cycles/:id/send-email")
  async sendBillingEmail(
    @Param("id") id: string,
    @Body() body: { recipientEmail?: string; note?: string },
    @Req() req?: {user?:ScopedActor}
  ) {
    if(body.recipientEmail)throw new BadRequestException('Delivery uses frozen verified recipients; address overrides are unavailable');
    return this.financial.send(id,req?.user?.id);
  }
}
