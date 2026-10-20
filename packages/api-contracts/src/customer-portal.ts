import type { BillingStatusView } from './operations.js';

export type CustomerPortalRange = '7d' | '30d';
export type CustomerBillingStatus = Exclude<BillingStatusView, 'all' | 'pending_issue_approval'>;
export interface CustomerPortalBill {
  id: string;
  siteId: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  status: CustomerBillingStatus;
  consumedKwh: string | null;
  rate: string | null;
  subtotal: string | null;
  tax: string | null;
  billedAmount: string;
  approvedAmount: string;
  outstandingAmount: string;
  pendingEvidenceCount: number;
  rejectedEvidenceCount: number;
  canPay: boolean;
}
export interface CustomerPortalHomeResponse {
  range: CustomerPortalRange;
  site: { id: string; name: string; customerName: string } | null;
  focusedBill: CustomerPortalBill | null;
  additionalOpenBillCount: number;
  energySeries: Array<{ date: string; value: number | null; quality?: string }>;
  recentFinancialRecords: CustomerPortalBill[];
  capabilities: { canPay: boolean; canViewDocuments: boolean };
}
export interface CustomerPaymentInstructions {
  available: boolean;
  bankName?: string;
  bankCode?: string;
  accountName?: string;
  accountNumber?: string;
  branchName?: string;
  promptpayId?: string;
  qrCodeUrl?: string | null;
}
