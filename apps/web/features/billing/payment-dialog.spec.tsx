import * as React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { PaymentDialog } from './payment-dialog';
import { SessionUserProvider } from '../../providers/session-user-provider';

test('PaymentDialog renders payment date picker, method select, amount input, and mobile zoom prevention styles', () => {
  const cycle = {
    id: 'cycle-123',
    period: '2026-10',
    customerName: 'Acme Solar Corp',
    siteName: 'Factory Rooftop',
    consumedKwh: 1250,
    rate: 4.5,
    amount: 5625.0,
    invoiceNumber: 'INV-202610-0042',
    payments: [],
  };

  const html = renderToStaticMarkup(
    <SessionUserProvider user={{ id: 'u1', email: 'test@example.com', displayName: 'Customer User', role: 'customer_user' }}>
      <PaymentDialog
        inline={true}
        open={true}
        onOpenChange={() => {}}
        billingCycle={cycle}
      />
    </SessionUserProvider>
  );

  // Must render dialog title and cycle/invoice details
  assert.match(html, /ชำระเงินและแนบหลักฐาน/);
  assert.match(html, /INV-202610-0042/);
  assert.match(html, /Acme Solar Corp/);

  // Payment Date label & DatePicker
  assert.match(html, /วันที่ชำระเงิน/);
  assert.match(html, /payment-date/);

  // Payment Method select
  assert.match(html, /ช่องทางการชำระ/);
  assert.match(html, /โอนเงินผ่านธนาคาร/);
  assert.match(html, /พร้อมเพย์/);

  // Payment Amount
  assert.match(html, /จำนวนเงินที่ชำระ \(บาท\)/);

  // Mobile zoom prevention: all form inputs, selects, and buttons must include text-base md:text-sm
  assert.ok(html.includes('text-base md:text-sm'));

  // Desktop wider modal sizing and 2-column grid layout
  assert.ok(html.includes('sm:max-w-2xl lg:max-w-3xl'));
  assert.ok(html.includes('grid grid-cols-1 md:grid-cols-12 gap-5'));
  assert.ok(html.includes('md:col-span-5'));
  assert.ok(html.includes('md:col-span-7'));
});
