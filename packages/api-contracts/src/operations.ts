export type BillingStatusView = 'all' | 'pending_issue_approval' | 'awaiting_payment' | 'pending_verification' | 'partially_paid' | 'overdue' | 'paid' | 'unsuccessful';

export interface OperationFacets {
  /** Full scoped result before pagination, excluding only the selected billing tab; all is the total. */
  billingStatusCounts?: Record<BillingStatusView, number>;
}

export interface OperationQuery {
  limit: number;
  cursor?: string;
  search?: string;
  sort: string;
  direction: 'asc' | 'desc';
  from?: string;
  to?: string;
  status?: string;
  siteId?: string;
  collectionStatus?: 'paid'|'pending_review'|'overdue'|'awaiting_payment'|undefined;
  billingStatusView?: BillingStatusView;
  severity?: string;
  type?: string;
  role?: string;
  entityType?: string;
  channel?: string;
  category?: string;
  format?: string;
}

export interface OperationPage<T> {
  columns: string[];
  rows: T[];
  idKey: string;
  page: { limit: number; nextCursor: string | null; hasMore: boolean };
  facets?: OperationFacets;
}

/** id/siteId/gatewayId/deviceId are internal UUID references for navigation and relationships.
 * externalSiteId/externalGatewayId/externalDeviceId are registered codes; null means unregistered. */
export interface OperationRow { id: string; externalSiteId?: string | null; externalGatewayId?: string | null; externalDeviceId?: string | null; [key: string]: unknown; }
import type { PaymentTransferRow } from './payments.js';
/** Ready draft; no official number, immutable document, or delivery yet. */
export type PendingIssuanceStatus = 'pending_issue_approval';

export interface IssuanceLabel {
  period: string;
  customer: string;
  site: string;
}

/** Internal routing references are accepted only in the request. */
export interface IssuanceApprovalRequest {
  billingCycleIds: string[];
  reviewTokens?: Record<string, string>;
  password?: string;
}

export interface ApproveIssuanceRequest {
  reviewToken?: string;
  password?: string;
}

/** Display-safe result; deliberately independent of OperationRow and its IDs. */
export interface IssuanceApprovalResult {
  label: IssuanceLabel;
  status: 'issued' | 'already_issued' | 'failed';
  documentNumber?: string;
  message: string;
}

export interface IssuanceApprovalBatch {
  results: IssuanceApprovalResult[];
}

export interface BillingRow extends OperationRow {
 /** Customer detail only: every issued receipt, including earlier installments. IDs use the existing scoped document endpoint. */
 receipts?: Array<{id:string;documentNumber:string;issueDate:string|null}>;
 /** Proposed correction; original cycle amounts and issued document stay authoritative until approval. */
 pendingReplacement?: BillingReplacementProposal | null;
 payments?: PaymentTransferRow[];
 cashPayments?: CashPaymentEntry[];
 /** Persisted calculation tax, shown before issuance without recalculating in the browser. */
 simulatedTax?: string | null;
 /** Persisted subtotal and server-calculated settlement display values; money stays decimal text. */
 subtotal?: string | null;
 approvedAmount?: string;
 outstandingAmount?: string;
 pendingEvidenceCount?: number;
 rejectedEvidenceCount?: number;
 siteId: string; period: string; status: string;
 billingStatusView: Exclude<BillingStatusView, 'all'>;
 invoiceId: string | null; receiptId: string | null;
 invoiceNumber: string | null; receiptNumber: string | null;
}
export interface CashPaymentEntry {
 id:string;
 amount:string;
 customerName:string;
 siteName:string;
 billingCycleId:string;
 receiptId:string|null;
 receiptNumber:string|null;
 recordedBy:string;
 receivedAt:string;
 recordedAt:string;
 note:string|null;
}
export interface BillingReplacementProposal {
 rate:string;subtotal:string;tax:string;amount:string;dueDate:string|null;
}
/** Display-safe review facts. reviewToken is opaque request metadata, never rendered. */
export interface IssuancePreview {
 period:string;customerName:string;siteName:string;rate:string;subtotal:string;tax:string;amount:string;dueDate:string;
 replacement:boolean;recipients:Array<{name:string;email:string}>;
 approver:{displayName:string;position:string;hasSignature:boolean};reviewToken:string;
}
export type IssuancePreviewResponse = IssuancePreview | {failure: IssuanceApprovalResult};
export interface OperationAction { id: string; label: string; enabled: boolean; reason?: string; }
export interface PersistedDocumentRow extends OperationRow {
 siteId: string; billingCycleId: string | null; documentNumber: string;
 documentType: string; issueDate: string | null; amount: string; status: string;
 fileKey: string | null; previewUnavailableReason: string;
}
