export interface OperationQuery {
  limit: number;
  cursor?: string;
  search?: string;
  sort: string;
  direction: 'asc' | 'desc';
  from?: string;
  to?: string;
}

export interface OperationPage<T> {
  columns: string[];
  rows: T[];
  idKey: string;
  page: { limit: number; nextCursor: string | null; hasMore: boolean };
}

/** Runtime operation rows share identity; billing artifacts remain nullable. */
export interface OperationRow { id: string; [key: string]: unknown; }
import type { PaymentTransferRow } from './payments.js';
export interface BillingRow extends OperationRow {
 payments?: PaymentTransferRow[];
 siteId: string; period: string; status: string;
 invoiceId: string | null; receiptId: string | null;
 invoiceNumber: string | null; receiptNumber: string | null;
}
export interface OperationAction { id: string; label: string; enabled: boolean; reason?: string; }
export interface PersistedDocumentRow extends OperationRow {
 siteId: string; billingCycleId: string | null; documentNumber: string;
 documentType: string; issueDate: string | null; amount: string; status: string;
 fileKey: string | null; previewUnavailableReason: string;
}
