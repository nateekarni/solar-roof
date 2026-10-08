import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { documentDefinition, formatDocumentMoney, thaiAmountWords, renderDocumentPdf, type DocumentSnapshot } from './document-layout.js';

const fixture: DocumentSnapshot = {
  type: 'invoice', documentNumber: 'INV2026100001', issueDate: '2026-10-08',
  issuer: { name: 'บริษัท โซลาร์รูฟ ทดสอบ จำกัด', address: 'กรุงเทพมหานคร', taxId: '0000000000000' },
  customer: { name: 'โรงเรียนทดสอบ', address: 'จังหวัดนนทบุรี', taxId: '1111111111111' },
  signatories: {}, rates: [],
  items: [{ description: 'ค่าไฟฟ้าพลังงานแสงอาทิตย์', period: '2026-09-01 - 2026-09-30', quantity: '1000.125', rate: '4.1234', amount: '4123.91' }],
  totals: { subtotal: '4123.91', tax: '288.67', taxLabel: 'ภาษีทดสอบ 7% / Simulated tax 7%', total: '4412.58' },
  approvedTransfers: [], paymentAccounts: [],
  logoDataUri: `data:image/png;base64,${readFileSync(new URL('../../../../web/public/brand/solar-roof-document.png', import.meta.url)).toString('base64')}`,
  templateVersion: 'sarabun-a4-v1', syntheticTest: true,
};
const serialized = (definition: ReturnType<typeof documentDefinition>) => JSON.stringify(definition.content, (key, value) => key === 'image' ? '[approved-logo]' : value);

test('document layout prints shared A4 pages with the required Thai font and black/gray styling', () => {
  const definition = documentDefinition(fixture);
  assert.equal(definition.pageSize, 'A4');
  assert.equal(definition.defaultStyle.font, 'THSarabunNew');
  assert.equal(definition.defaultStyle.color, '#000000');
  assert.ok(serialized(definition).includes('#eeeeee'));
  const footer = definition.footer(2, 3);
  assert.match(JSON.stringify(footer), /INV2026100001/);
  assert.match(JSON.stringify(footer), /2 \/ 3/);
  const table = definition.content.find((node: any) => node.table?.headerRows === 1);
  assert.equal(table.table.dontBreakRows, true);
  assert.equal(table.table.keepWithHeaderRows, 1);
  assert.ok(definition.content.some((node: any) => node.unbreakable && node.table));
});

test('invoice uses exact saved rate rows and totals without changing the snapshot', () => {
  const saved = JSON.stringify(fixture);
  const text = serialized(documentDefinition({ ...fixture, totals: { subtotal: '90071992547409.91', total: '90071992547409.91' } }));
  assert.match(text, /90,071,992,547,409.91/);
  assert.match(text, /1000.125/);
  assert.match(text, /4.1234/);
  assert.equal(JSON.stringify(fixture), saved);
  assert.equal(formatDocumentMoney('4623.45000000'), '4,623.45');
  assert.throws(() => formatDocumentMoney('4623.450001'));
  assert.equal(thaiAmountWords('21.01'), 'ยี่สิบเอ็ดบาทหนึ่งสตางค์');
  assert.equal(thaiAmountWords('1000001.00'), 'หนึ่งล้านเอ็ดบาทถ้วน');
  assert.equal(thaiAmountWords('0.00'), 'ศูนย์บาทถ้วน');
});

test('contract retains the existing rate schedule and signer body without fabricated financial charges', () => {
  const { totals, ...contractFixture } = fixture;
  const definition = documentDefinition({ ...contractFixture, type: 'contract', items: [], rates: [{ startDate: '2026-01-01', endDate: '2026-12-31', rate: '4.1234' }], signatories: { customer: { name: 'ผู้ลงนามจริง', title: 'ผู้อำนวยการ' } } });
  const text = serialized(definition);
  assert.match(text, /สัญญาซื้อขายไฟฟ้า/);
  assert.match(text, /ผู้ลงนาม:/);
  assert.match(text, /วันสิ้นสุด \(รวมวันนั้น\)/);
  assert.match(text, /4.1234/);
  assert.match(text, /ผู้ลงนามจริง/);
  assert.doesNotMatch(text, /ภาษีทดสอบ|4,412.58|Approved transfers/);
});

