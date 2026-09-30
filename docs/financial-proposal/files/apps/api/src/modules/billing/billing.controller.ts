import {
  BadRequestException,
  ConflictException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Query,
} from "@nestjs/common";
import { type Request } from "express";
import { randomUUID } from "node:crypto";
import { createMeasuredCycle, inFinancialTransaction, issueCycleDocument, auditFinancial, requestEvidenceCorrections } from "./financial-persistence.js";
import { validateRateSchedule, validDate, exclusiveEnd, requirePaymentTerm, requireFullSettlement, requireSeparateApprover, calculateMeterCharge } from "./financial-invariants.js";
import { schoolScope, type ScopePrincipal } from "../../common/auth/resource-scope.js";
import { queueDocumentDelivery } from "./financial-delivery.js";
import { DatabaseService } from "../../database/database.service.js";
import { Roles } from "../../common/roles.decorator.js";

@Controller("v1")
export class BillingController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Roles("owner", "admin", "accountant")
  @Post("billing-cycles")
  async createBillingCycle(@Body() body: {
    siteId?: string;
    periodStart?: string;
    periodEnd?: string;
  }, @Req() req: Request & { user?: { id: string } }) {
    const siteId = body.siteId;
    const periodStart = body.periodStart;
    const periodEnd = body.periodEnd;

    if (!siteId || !periodStart || !periodEnd) {
      throw new BadRequestException("siteId, periodStart, and periodEnd are required");
    }

    return createMeasuredCycle(this.db, siteId, periodStart, periodEnd, req.user?.id || null);
  }

  @Get("contracts")
  async listContracts(@Req() req: Request & { user?: ScopePrincipal }) {
    const scope = schoolScope(req.user);
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
        c.payment_term_days AS "paymentTermDays",
        c.recipient_user_ids AS "recipientUserIds",
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
                'endDate', rv.effective_to - 1,
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
      WHERE ($1::uuid[] IS NULL OR s.id=ANY($1::uuid[]))
      ORDER BY c.start_date DESC
    `, [scope]);
    return res.rows;
  }

  @Roles("owner", "admin", "accountant")
  @Post("contracts")
  async createContract(@Body() body: {
    siteId?: string;
    siteIds?: string[];
    effectiveDate?: string;
    endDate?: string | null;
    ratePerKwh?: number;
    paymentTerms?: string;
    paymentTermDays?: number;
    recipientUserIds?: string[];
    signerName?: string;
    taxId?: string;
    companyName?: string;
    branch?: string;
    taxAddress?: string;
    billingEmail?: string;
    billingPhone?: string;
    rates?: Array<{ startDate: string; endDate?: string | null; rate: number }>;
  }, @Req() req: Request & { user?: { id: string } }) {
    const rawSiteIds = body.siteIds && body.siteIds.length > 0 ? body.siteIds : body.siteId ? [body.siteId] : [];
    const siteIds = Array.from(new Set(rawSiteIds.filter(Boolean)));
    const effectiveDate = body.effectiveDate || new Date().toISOString().slice(0, 10);
    const contractEnd=body.endDate||null;
    if(contractEnd&&(!validDate(contractEnd)||contractEnd<effectiveDate))throw new BadRequestException('Contract endDate must be on or after its start');
    const ratePerKwh = Number(body.ratePerKwh);
    let paymentTermDays:number;
    try {paymentTermDays=requirePaymentTerm(body.paymentTermDays);} catch(error){throw new BadRequestException((error as Error).message);}
    const paymentTerms = `${paymentTermDays} calendar days from issuance`;
    const recipientUserIds=Array.from(new Set(body.recipientUserIds||[]));
    if(!recipientUserIds.length||recipientUserIds.some(id=>! /^[0-9a-f-]{36}$/i.test(id))) throw new BadRequestException('Select eligible school recipients');
    const signerName = body.signerName?.trim();
    if(!signerName) throw new BadRequestException("Signer name is required");
    const taxId = body.taxId?.trim() || null;
    const companyName = body.companyName?.trim() || null;
    const branch = body.branch?.trim() || "สำนักงานใหญ่";
    const taxAddress = body.taxAddress?.trim() || null;
    const billingEmail = body.billingEmail?.trim() || null;
    const billingPhone = body.billingPhone?.trim() || null;

    if (siteIds.length !== 1 || body.siteId !== siteIds[0]) {
      throw new BadRequestException("Exactly one siteId is required and must match siteIds when supplied");
    }

    const schedule = body.rates?.length ? body.rates.map(r => ({...r,rate:Number(r.rate)})) : [{startDate:effectiveDate,rate:ratePerKwh}];
    try { validateRateSchedule(schedule); } catch(error) { throw new BadRequestException((error as Error).message); }
    if(!validDate(effectiveDate)||schedule.some(r=>r.startDate<effectiveDate)) throw new BadRequestException("Invalid contract/rate start dates");
    const client = await this.db.pool.connect();
    try {
      await client.query("BEGIN");

      const createdContracts = [];

      for (const targetSiteId of siteIds.sort()) {
        if(!(await client.query("SELECT id FROM sites WHERE id=$1 FOR UPDATE",[targetSiteId])).rows.length) throw new NotFoundException("Site not found");
        if((await client.query("SELECT id FROM contracts WHERE site_id=$1 AND status='active' AND (end_date IS NULL OR end_date >= $2::date) AND ($3::date IS NULL OR start_date <= $3::date)",[targetSiteId,effectiveDate,contractEnd])).rows.length) throw new ConflictException("Active contract periods overlap");
        const eligible=await client.query(`SELECT u.id FROM users u JOIN sites s ON s.school_id=u.school_id JOIN schools sc ON sc.id=s.school_id WHERE s.id=$1 AND u.id=ANY($2::uuid[]) AND u.role='school_user' AND u.status='active' AND sc.status='active' AND u.email_verified_at IS NOT NULL AND u.verified_email=u.email`,[targetSiteId,recipientUserIds]);
        if(eligible.rows.length!==recipientUserIds.length) throw new BadRequestException('Recipients must be active verified school users belonging to this school');
        const countRes = await client.query("SELECT count(*)::int AS count FROM contracts WHERE site_id = $1", [targetSiteId]);
        const version = (countRes.rows[0]?.count ?? 0) + 1;
        const contractId = randomUUID();

        // 1. Insert contract with tax details
        const contractSql = `
          INSERT INTO contracts (
            id, site_id, version, start_date, status, payment_terms, signer_name,
            tax_id, company_name, branch, tax_address, billing_email, billing_phone, payment_term_days, recipient_user_ids, end_date
          )
          VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          RETURNING id, site_id AS "siteId", version, start_date AS "startDate", end_date AS "endDate", payment_term_days AS "paymentTermDays", recipient_user_ids AS "recipientUserIds", status,
                    tax_id AS "taxId", company_name AS "companyName", branch,
                    tax_address AS "taxAddress", billing_email AS "billingEmail", billing_phone AS "billingPhone"
        `;
        const res = await client.query(contractSql, [
          contractId, targetSiteId, version, effectiveDate, paymentTerms, signerName,
          taxId, companyName, branch, taxAddress, billingEmail, billingPhone, paymentTermDays, recipientUserIds, contractEnd
        ]);

        // 2. Insert rate versions
        if (Array.isArray(body.rates) && body.rates.length > 0) {
          for (const r of body.rates) {
            const rId = randomUUID();
            const rFrom = r.startDate || effectiveDate;
            const rTo = r.endDate ? exclusiveEnd(r.endDate) : null;
            const rRate = Number(r.rate ?? ratePerKwh);
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

        await auditFinancial(client,contractId,'contract.created',req.user?.id||null,null,{siteId:targetSiteId,version,schedule},'contract');
        createdContracts.push(res.rows[0]);
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

  @Roles('owner','accountant')
  @Patch('contracts/:id/end')
  async endContract(@Param('id') id:string,@Body() body:{endDate:string;reason:string},@Req() req:Request & {user?:{id:string}}){
    if(!validDate(body.endDate)||!body.reason?.trim()||!req.user?.id)throw new BadRequestException('Inclusive endDate, reason and financial actor required');
    return inFinancialTransaction(this.db,async client=>{
      // Lock the site first, matching contract creation and cycle measurement lock order.
      const site=(await client.query('SELECT s.id FROM sites s JOIN contracts c ON c.site_id=s.id WHERE c.id=$1 FOR UPDATE OF s',[id])).rows[0];
      if(!site)throw new NotFoundException('Contract not found');
      const contract=(await client.query("SELECT *,to_char(start_date,'YYYY-MM-DD') AS starts,to_char(end_date,'YYYY-MM-DD') AS ends FROM contracts WHERE id=$1 FOR UPDATE",[id])).rows[0];
      const today=(await client.query("SELECT to_char(now() AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') AS day")).rows[0].day;
      if(body.endDate<today||body.endDate<contract.starts)throw new ConflictException('Contract termination must be today or later and not precede its start');
      if(contract.ends && body.endDate>contract.ends)throw new ConflictException('Termination cannot extend a contract');
      const issued=(await client.query(`SELECT b.id FROM billing_cycles b WHERE b.site_id=$1 AND b.period_end>$2::date AND (b.contract_id=$3 OR (b.contract_id IS NULL AND b.period_end>=$4::date)) AND EXISTS(SELECT 1 FROM documents d WHERE d.billing_cycle_id=b.id AND d.status IN ('issued','finalized','cancelled'))`,[site.id,body.endDate,id,contract.starts])).rows;
      if(issued.length)throw new ConflictException('Termination cannot shorten any originally issued billing period');
      if((await client.query('SELECT id FROM billing_cycles WHERE contract_id=$1 AND period_end>$2::date',[id,body.endDate])).rows.length)throw new ConflictException('Existing draft cycles require reconciliation before shortening this contract');
      const updated=(await client.query('UPDATE contracts SET end_date=$2 WHERE id=$1 RETURNING id,end_date AS "endDate"',[id,body.endDate])).rows[0];
      await auditFinancial(client,id,'contract.ended',req.user!.id,contract,{...updated,reason:body.reason},'contract');
      return updated;
    });
  }

  @Roles("owner", "accountant")
  @Post("billing-cycles/:id/generate-invoice")
  async generateInvoiceForBillingCycle(@Param("id") id: string, @Req() req: Request & { user?: {id:string} }) {
    return inFinancialTransaction(this.db,async client=>{
      const cycle=(await client.query("SELECT b.*,to_char(b.period_start,'YYYY-MM-DD') AS period_start,to_char(b.period_end,'YYYY-MM-DD') AS period_end FROM billing_cycles b WHERE id=$1 FOR UPDATE",[id])).rows[0];
      if(!cycle) throw new NotFoundException("Billing cycle not found");
      if(!['approved','finalized','paid'].includes(cycle.status)) throw new ConflictException("Approve billing before invoice issue");
      const document=await issueCycleDocument(client,cycle,'invoice');
      await auditFinancial(client,id,'invoice.issued',req.user?.id||null,null,{documentId:document.id});
      return {created:true,document};
    });
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
         round(b.rate::numeric, 2) AS rate,
         coalesce(round(b.amount::numeric, 2), 0) AS amount,
         d.id AS "invoiceId",
         d.document_number AS "invoiceNumber",
         d.status AS "invoiceStatus",
         r.id AS "receiptId",
         r.document_number AS "receiptNumber",
         (SELECT coalesce(json_agg(json_build_object('id',px.id,'amount',px.amount,'status',px.status,'paidAt',px.paid_at,'slipUrl',px.slip_url) ORDER BY px.paid_at),'[]'::json) FROM payments px WHERE px.billing_cycle_id=b.id) AS transfers,
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
       LEFT JOIN LATERAL (SELECT * FROM payments pp WHERE pp.billing_cycle_id=b.id ORDER BY pp.paid_at DESC,pp.id LIMIT 1) p ON true
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
      transfers?: Array<{amount:number;paidAt:string;slipUrl:string}>;
      amount?: number;
      paidAt?: string;
      slipUrl?: string;
      evidenceKey?: string;
      note?: string;
    },
    @Req() req: Request & { user?: { id: string; role: string } }
  ) {
    return inFinancialTransaction(this.db,async client=>{
      const cycle=(await client.query("SELECT b.*,to_char(b.period_start,'YYYY-MM-DD') AS period_start,to_char(b.period_end,'YYYY-MM-DD') AS period_end FROM billing_cycles b WHERE id=$1 FOR UPDATE",[id])).rows[0];
      if(!cycle) throw new NotFoundException("Billing cycle not found");
      if(!['approved','finalized','pending_verification'].includes(cycle.status)) throw new ConflictException("Only approved unpaid invoices accept evidence");
      if(!(await client.query("SELECT id FROM documents WHERE billing_cycle_id=$1 AND document_type='invoice' AND status IN ('issued','finalized')",[id])).rows.length) throw new ConflictException("Issue the invoice before payment");
      const transfers=body.transfers||[{amount:Number(body.amount),paidAt:body.paidAt||'',slipUrl:body.slipUrl||''}];
      if(!transfers.length||transfers.length>100)throw new BadRequestException('Supply 1 to 100 transfers');
      const paymentIds:string[]=[];
      for(const transfer of transfers){
       const amount=Number(transfer.amount),paidAt=new Date(transfer.paidAt);
       if(!Number.isFinite(amount)||amount<=0||Math.abs(amount*100-Math.round(amount*100))>0.000001)throw new BadRequestException('Positive transfer amount with at most two decimals required');
       if(!Number.isFinite(paidAt.getTime())||paidAt.getTime()>Date.now())throw new BadRequestException('Actual payment date required');
       if(!/^data:(image\/(png|jpeg)|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(transfer.slipUrl)||transfer.slipUrl.length>14*1024*1024)throw new BadRequestException('PNG, JPEG or PDF transfer evidence required');
       const paymentId=randomUUID();paymentIds.push(paymentId);
       await client.query("INSERT INTO payments(id,billing_cycle_id,amount,status,paid_at,slip_url,note) VALUES($1,$2,$3,'pending_verification',$4,$5,$6)",[paymentId,id,amount,paidAt,transfer.slipUrl,body.note||null]);
      }
      await client.query("UPDATE billing_cycles SET status='pending_verification' WHERE id=$1",[id]);
      await auditFinancial(client,id,'payment.submitted',req.user?.id||null,{status:cycle.status},{paymentIds});
      return {success:true,paymentIds,status:'pending_verification'};
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
    if(!['approved','rejected'].includes(body.status)) throw new BadRequestException("Invalid verification status");
    return inFinancialTransaction(this.db,async client=>{
      const cycle=(await client.query("SELECT b.*,to_char(b.period_start,'YYYY-MM-DD') AS period_start,to_char(b.period_end,'YYYY-MM-DD') AS period_end FROM billing_cycles b WHERE id=$1 FOR UPDATE",[id])).rows[0];
      if(!cycle) throw new NotFoundException("Billing cycle not found");
      if(cycle.status==='paid'&&body.status==='approved') return {success:true,billingCycleStatus:'paid',receipt:await issueCycleDocument(client,cycle,'receipt')};
      if(cycle.status!=='pending_verification') throw new ConflictException("Cycle is not awaiting verification");
      const payments=(await client.query("SELECT * FROM payments WHERE billing_cycle_id=$1 AND status='pending_verification' ORDER BY paid_at DESC FOR UPDATE",[id])).rows;
      if(!payments.length) throw new ConflictException("No pending payment");
      if(body.status==='rejected'&&!body.rejectionReason?.trim()) throw new BadRequestException("Rejection reason is required");
      if(body.status==='approved'){
       if(payments.some(p=>!p.slip_url))throw new ConflictException('Every transfer requires evidence');
       try {requireFullSettlement(payments.map(p=>p.amount),cycle.amount);}catch(error){throw new ConflictException((error as Error).message);}
      }
      const approved=body.status==='approved';
      await client.query("UPDATE payments SET status=$1,verified_at=now(),verified_by=$2,rejection_reason=$3,note=coalesce($4,note) WHERE id=ANY($5::uuid[])",[approved?'paid':'rejected',req.user?.id||null,approved?null:body.rejectionReason,body.note||null,payments.map(p=>p.id)]);
      await client.query("UPDATE billing_cycles SET status=$1 WHERE id=$2",[approved?'paid':'approved',id]);
      const receipt=approved?await issueCycleDocument(client,{...cycle,status:'paid'},'receipt'):null;
      await auditFinancial(client,id,approved?'payment.verify_approved':'payment.verify_rejected',req.user?.id||null,{cycleStatus:cycle.status,paymentIds:payments.map(p=>p.id)},{status:body.status,receipt,reason:body.rejectionReason});
      return {success:true,billingCycleStatus:approved?'paid':'approved',receipt};
    });
  }

  @Roles("owner", "accountant")
  @Patch("billing-cycles/:id/status")
  async updateBillingCycleStatus(
    @Param("id") id: string,
    @Body() body: { status: string; reason?: string },
    @Req() req: Request & {user?:{id:string}}
  ) {
    if(!['pending_review','approved','rejected'].includes(body.status)) throw new BadRequestException("Invalid billing status");
    return inFinancialTransaction(this.db,async client=>{
      const before=(await client.query("SELECT b.*,to_char(b.period_start,'YYYY-MM-DD') AS period_start,to_char(b.period_end,'YYYY-MM-DD') AS period_end FROM billing_cycles b WHERE id=$1 FOR UPDATE",[id])).rows[0];
      if(!before) throw new NotFoundException("Billing cycle not found");
      if(!['pending_review','rejected'].includes(before.status)) throw new ConflictException("Issued or approved billing is immutable");
      if(body.status==='approved'&&(before.quality!=='complete'||!before.meter_snapshot)) throw new ConflictException("Actual complete readings are required");
      const updated=(await client.query("UPDATE billing_cycles SET status=$1 WHERE id=$2 RETURNING *",[body.status,id])).rows[0];
      const invoice=body.status==='approved'?await issueCycleDocument(client,updated,'invoice'):null;
      await auditFinancial(client,id,'billing.status',req.user?.id||null,before,{status:body.status,reason:body.reason});
      return {success:true,billingCycle:updated,invoice};
    });
  }

  @Roles("owner", "accountant")
  @Patch("billing-cycles/:id/adjust")
  async adjustBillingCycle(
    @Param("id") id: string,
    @Body() body: { consumedKwh?: number; rate?: number; amount?: number; note?: string }
  ) {
    throw new ConflictException("Manual financial overrides are disabled. Correct readings/rates and create a reviewed replacement; issued documents are immutable.");
  }

  @Roles("owner", "accountant")
  @Post("billing-cycles/:id/send-email")
  async sendBillingEmail(
    @Param("id") id: string,
    @Body() body: { recipientEmail?: string; note?: string }
  ) {
    return inFinancialTransaction(this.db,async client=>{
      const doc=(await client.query("SELECT id FROM documents WHERE billing_cycle_id=$1 AND document_type='invoice' AND status IN ('issued','finalized')",[id])).rows[0];
      if(!doc)throw new ConflictException('Issued invoice required');
      await queueDocumentDelivery(client,doc.id);
      const delivery=(await client.query("SELECT state FROM financial_delivery_outbox WHERE document_id=$1 AND purpose='issue'",[doc.id])).rows[0];
      if(!delivery || !['pending','retry'].includes(delivery.state))throw new ConflictException(`Delivery is ${delivery?.state ?? 'unavailable'}; it has not been requeued. Review delivery history before further action.`);
      return {queued:true,documentId:doc.id};
    });
  }

  @Roles('owner','admin','accountant')
  @Get('contracts/eligible-recipients')
  async eligibleRecipients(@Query('siteId') siteId:string){
    return (await this.db.query(`SELECT u.id,u.display_name AS "displayName",u.email FROM users u JOIN sites s ON s.school_id=u.school_id JOIN schools sc ON sc.id=s.school_id WHERE s.id=$1 AND u.role='school_user' AND u.status='active' AND sc.status='active' AND u.email_verified_at IS NOT NULL AND u.verified_email=u.email ORDER BY u.display_name`,[siteId])).rows;
  }

  @Roles('admin')
  @Get('sites/:id/billing-meters')
  async siteBillingMeters(@Param('id') id:string){
    return (await this.db.query(`SELECT m.id,m.device_id AS "deviceId",m.semantic_field AS "semanticField",d.name AS "deviceName",d.serial_number AS "serialNumber" FROM billing_meters m JOIN devices d ON d.id=m.device_id WHERE m.site_id=$1 AND m.active=true ORDER BY d.name,m.id`,[id])).rows;
  }

  @Roles('admin','owner','accountant')
  @Get('billing-cycles/:id/evidence-context')
  async evidenceContext(@Param('id') id:string){
    return {corrections:(await this.db.query(`SELECT id,requested_by AS "requestedBy",financial_requested_by AS "financialRequestedBy",status,reason,original_amount AS "originalAmount",proposed_amount AS "proposedAmount",impact_amount AS "impactAmount" FROM financial_corrections WHERE billing_cycle_id=$1 ORDER BY requested_at DESC`,[id])).rows,meters:(await this.db.query(`SELECT m.id,m.device_id AS "deviceId",m.semantic_field AS "semanticField" FROM billing_meters m JOIN billing_cycles b ON b.site_id=m.site_id WHERE b.id=$1 AND m.active=true ORDER BY m.id`,[id])).rows};
  }

  @Roles('admin')
  @Post('billing-meters/:id/evidence-readings')
  async evidenceReading(@Param('id') id:string,@Body() body:{sourceTime:string;value:number;evidence:string;reason:string},@Req() req:Request & {user?:{id:string}}){
    if(!req.user?.id||!body.evidence?.trim()||!body.reason?.trim()||typeof body.value!=='number'||!Number.isFinite(body.value)||body.value<0||!Number.isFinite(Date.parse(body.sourceTime))||Date.parse(body.sourceTime)>Date.now())throw new BadRequestException('Actual reading, timestamp, evidence and reason are required');
    return inFinancialTransaction(this.db,async client=>{
      const reading=(await client.query(`INSERT INTO evidence_readings(id,billing_meter_id,source_time,value,evidence,reason,entered_by,approved_by) VALUES($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`,[randomUUID(),id,body.sourceTime,body.value,body.evidence,body.reason,req.user!.id])).rows[0];
      await auditFinancial(client,reading.id,'evidence_reading.self_approved',req.user!.id,null,reading,'evidence_reading');
      const corrections=await requestEvidenceCorrections(client,reading,req.user!.id);
      return {...reading,corrections};
    });
  }

  @Roles('owner','accountant')
  @Post('billing-cycles/:id/corrections')
  async requestCorrection(@Param('id') id:string,@Body() body:{reason:string;evidenceReadingId:string},@Req() req:Request & {user?:{id:string}}){
    if(!req.user?.id||!body.reason?.trim()||!body.evidenceReadingId)throw new BadRequestException('Reason and approved evidence reading required');
    return inFinancialTransaction(this.db,async client=>{
      const cycle=(await client.query('SELECT * FROM billing_cycles WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!cycle)throw new NotFoundException('Billing cycle not found');
      if(!(await client.query("SELECT id FROM documents WHERE billing_cycle_id=$1 AND status IN ('issued','finalized')",[id])).rows.length)throw new ConflictException('Correction requires an issued original document');
      const evidence=(await client.query(`SELECT e.*,m.site_id FROM evidence_readings e JOIN billing_meters m ON m.id=e.billing_meter_id WHERE e.id=$1 AND e.approved_at IS NOT NULL`,[body.evidenceReadingId])).rows[0];
      if(!evidence||evidence.site_id!==cycle.site_id)throw new BadRequestException('Evidence must belong to the same site');
      let matched=false;
      const segments=(cycle.meter_snapshot||[]).map((segment:any)=>{
       const copy={...segment,opening:{...segment.opening},closing:{...segment.closing}};
       if(segment.meterId===evidence.billing_meter_id)for(const key of ['opening','closing']){
        if(Math.abs(new Date(segment[key].target_time || NaN).getTime()-new Date(evidence.source_time).getTime())<=300000){copy[key]={value:evidence.value,source_time:evidence.source_time,id:evidence.id,provenance:'evidence'};matched=true;}
       }
       return copy;
      });
      if(!matched)throw new BadRequestException('Evidence does not match an original meter boundary');
      const proposedAmount=segments.reduce((sum:number,segment:any)=>sum+calculateMeterCharge(segment.opening.value,segment.closing.value,segment.rate).amount,0);
      const correction=(await client.query(`INSERT INTO financial_corrections(id,billing_cycle_id,evidence_reading_id,requested_by,reason,original_amount,proposed_amount,impact_amount,financial_requested_by,financial_requested_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$4,now()) RETURNING *`,[randomUUID(),id,evidence.id,req.user!.id,body.reason,cycle.amount,proposedAmount,proposedAmount-Number(cycle.amount)])).rows[0];
      await auditFinancial(client,correction.id,'correction.requested',req.user!.id,null,{...correction,segments},'financial_correction');
      return correction;
    });
  }

  @Roles('owner','accountant')
  @Patch('financial-corrections/:id/request')
  async endorseCorrection(@Param('id') id:string,@Req() req:Request & {user?:{id:string}}){
    if(!req.user?.id)throw new BadRequestException('Financial requester required');
    return inFinancialTransaction(this.db,async client=>{
      const correction=(await client.query('SELECT * FROM financial_corrections WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!correction)throw new NotFoundException('Correction not found');
      if(correction.status!=='pending_financial_request')throw new ConflictException('Correction is not awaiting financial endorsement');
      const updated=(await client.query("UPDATE financial_corrections SET financial_requested_by=$2,financial_requested_at=now(),status='pending_approval' WHERE id=$1 RETURNING *",[id,req.user!.id])).rows[0];
      await auditFinancial(client,id,'correction.financial_requested',req.user!.id,correction,updated,'financial_correction');
      return updated;
    });
  }

  @Roles('owner','accountant')
  @Patch('financial-corrections/:id/approve')
  async approveCorrection(@Param('id') id:string,@Req() req:Request & {user?:{id:string}}){
    return inFinancialTransaction(this.db,async client=>{
      const correction=(await client.query('SELECT * FROM financial_corrections WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!correction)throw new NotFoundException('Correction not found');
      if(!correction.financial_requested_by)throw new ConflictException('Financial endorsement is required before a different financial approver can approve');
      try{requireSeparateApprover(correction.financial_requested_by,req.user?.id||'');}catch(error){throw new ConflictException((error as Error).message);}
      if(correction.status!=='pending_approval')throw new ConflictException('Correction already reviewed');
      const updated=(await client.query("UPDATE financial_corrections SET approved_by=$2,approved_at=now(),status='accounting_blocked' WHERE id=$1 RETURNING *",[id,req.user!.id])).rows[0];
      await auditFinancial(client,id,'correction.approved_accounting_blocked',req.user!.id,correction,updated,'financial_correction');
      return {...updated,blocker:'ACCOUNTING_NOT_CONFIRMED: adjustment document rules must be confirmed; original remains unchanged'};
    });
  }
}
