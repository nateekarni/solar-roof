import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { CustomerPaymentInstructions, CustomerPortalBill, CustomerPortalHomeResponse, CustomerPortalRange } from '@solar/api-contracts';
import { customerScope } from '../../common/auth/resource-scope.js';
import { siteScope } from '../../common/auth/authorization.js';
import { DatabaseService } from '../../database/database.service.js';
import { DashboardService, type DashboardPrincipal } from '../dashboard/dashboard.service.js';
import { approvedAmount, billingStatusView, collectionStatus } from '../dashboard/billing-read-model.js';
import { hasOutstandingBalance, selectFocusedBill } from './focused-bill.js';
import { SettingsService } from '../settings/settings.service.js';

export function parseCustomerPortalRange(value: unknown = '7d'): CustomerPortalRange {
  if (value !== '7d' && value !== '30d') throw new BadRequestException('Invalid range; use 7d or 30d');
  return value;
}

type BillRow = Omit<CustomerPortalBill, 'canPay'> & { recentRank: number };

// q uses the same lifecycle aliases as the staff billing read model. The customer
// projection suppresses staff replacement drafts and only includes current invoices.
const billingSql = `WITH scoped AS (
 SELECT b.id,b.site_id AS "siteId",to_char(b.period_end,'YYYY-MM') AS period,
 to_char(b.period_start,'YYYY-MM-DD') AS "periodStart",to_char(b.period_end,'YYYY-MM-DD') AS "periodEnd",
 to_char(b.due_date,'YYYY-MM-DD') AS "dueDate",d.id AS "invoiceId",d.document_number AS "invoiceNumber",
 b.consumed_kwh::text AS "consumedKwh",b.rate::text,
 b.subtotal::text AS subtotal,
 b.simulated_tax::text AS tax,b.amount::text AS "billedAmount",
 (${approvedAmount})::text AS "approvedAmount",greatest(b.amount-${approvedAmount},0)::text AS "outstandingAmount",
 (SELECT count(*)::int FROM payments WHERE billing_cycle_id=b.id AND status='pending_verification') AS "pendingEvidenceCount",
 (SELECT count(*)::int FROM payments WHERE billing_cycle_id=b.id AND status='rejected') AS "rejectedEvidenceCount",
 b.status,${collectionStatus} AS "collectionStatus",NULL::jsonb AS "pendingReplacement"
 FROM billing_cycles b JOIN sites s ON s.id=b.site_id
 JOIN LATERAL (SELECT id,document_number FROM documents WHERE billing_cycle_id=b.id AND document_type='invoice'
 AND is_current AND status IN('issued','finalized') ORDER BY revision DESC,id DESC LIMIT 1) d ON true
 WHERE b.site_id=$1::uuid AND s.customer_id=$3::uuid
 AND b.status NOT IN('draft','cancelled','superseded','pending_issue_approval')
 AND EXISTS(SELECT 1 FROM site_account_assignments access WHERE access.user_id=$2::uuid AND access.site_id=b.site_id AND access.revoked_at IS NULL)
), projected AS (
 SELECT q.id,q."siteId",q.period,q."periodStart",q."periodEnd",q."dueDate",q."invoiceId",q."invoiceNumber",
 ${billingStatusView} AS status,q."consumedKwh",q.rate,q.subtotal,q.tax,q."billedAmount",q."approvedAmount",q."outstandingAmount",
 q."pendingEvidenceCount",q."rejectedEvidenceCount",
 row_number() OVER(ORDER BY q."periodEnd" DESC,q."periodStart" DESC,q.id DESC)::int AS "recentRank"
 FROM scoped q
) SELECT * FROM projected WHERE "recentRank"<=3 OR (status IN('overdue','partially_paid','awaiting_payment','pending_verification') AND "outstandingAmount"::numeric>0)
 ORDER BY "recentRank"`;

