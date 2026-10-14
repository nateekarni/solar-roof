import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { IssuanceApprovalResult, IssuanceLabel, IssuancePreviewResponse, PendingIssuanceStatus } from '@solar/api-contracts';
import { effectiveAuthorization, hasPermission, siteScope, type DomainGrant } from '../../common/auth/authorization.js';
import type { ScopePrincipal } from '../../common/auth/route-policy.js';
import type { DatabaseService } from '../../database/database.service.js';
import type { FinancialApplicationService } from './financial-application.service.js';
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';

export type { IssuanceLabel, IssuanceApprovalResult, IssuanceApprovalRequest, IssuanceApprovalBatch } from '@solar/api-contracts';

export const PENDING_ISSUANCE_STATUS: PendingIssuanceStatus = 'pending_issue_approval';

// PostgreSQL stored pre-fix manual IDs with arbitrary version/variant bits.
// Validate canonical hex shape here; authorization and existence stay in the
// transaction's scoped lookup. Never rewrite historical financial identities.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateIssuanceBatch(input: unknown): string[] {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['billingCycleIds','reviewTokens'].includes(key))) {
    throw new BadRequestException('ข้อมูลอนุมัติไม่ถูกต้อง');
  }
  const raw = (input as { billingCycleIds?: unknown }).billingCycleIds;
  if (Array.isArray(raw) && raw.length === 0) {
    throw new BadRequestException('เลือกใบวางบิลอย่างน้อย 1 รายการ');
  }
  if (!Array.isArray(raw) || raw.length > 100 || Array.from(raw).some(value => typeof value !== 'string' || !UUID.test(value))) {
    throw new BadRequestException('เลือกใบวางบิล 1 ถึง 100 รายการ');
  }
  const tokens=(input as {reviewTokens?:unknown}).reviewTokens;
  if(tokens!==undefined){
    if(!tokens||typeof tokens!=='object'||Array.isArray(tokens)||Object.keys(tokens).some(id=>!raw.includes(id))||raw.some(id=>!Object.hasOwn(tokens,id)))throw new BadRequestException('ข้อมูลตรวจอนุมัติไม่ถูกต้อง');
    for(const token of Object.values(tokens))validateReviewToken(token);
  }
  const seen = new Set<string>();
  return (raw as string[]).filter(id => {
    const key = id.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function validateReviewToken(value:unknown):string {
 if(typeof value!=='string'||! /^[0-9a-f]{64}$/.test(value))throw new BadRequestException('ข้อมูลตรวจอนุมัติไม่ถูกต้อง');
 return value;
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

/** Coordinates with TeamService's exclusive business mutation gate. */
export async function lockIssuanceActor(client: Pick<PoolClient, 'query'>, actorId: string): Promise<ScopePrincipal & { id: string }> {
  await client.query("SELECT pg_advisory_xact_lock_shared(hashtext('solar.team.permissions'),hashtext('business'))");
  const user = (await client.query('SELECT id,role,status,permission_revision FROM users WHERE id=$1 FOR SHARE', [actorId])).rows[0];
  if (!user || user.status !== 'active') throw new NotFoundException('ไม่สามารถออกเอกสารได้');
  const rows = (await client.query(`SELECT g.domain,g.overrides,g.scope_mode,g.site_ids,COALESCE(p.rules,'{}'::jsonb) AS preset
    FROM employee_domain_grants g LEFT JOIN employee_position_domains p ON p.position_id=g.position_id AND p.domain=g.domain
    WHERE g.user_id=$1 AND g.domain='business'`, [actorId])).rows;
  const grants: DomainGrant[] = rows.map(row => ({ domain: row.domain, preset: row.preset, overrides: row.overrides, scope: { mode: row.scope_mode, siteIds: row.site_ids } }));
  const actor = { id: user.id as string, role: user.role as string, authorization: effectiveAuthorization(user.role, user.permission_revision, grants) };
  if (!hasPermission(actor, 'business.billing.approve')) throw new NotFoundException('ไม่สามารถออกเอกสารได้');
  return actor;
}

export async function authorizedIssuanceLabel(client: Pick<PoolClient, 'query'>, id: string, actor: ScopePrincipal): Promise<IssuanceLabel | undefined> {
  const row = (await client.query<IssuanceLabel>(`
    SELECT to_char(b.period_end,'YYYY-MM') AS period,c.name AS customer,s.name AS site
    FROM billing_cycles b JOIN sites s ON s.id=b.site_id JOIN customers c ON c.id=s.customer_id
    WHERE b.id=$1 AND ($2::uuid[] IS NULL OR s.id=ANY($2::uuid[]))
  `, [id, siteScope(actor, 'business')])).rows[0];
  return row ? { period: row.period, customer: row.customer, site: row.site } : undefined;
}

type FailureCode = 'unavailable' | 'approver_position' | 'draft_state' | 'draft_stale' | 'review_changed' | 'readiness_confirmation' | 'configuration_required' | 'unexpected';
type SafeFailure = { code: FailureCode; message: string };
const GENERIC_FAILURE = 'ไม่สามารถออกเอกสารได้';
const CORRECTIVE_MESSAGES = {
  review_changed: 'ข้อมูลตรวจอนุมัติเปลี่ยนแล้ว กรุณาเปิดตรวจสอบใหม่ก่อนอนุมัติ',
  approver_position: 'กรุณากำหนดตำแหน่งผู้อนุมัติในหน้าพนักงานและสิทธิ์',
  draft_state: 'กรุณาเตรียมใบวางบิลให้พร้อมตรวจอนุมัติก่อนออกเอกสาร',
  draft_stale: 'กรุณาคำนวณใบวางบิลใหม่ตามการตั้งค่าปัจจุบันก่อนอนุมัติ',
  readiness_confirmation: 'กรุณาให้เจ้าของยืนยันความพร้อมด้านบัญชีก่อนอนุมัติออกเอกสาร',
  configuration_required: 'กรุณาตรวจสอบการตั้งค่าการออกเอกสารและความพร้อมด้านบัญชี',
} as const;

/** Whitelist trusted domain types/codes; never use arbitrary error text in output. */
export function classifyIssuanceFailure(error: unknown): SafeFailure {
  let code: keyof typeof CORRECTIVE_MESSAGES | undefined;
  if (error instanceof ConflictException) {
    const response = error.getResponse();
    if (typeof response === 'object' && (response as { code?: unknown }).code === 'DOCUMENT_APPROVER_POSITION_REQUIRED') code = 'approver_position';
    else if(error.message==='Issuance review changed; refresh before approval')code='review_changed';
    else if (error.message === 'ใบวางบิลรายการนี้ยังไม่พร้อมอนุมัติออกเอกสาร') code = 'draft_state';
    else if (['Site billing configuration changed; recalculate before issuance', 'Financial scope differs from saved cycle', 'Verified financial calculation required'].includes(error.message)) code = 'draft_stale';
    else if (['Complete issuer and customer tax identity required', 'Confirmed site tax configuration required', 'Explicit paymentTermDays required', 'Usable configured payment account required', 'Selected verified organization recipients required'].includes(error.message)) code = 'configuration_required';
  } else if (error instanceof ServiceUnavailableException) {
    const response = error.getResponse() as { code?: unknown; missing?: unknown };
    if (response?.code === 'FINANCIAL_NOT_READY' && Array.isArray(response.missing)) {
      if (response.missing.includes('cycle.snapshot')) code = 'draft_stale';
      else if (response.missing.includes('approval.confirmation')) code = 'readiness_confirmation';
      else code = 'configuration_required';
    }
  }
  return code ? { code, message: CORRECTIVE_MESSAGES[code] } : { code: 'unexpected', message: GENERIC_FAILURE };
}

/** Preview failures are display-safe per-item outcomes, with no issuance or audit writes. */
export async function previewIssuanceResult(
  db: Pick<DatabaseService, 'transaction'>,
  financial: Pick<FinancialApplicationService, 'previewInvoice'>,
  id: string,
  actor: ScopePrincipal & {id:string},
): Promise<IssuancePreviewResponse> {
  try { return await financial.previewInvoice(id,actor.id); }
  catch(error) {
    let label: IssuanceLabel = {period:'—',customer:'รายการที่ไม่สามารถเข้าถึงได้',site:'—'};
    let message=GENERIC_FAILURE;
    try {
      const visible=await db.transaction(async client=>authorizedIssuanceLabel(client,id,await lockIssuanceActor(client,actor.id)));
      if(visible){label=visible;message=classifyIssuanceFailure(error).message;}
    } catch { /* Missing, revoked and inaccessible remain indistinguishable. */ }
    return {failure:displayResult({label,status:'failed',message})};
  }
}

/** Each call delegates to the single approval transaction; never wrap a batch. */
export async function approveIssuanceResult(
  db: Pick<DatabaseService, 'transaction'>,
  financial: Pick<FinancialApplicationService, 'approveInvoice'>,
  id: string,
  actor: ScopePrincipal & { id: string },
  batch?: { id: string; itemIndex: number },
  reviewToken?:string,
): Promise<IssuanceApprovalResult> {
  let label: IssuanceLabel = { period: '—', customer: 'รายการที่ไม่สามารถเข้าถึงได้', site: '—' };
  let failure: SafeFailure = { code: 'unavailable', message: GENERIC_FAILURE };
  try {
    const approval = await financial.approveInvoice(id, actor.id,reviewToken);
    return displayResult({
      label: approval.label,
      status: approval.created ? 'issued' : 'already_issued',
      documentNumber: approval.document.documentNumber,
      message: approval.created ? 'ออกใบวางบิลแล้ว' : 'ออกใบวางบิลแล้วก่อนหน้านี้',
    });
  } catch (error) {
    // The item has rolled back. Re-resolve current visibility rather than retaining
    // request labels or labels from an authorization that may have been revoked.
    try {
      const visible = await db.transaction(async client => authorizedIssuanceLabel(client, id, await lockIssuanceActor(client, actor.id)));
      if (visible) { label = visible; failure = classifyIssuanceFailure(error); }
    } catch { /* Permission/database failure stays indistinguishable from missing. */ }
  }
  if (batch) {
    try {
      // Independent transaction: audit failure cannot undo earlier issued items.
      await db.transaction(async client => {
        await client.query(`INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,after_json,reason,correlation_id)
          VALUES($1,$2,'finance.invoice_approval_failed','billing_cycle',$3,$4,$5,$6)`,
        [randomUUID(), actor.id, id, JSON.stringify({ billingCycleId: id, reasonCode: failure.code, batchId: batch.id, itemIndex: batch.itemIndex }), failure.code, batch.id]);
      });
    } catch { /* Audit outages must not expose internals or abort partial success. */ }
  }
  return displayResult({ label, status: 'failed', message: failure.message });
}
