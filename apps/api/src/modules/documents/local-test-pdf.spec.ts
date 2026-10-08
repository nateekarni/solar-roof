import assert from 'node:assert/strict';import test from 'node:test';
import {formatTestMoney} from './local-test-pdf.js';
test('PDF monetary formatting preserves exact large satang and PostgreSQL zero padding',()=>{assert.equal(formatTestMoney('90071992547409.91'),'90,071,992,547,409.91');assert.equal(formatTestMoney('4623.45000000'),'4,623.45');assert.equal(formatTestMoney('2000'),'2,000.00');assert.throws(()=>formatTestMoney('4623.450001'));});

import { localTestDocumentSnapshot } from './local-test-pdf.js';
test('financial snapshot adapter retains every saved meter/rate and approved transfer while freezing identity', () => {
  const document = {
    document_type: 'receipt', document_number: 'RCT2026100001', snapshot: {
      company: { company_name: 'บริษัทจริง', address: 'ที่อยู่บริษัท', tax_id: '0000000000000', branch: 'สำนักงานใหญ่' },
      customer: { id: 'contract-id', company_name: 'โรงเรียนจริง', tax_address: 'ที่อยู่ลูกค้า', tax_id: '1111111111111', site_name: 'ไซต์จริง', external_site_id: 'SITE-002', start_date: '2026-01-01', end_date: '2046-12-31', payment_term_days: 30, payment_terms: '30 days' },
      issueDate: '2026-10-08', dueDate: '2026-10-23', logo: 'data:image/png;base64,AA==',
      cycle: { period_start: '2026-09-01', period_end: '2026-09-30', subtotal: '90071992547409.91', simulated_tax: '0.00', amount: '90071992547409.91', meter_snapshot: [
        { from: '2026-09-01', to: '2026-09-16', consumedKwh: '1000.123', rate: '4.1234', subtotal: '4123.91' },
        { from: '2026-09-16', to: '2026-10-01', consumedKwh: '2000.456', rate: '4.5678', subtotal: '9137.68' },
      ] },
      banks: [{ bank_name: 'ธนาคารจริง', account_name: 'ชื่อบัญชีจริง', account_number: '1234' }],
      payments: [
        { status: 'paid', paid_at: '2026-10-08T09:00:00Z', amount: '90071992547409.91', evidence_key: 'approved-original' },
        { status: 'pending_verification', paid_at: '2026-10-08T10:00:00Z', amount: '1.00', slip_url: 'pending-original' },
      ],
    },
  };
  const original = JSON.stringify(document);
  const snapshot = localTestDocumentSnapshot(document);
  assert.equal(snapshot.issuer.name, 'บริษัทจริง');
  assert.equal(snapshot.siteExternalId,'SITE-002');
  assert.equal(snapshot.templateVersion,'sarabun-a4-v4');
  assert.deepEqual(snapshot.items.map((item: any) => [item.period, item.quantity, item.rate, item.amount]), [
    ['2026-09-01 - 2026-09-15', '1000.123', '4.1234', '4123.91'],
    ['2026-09-16 - 2026-09-30', '2000.456', '4.5678', '9137.68'],
  ]);
  assert.equal(snapshot.totals?.total, '90071992547409.91');
  assert.deepEqual(snapshot.approvedTransfers.map((p: any) => p.evidence), ['approved-original']);
  assert.equal(snapshot.syntheticTest, true);
  assert.equal(JSON.stringify(document), original);
});

test('financial adapter preserves saved transfer date strings for presentation and serialization', () => {
  const document = {
    document_type: 'receipt', document_number: 'RCT2026100002', snapshot: {
      company: { company_name: 'บริษัทจริง', address: 'ที่อยู่บริษัท', tax_id: '0000000000000' },
      customer: { company_name: 'โรงเรียนจริง', tax_address: 'ที่อยู่ลูกค้า', tax_id: '1111111111111' },
      issueDate: '2026-10-08', logo: 'data:image/png;base64,AA==',
      cycle: { period_start: '2026-09-01', period_end: '2026-09-30', subtotal: '3.00', simulated_tax: '0.00', amount: '3.00', meter_snapshot: [] },
      banks: [], payments: [
        { status: 'paid', paid_at: '2026-10-08T18:30:00Z', amount: '1.00' },
        { status: 'paid', paid_at: '  transfer date pending  ', amount: '1.00' },
        { status: 'paid', paid_at: new Date('2026-10-08T18:30:00Z'), amount: '1.00' },
      ],
    },
  };
  const saved = JSON.stringify(document);
  assert.doesNotThrow(() => localTestDocumentSnapshot(document));
  const snapshot = localTestDocumentSnapshot(document);
  assert.deepEqual(snapshot.approvedTransfers.map(p => p.paidAt), ['2026-10-08T18:30:00Z', '  transfer date pending  ', '2026-10-08T18:30:00.000Z']);
  assert.equal(snapshot.issueDate, '2026-10-08');
  assert.equal(snapshot.period, '2026-09-01 - 2026-09-30');
  assert.equal(JSON.stringify(document), saved);
});
