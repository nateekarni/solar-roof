import type { CustomerPortalBill } from '@solar/api-contracts';

export function hasOutstandingBalance(bill: Pick<CustomerPortalBill, 'outstandingAmount'>): boolean {
  // Decimal text stays exact even above JavaScript's safe integer range.
  return !bill.outstandingAmount.startsWith('-') && /[1-9]/.test(bill.outstandingAmount);
}

export function selectFocusedBill(bills: readonly CustomerPortalBill[]): CustomerPortalBill | null {
  const priority = ['overdue', 'partially_paid', 'awaiting_payment', 'pending_verification'];
  return bills.filter(bill => priority.includes(bill.status) && hasOutstandingBalance(bill))
    .sort((a, b) => priority.indexOf(a.status) - priority.indexOf(b.status)
      || (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31')
      || a.periodStart.localeCompare(b.periodStart) || a.id.localeCompare(b.id))[0] ?? null;
}
