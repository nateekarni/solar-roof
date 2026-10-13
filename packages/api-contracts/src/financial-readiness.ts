import type { FinancialAction } from './capabilities.js';

export type FinancialScope = 'TEST' | 'PRODUCTION';
export type ReadinessResponsibility = 'owner' | 'technical' | 'environment';

export interface FinancialReadinessItem {
  id: string;
  ready: boolean;
  responsibility: ReadinessResponsibility;
  destination?: string;
  siteId?: string;
}

export interface FinancialReadinessStatus {
  scope: FinancialScope | null;
  fingerprint: string;
  approval: { id: string; approvedAt: string; approvedBy: string } | null;
  items: FinancialReadinessItem[];
  actions: Record<FinancialAction, { enabled: boolean; missing: string[] }>;
}

export interface FinancialReadinessContext {
  siteId?: string;
  billingCycleId?: string;
  periodStart?: string;
  periodEnd?: string;
}
