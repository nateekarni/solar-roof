import assert from 'node:assert/strict';
import test from 'node:test';
import type { CustomerPortalBill } from '@solar/api-contracts';
import { selectFocusedBill } from './focused-bill.js';

function bill(id: string, status: CustomerPortalBill['status'], dueDate: string | null, outstandingAmount = '100.00'): CustomerPortalBill {
  return { id, status, dueDate, outstandingAmount, siteId: 'site', period: '2026-09', periodStart: '2026-09-01', periodEnd: '2026-09-30', invoiceId: 'invoice', invoiceNumber: 'INV', consumedKwh: '20', rate: '5', subtotal: '100.00', tax: '0.00', billedAmount: '100.00', approvedAmount: '0.00', pendingEvidenceCount: 0, rejectedEvidenceCount: 0, canPay: true };
}

test('focuses oldest overdue before partial, upcoming and pending verification', () => {
  assert.equal(selectFocusedBill([bill('partial', 'partially_paid', '2026-09-01'), bill('pending', 'pending_verification', '2026-08-01'), bill('upcoming', 'awaiting_payment', '2026-10-20'), bill('new', 'overdue', '2026-10-10'), bill('old', 'overdue', '2026-10-01')])?.id, 'old');
});
test('partial remaining balance precedes upcoming and pending verification', () => {
  assert.equal(selectFocusedBill([bill('pending', 'pending_verification', '2026-08-01'), bill('upcoming', 'awaiting_payment', '2026-10-20'), bill('settled', 'partially_paid', '2026-09-01', '0.00'), bill('partial', 'partially_paid', '2026-10-30')])?.id, 'partial');
});
test('nearest upcoming bill precedes pending verification and undated bills', () => {
  assert.equal(selectFocusedBill([bill('pending', 'pending_verification', '2026-08-01'), bill('undated', 'awaiting_payment', null), bill('later', 'awaiting_payment', '2026-10-30'), bill('nearest', 'awaiting_payment', '2026-10-20')])?.id, 'nearest');
});
test('pending verification is focused when no payable bill remains', () => {
  assert.equal(selectFocusedBill([bill('paid', 'paid', '2026-09-01', '0.00'), bill('pending', 'pending_verification', '2026-10-01')])?.id, 'pending');
});
test('empty, settled and unsuccessful cycles have no focused bill', () => {
  assert.equal(selectFocusedBill([]), null);
  assert.equal(selectFocusedBill([bill('paid', 'paid', null, '0.00'), bill('failed', 'unsuccessful', null), bill('zero', 'overdue', null, '0.00')]), null);
});
