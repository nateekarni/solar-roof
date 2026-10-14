import { BadRequestException } from '@nestjs/common';
import type { IssuanceApprovalResult, IssuanceLabel, PendingIssuanceStatus } from '@solar/api-contracts';
import { siteScope } from '../../common/auth/authorization.js';
import type { ScopePrincipal } from '../../common/auth/route-policy.js';
import type { DatabaseService } from '../../database/database.service.js';
import type { FinancialApplicationService } from './financial-application.service.js';

export type { IssuanceLabel, IssuanceApprovalResult, IssuanceApprovalRequest, IssuanceApprovalBatch } from '@solar/api-contracts';

export const PENDING_ISSUANCE_STATUS: PendingIssuanceStatus = 'pending_issue_approval';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateIssuanceBatch(input: unknown): string[] {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => key !== 'billingCycleIds')) {
    throw new BadRequestException('ข้อมูลอนุมัติไม่ถูกต้อง');
  }
  const raw = (input as { billingCycleIds?: unknown }).billingCycleIds;
  if (Array.isArray(raw) && raw.length === 0) {
    throw new BadRequestException('เลือกใบวางบิลอย่างน้อย 1 รายการ');
  }
  if (!Array.isArray(raw) || raw.length > 100 || Array.from(raw).some(value => typeof value !== 'string' || !UUID.test(value))) {
    throw new BadRequestException('เลือกใบวางบิล 1 ถึง 100 รายการ');
  }
  const seen = new Set<string>();
  return (raw as string[]).filter(id => {
    const key = id.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Copy only display fields, including the nested label, from an authorized result. */
export function displayResult(row: IssuanceApprovalResult): IssuanceApprovalResult {
  return {
    label: { period: row.label.period, customer: row.label.customer, site: row.label.site },
    status: row.status,
    ...(row.documentNumber === undefined ? {} : { documentNumber: row.documentNumber }),
    message: row.message,
  };
}

/** Each call delegates to the single approval transaction; never wrap a batch. */
export async function approveIssuanceResult(
  db: Pick<DatabaseService, 'query'>,
  financial: Pick<FinancialApplicationService, 'approveInvoice'>,
  id: string,
  actor: ScopePrincipal & { id: string },
): Promise<IssuanceApprovalResult> {
  let label: IssuanceLabel = { period: '—', customer: 'รายการที่ไม่สามารถเข้าถึงได้', site: '—' };
  try {
    const row = (await db.query<IssuanceLabel>(`
      SELECT to_char(b.period_end,'YYYY-MM') AS period,c.name AS customer,s.name AS site
      FROM billing_cycles b JOIN sites s ON s.id=b.site_id JOIN customers c ON c.id=s.customer_id
      WHERE b.id=$1 AND ($2::uuid[] IS NULL OR s.id=ANY($2::uuid[]))
    `, [id, siteScope(actor, 'business')])).rows[0];
    if (row) {
      label = { period: row.period, customer: row.customer, site: row.site };
      const approval = await financial.approveInvoice(id, actor.id);
      return displayResult({
        label,
        status: approval.created ? 'issued' : 'already_issued',
        documentNumber: approval.document.documentNumber,
        message: approval.created ? 'ออกใบวางบิลแล้ว' : 'ออกใบวางบิลแล้วก่อนหน้านี้',
      });
    }
  } catch {
    // Expected failures and infrastructure errors must never expose internals.
  }
  return displayResult({ label, status: 'failed', message: 'ไม่สามารถออกเอกสารได้' });
}