test('receipt prints only approved transfers with exact amounts and leaves missing optional identity out', () => {
  const text = serialized(documentDefinition({ ...fixture, type: 'receipt', approvedTransfers: [
    { paidAt: '2026-10-08T09:00:00Z', amount: '2000.00', evidence: 'approved-evidence', status: 'paid' },
    { paidAt: '2026-10-08T10:00:00Z', amount: '2412.58', evidence: 'second-evidence', status: 'approved' },
    { paidAt: '2026-10-08T11:00:00Z', amount: '1.00', evidence: 'unapproved-evidence', status: 'pending' as any },
  ] }));
  assert.match(text, /approved-evidence/);
  assert.match(text, /2,412.58/);
  assert.doesNotMatch(text, /unapproved-evidence|undefined|null|บัญชีรับชำระ/);
});

test('real PDF rendering embeds the bundled Sarabun family without a runtime font override', async () => {
  const bytes = await renderDocumentPdf(fixture);
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.match(bytes.toString('latin1'), /THSarabunNew/);
  assert.match(bytes.toString('latin1'), /\/FontFile2/);
});


test('long Thai identity cells stay within the printable A4 width', () => {
  const definition = documentDefinition({ ...fixture, issuer: { ...fixture.issuer, name: 'บริษัทโซลาร์รูฟทดสอบชื่อภาษาไทยที่ยาวมากและไม่มีเว้นวรรคเพื่อทดสอบการตัดบรรทัด', address: 'ที่อยู่ภาษาไทยที่ยาวมากและไม่มีเว้นวรรคเพื่อยืนยันว่าข้อมูลไม่ล้นออกนอกหน้ากระดาษ' } });
  const identity = definition.content.find((node: any) => node.table?.body?.[0]?.[0]?.stack);
  assert.ok(identity.table.widths.every((width: unknown) => typeof width === 'number'));
  assert.ok(identity.table.widths.reduce((sum: number, width: number) => sum + width, 0) <= 483);
});

test('receipt transfer caption repeats with its table header instead of being orphaned before a page break', () => {
  const definition = documentDefinition({ ...fixture, type: 'receipt', approvedTransfers: [{ status: 'paid', paidAt: '2026-10-08', amount: '4412.58', evidence: 'original-evidence' }] });
  const transferTable = definition.content.find((node: any) => node.table?.body?.some((row: any[]) => JSON.stringify(row).includes('original-evidence')));
  assert.equal(transferTable.table.headerRows, 2);
  assert.match(JSON.stringify(transferTable.table.body[0]), /Approved transfers/);
});

test('a non-TEST receipt does not claim tax-invoice status', () => {
  const text = serialized(documentDefinition({ ...fixture, type: 'receipt', syntheticTest: false }));
  assert.doesNotMatch(text, /Receipt \/ Test Tax Invoice|ใบกำกับภาษีทดสอบ/);
});

test('long Thai identities expose word boundaries for wrapping without altering saved input', () => {
  const name = 'บริษัทโซลาร์รูฟทดสอบชื่อภาษาไทยที่ยาวมากและไม่มีเว้นวรรค';
  const definition = documentDefinition({ ...fixture, issuer: { ...fixture.issuer, name } });
  const identity = definition.content.find((node: any) => node.table?.body?.[0]?.[0]?.stack);
  const renderedName = identity.table.body[0][0].stack[1].text;
  assert.ok(Array.isArray(renderedName));
  assert.ok(renderedName.some((part: any) => part.text === '\u200b' && part.fontSize === 0 && part.opacity === 0));
  assert.equal(renderedName.map((part: any) => part.text).join('').replaceAll('\u200b', ''), name);
});
