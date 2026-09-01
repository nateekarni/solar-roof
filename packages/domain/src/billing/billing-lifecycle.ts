export type BillingStatus = "draft" | "pending_approval" | "approved" | "finalized" | "cancelled";
const transitions: Record<BillingStatus, BillingStatus[]> = { draft: ["pending_approval", "cancelled"], pending_approval: ["approved", "draft", "cancelled"], approved: ["finalized", "cancelled"], finalized: ["cancelled"], cancelled: [] };
export function canTransition(from: BillingStatus, to: BillingStatus): boolean { return transitions[from].includes(to); }
export function assertTransition(from: BillingStatus, to: BillingStatus): void { if (!canTransition(from, to)) throw new Error(`invalid_billing_transition:${from}:${to}`); }