function publicBill(row: BillRow): CustomerPortalBill {
  return {
    id: row.id, siteId: row.siteId, period: row.period, periodStart: row.periodStart, periodEnd: row.periodEnd,
    dueDate: row.dueDate, invoiceId: row.invoiceId, invoiceNumber: row.invoiceNumber, status: row.status,
    consumedKwh: row.consumedKwh, rate: row.rate, subtotal: row.subtotal, tax: row.tax,
    billedAmount: row.billedAmount, approvedAmount: row.approvedAmount, outstandingAmount: row.outstandingAmount,
    pendingEvidenceCount: row.pendingEvidenceCount, rejectedEvidenceCount: row.rejectedEvidenceCount,
    canPay: ['overdue','partially_paid','awaiting_payment'].includes(row.status) && row.pendingEvidenceCount === 0 && hasOutstandingBalance(row),
  };
}

@Injectable()
export class CustomerPortalService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService, @Inject(DashboardService) private readonly dashboard: DashboardService, @Inject(SettingsService) private readonly settings: SettingsService) {}

  async paymentInstructions(user: DashboardPrincipal | undefined): Promise<CustomerPaymentInstructions> {
    if (!user?.id || user.role !== 'customer_user') throw new ForbiddenException('Customer portal access denied');
    const bank = (await this.settings.listBankAccounts()).find(account => account.isDefault && account.isConfigured);
    if (!bank) return {available: false};
    return {
      available: true, bankName: bank.bankName, bankCode: bank.bankCode,
      accountName: bank.accountName, accountNumber: bank.accountNumber,
      branchName: bank.branchName, promptpayId: bank.promptpayId,
      ...(bank.qrCodeUrl !== undefined ? {qrCodeUrl: bank.qrCodeUrl} : {}),
    };
  }

  async home(user: DashboardPrincipal | undefined, requestedRange: CustomerPortalRange): Promise<CustomerPortalHomeResponse> {
    if (!user?.id || user.role !== 'customer_user') throw new ForbiddenException('Customer portal access denied');
    const range = parseCustomerPortalRange(requestedRange);
    const empty: CustomerPortalHomeResponse = { range, site: null, focusedBill: null, additionalOpenBillCount: 0, energySeries: [], recentFinancialRecords: [], capabilities: {canPay: false, canViewDocuments: false} };
    const sites = siteScope(user, 'business');
    const customers = customerScope(user);
    if (sites?.length !== 1 || customers?.length !== 1) return empty;
    const params = [sites[0], user.id, customers[0]];
    const assignment = await this.db.query<{id: string; name: string; customerName: string}>(`SELECT s.id,s.name,c.name AS "customerName"
      FROM sites s JOIN customers c ON c.id=s.customer_id WHERE s.id=$1::uuid AND s.customer_id=$3::uuid
      AND EXISTS(SELECT 1 FROM site_account_assignments access WHERE access.user_id=$2::uuid AND access.site_id=s.id AND access.revoked_at IS NULL)`, params);
    const site = assignment.rows[0];
    if (!site) return empty;
    const end = new Date(Date.now() + 7 * 3600000).toISOString().slice(0,10);
    const start = new Date(Date.parse(end) - (range === '7d' ? 6 : 29) * 86400000).toISOString().slice(0,10);
    const [summary, billing] = await Promise.all([
      this.dashboard.getSummary(user, start, end, site.id),
      this.db.query<BillRow>(billingSql, params),
    ]);
    const bills = billing.rows.map(publicBill);
    const focusedBill = selectFocusedBill(bills);
    const recentFinancialRecords = [...billing.rows].sort((a,b)=>a.recentRank-b.recentRank).filter(row=>row.recentRank<=3).slice(0,3).map(publicBill);
    return {
      range, site: {id: site.id, name: site.name, customerName: site.customerName}, focusedBill,
      additionalOpenBillCount: bills.filter(bill=>hasOutstandingBalance(bill) && ['overdue','partially_paid','awaiting_payment','pending_verification'].includes(bill.status)).length - (focusedBill ? 1 : 0),
      energySeries: summary.production.map(point=>({date: point.date, value: point.value, ...(point.quality ? {quality: point.quality} : {})})),
      recentFinancialRecords, capabilities: {canPay: bills.some(bill=>bill.canPay), canViewDocuments: bills.some(bill=>Boolean(bill.invoiceId))},
    };
  }
}
