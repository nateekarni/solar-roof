import type { FinancialScope } from './financial-readiness.js';

export type FinancialAction = 'calculate' | 'issue' | 'approve_payment' | 'adjust' | 'send';
export interface Capabilities { actions: string[]; unavailable: Record<string, string>; operationsActions?: string[]; financialScope?: FinancialScope; }

