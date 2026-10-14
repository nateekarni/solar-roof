export type BillingStatusView = 'all' | 'pending_issue_approval' | 'awaiting_payment' | 'pending_verification' | 'overdue' | 'paid' | 'unsuccessful';

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
 payments?: PaymentTransferRow[];
 /** Persisted calculation tax, shown before issuance without recalculating in the browser. */
 simulatedTax?: string | null;
 siteId: string; period: string; status: string;
 billingStatusView: Exclude<BillingStatusView, 'all'>;
 invoiceId: string | null; receiptId: string | null;
 invoiceNumber: string | null; receiptNumber: string | null;
}
export interface OperationAction { id: string; label: string; enabled: boolean; reason?: string; }
export interface PersistedDocumentRow extends OperationRow {
 siteId: string; billingCycleId: string | null; documentNumber: string;
 documentType: string; issueDate: string | null; amount: string; status: string;
 fileKey: string | null; previewUnavailableReason: string;
}
