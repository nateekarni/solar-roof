import { BadRequestException } from '@nestjs/common';
import type { IssuanceApprovalResult, PendingIssuanceStatus } from '@solar/api-contracts';

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
