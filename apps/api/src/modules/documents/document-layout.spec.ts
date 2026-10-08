import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { documentDefinition, formatDocumentDate, formatDocumentMoney, thaiAmountWords, renderDocumentPdf, type DocumentSnapshot } from './document-layout.js';

const fixture: DocumentSnapshot = {
  type: 'invoice', documentNumber: 'INV2026100001', issueDate: '2026-10-08',
  issuer: { name: 'บริษัท โซลาร์รูฟ ทดสอบ จำกัด', address: 'กรุงเทพมหานคร', taxId: '0000000000000' },
  customer: { name: 'โรงเรียนทดสอบ', address: 'จังหวัดนนทบุรี', taxId: '1111111111111' },
  signatories: {}, rates: [],
  items: [{ description: 'ค่าไฟฟ้าพลังงานแสงอาทิตย์', period: '2026-09-01 - 2026-09-30', quantity: '1000.125', rate: '4.1234', amount: '4123.91' }],
  totals: { subtotal: '4123.91', tax: '288.67', taxLabel: 'ภาษีทดสอบ 7% / Simulated tax 7%', total: '4412.58' },
  approvedTransfers: [], paymentAccounts: [],
  logoDataUri: `data:image/png;base64,${readFileSync(new URL('../../../../web/public/brand/solar-roof-document-stacked.png', import.meta.url)).toString('base64')}`,
  templateVersion: 'sarabun-a4-v4', syntheticTest: true,
};
const serialized = (definition: ReturnType<typeof documentDefinition>) => JSON.stringify(definition.content, (key, value) => key === 'image' ? '[approved-logo]' : value);

test('document layout prints reference A4 pages and keeps visible footer identity empty', () => {
 const d=documentDefinition(fixture);assert.equal(d.pageSize,'A4');assert.equal(d.defaultStyle.font,'THSarabunNew');assert.equal(d.defaultStyle.fontSize,16);assert.ok(serialized(d).includes('#f3f4f5'));assert.equal(d.footer(1,2),null);assert.doesNotMatch(visibleText(d.footer(2,2)),/INV|Page/);
 const t=d.content.find((n:any)=>n.table?.headerRows===1).table;assert.equal(t.dontBreakRows,false);assert.equal(t.keepWithHeaderRows,0);assert.match(visibleText(d.footer(1,1)),/Prepared by/);
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
  const text = visibleText(definition.content);
  assert.match(text, /สัญญาซื้อขายไฟฟ้า/);
  assert.match(visibleText(definition.footer(1, 1)), /ผู้ลงนามจริง/);
  assert.match(text, /วันสิ้นสุด \(รวมวันนั้น\)/);
  assert.match(text, /4.1234/);

  assert.doesNotMatch(text, /ภาษีทดสอบ|4,412.58|Approved transfers/);
});

test('receipt prints only approved transfers with exact amounts and leaves missing optional identity out', () => {
  const text = visibleText(documentDefinition({ ...fixture, type: 'receipt', approvedTransfers: [
    { paidAt: '2026-10-08T09:00:00Z', amount: '2000.00', evidence: 'approved-evidence', status: 'paid' },
    { paidAt: '2026-10-08T10:00:00Z', amount: '2412.58', evidence: 'second-evidence', status: 'approved' },
    { paidAt: '2026-10-08T11:00:00Z', amount: '1.00', evidence: 'unapproved-evidence', status: 'pending' as any },
  ] }).content);
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
  const identity = definition.content[0].columns[1];
  assert.equal(identity.width,'*');
  assert.ok(definition.content.some((node: any) => node.table && visibleText(node).includes('Customer')));
});

test('receipt payment card retains the complete saved evidence while allowing long blocks to continue',()=>{
 const d=documentDefinition({...fixture,type:'receipt',approvedTransfers:[{status:'paid',paidAt:'2026-10-08',amount:'4412.58',evidence:'original-evidence'}]});const card=d.content.find((n:any)=>n.table&&visibleText(n).includes('original-evidence'));assert.ok(card);assert.equal(card.table.dontBreakRows,false);assert.match(visibleText(card),/Payment Information/);
});

test('a non-TEST receipt does not claim tax-invoice status', () => {
  const text = serialized(documentDefinition({ ...fixture, type: 'receipt', syntheticTest: false }));
  assert.doesNotMatch(text, /Receipt \/ Test Tax Invoice|ใบกำกับภาษีทดสอบ/);
});

test('long Thai identities expose word boundaries for wrapping without altering saved input', () => {
  const name = 'บริษัทโซลาร์รูฟทดสอบชื่อภาษาไทยที่ยาวมากและไม่มีเว้นวรรค';
  const definition = documentDefinition({ ...fixture, issuer: { ...fixture.issuer, name } });
  const renderedName = definition.content[0].columns[1].stack.find((node: any) => node.bold).text;
  assert.ok(Array.isArray(renderedName));
  assert.ok(renderedName.some((part: any) => part.text === '\u200b' && part.fontSize === 0 && part.opacity === 0));
  assert.equal(renderedName.map((part: any) => part.text).join('').replaceAll('\u200b', ''), name);
});

test('Thai document dates use Buddhist years and preserve invalid or descriptive source values', () => {
  for (const [input, expected] of [
    ['2026-10-08', '8 ตุลาคม 2569'],
    ['2024-02-29', '29 กุมภาพันธ์ 2567'],
    ['2026-09-01 - 2026-09-30', '1-30 กันยายน 2569'],
    ['2026-02-30', '2026-02-30'],
    ['2026-13-01', '2026-13-01'],
    ['2026-02-30 - 2026-03-31', '2026-02-30 - 2026-03-31'],
    ['ไม่กำหนด / Not specified', 'ไม่กำหนด / Not specified'],
    ['  period pending  ', '  period pending  '],
    ['', ''],
  ]) assert.equal(formatDocumentDate(input!), expected);
});

test('valid document ranges omit repeated Thai month and Buddhist year', () => {
  for (const [input, expected] of [
    ['2026-06-01 - 2026-06-30', '1-30 มิถุนายน 2569'],
    ['2024-02-01 – 2024-02-29', '1-29 กุมภาพันธ์ 2567'],
    ['2026-06-25 - 2026-07-05', '25 มิถุนายน - 5 กรกฎาคม 2569'],
    ['2026-12-25 - 2027-01-05', '25 ธันวาคม 2569 - 5 มกราคม 2570'],
  ]) assert.equal(formatDocumentDate(input!), expected);
});

test('reversed document ranges keep full dates and invalid or unsupported ranges keep exact source', () => {
  for (const [input, expected] of [
    ['2026-06-30 - 2026-06-01', '30 มิถุนายน 2569 - 1 มิถุนายน 2569'],
    ['2027-01-05 - 2026-12-25', '5 มกราคม 2570 - 25 ธันวาคม 2569'],
    ['2026-06-01 - 2026-06-31', '2026-06-01 - 2026-06-31'],
    ['2026-02-29 - 2026-03-05', '2026-02-29 - 2026-03-05'],
    ['2026-06-01/2026-06-30', '2026-06-01/2026-06-30'],
    [' period pending ', ' period pending '],
  ]) assert.equal(formatDocumentDate(input!), expected);
});

test('date-only fields ignore host timezones and transfer instants display their Bangkok calendar and time', () => {
  const prior = process.env.TZ;
  try {
    for (const timezone of ['Pacific/Honolulu', 'Pacific/Kiritimati', 'UTC']) {
      process.env.TZ = timezone;
      assert.equal(formatDocumentDate('2026-10-08'), '8 ตุลาคม 2569');
      assert.equal(formatDocumentDate('2026-06-01 - 2026-06-30'), '1-30 มิถุนายน 2569');
      assert.equal(formatDocumentDate('2026-06-25 - 2026-07-05'), '25 มิถุนายน - 5 กรกฎาคม 2569');
      assert.equal(formatDocumentDate('2026-10-08T18:30:00Z'), '9 ตุลาคม 2569 เวลา 01:30:00 (Asia/Bangkok)');
      assert.equal(formatDocumentDate('2026-10-09T01:30:00+07:00'), '9 ตุลาคม 2569 เวลา 01:30:00 (Asia/Bangkok)');
    }
    assert.equal(formatDocumentDate('2026-10-08T18:30:00'), '2026-10-08T18:30:00');
    assert.equal(formatDocumentDate('2026-02-30T18:30:00Z'), '2026-02-30T18:30:00Z');
    assert.equal(formatDocumentDate('2026-10-08T25:30:00Z'), '2026-10-08T25:30:00Z');
  } finally { if (prior === undefined) delete process.env.TZ; else process.env.TZ = prior; }
});

function visibleText(value: any): string {
  if (typeof value === 'string') return value.replaceAll('\u200b', '');
  if (Array.isArray(value)) return value.map(visibleText).join('');
  if (value && typeof value === 'object') {
    if ('text' in value) return visibleText(value.text);
    return Object.entries(value).filter(([key]) => key !== 'image').map(([,child]) => visibleText(child)).join('\n');
  }
  return '';
}

test('issue, schedule, period, due and approved transfer dates share Thai presentation without rewriting snapshots', () => {
  const invoice = { ...fixture, period: '2026-09-01 - 2026-09-30', dueDate: '2026-10-23' };
  const saved = JSON.stringify(invoice);
  const invoiceText = visibleText(documentDefinition(invoice).content);
  assert.match(invoiceText, /วันที่ \/ Issued: 8 ตุลาคม 2569/);
  assert.match(invoiceText, /รอบบิล \/ Period: 1-30 กันยายน 2569/);
  assert.match(invoiceText, /1-30 กันยายน 2569/);
  assert.match(invoiceText, /กำหนดชำระ \/ Due: 23 ตุลาคม 2569/);
  assert.match(invoiceText, /INV2026100001/);
  assert.doesNotMatch(invoiceText, /2026-09-01|2026-09-30|2026-10-08|2026-10-23/);
  const contractText = visibleText(documentDefinition({ ...fixture, type: 'contract', rates: [{ startDate: '2026-01-01', endDate: '2026-12-31', rate: '4.1234' }] }).content);
  assert.match(contractText, /1 มกราคม 2569/);
  assert.match(contractText, /31 ธันวาคม 2569/);
  const receiptText = visibleText(documentDefinition({ ...fixture, type: 'receipt', approvedTransfers: [{ status: 'paid', paidAt: '2026-10-08T18:30:00Z', amount: '4412.58' }] }).content);
  assert.match(receiptText, /9 ตุลาคม 2569 เวลา 01:30:00 \(Asia\/Bangkok\)/);
  assert.doesNotMatch(receiptText, /2026-10-08T18:30:00Z|undefined|null|กำหนดชำระ/);
  assert.equal(JSON.stringify(invoice), saved);
});

const financialFixture: DocumentSnapshot = {
  ...fixture,
  issuer: {name:'บริษัท โซลาร์ รูฟ จำกัด',address:'68/184 ซอยรามคำแหง 164 แขวงมีนบุรี เขตมีนบุรี กรุงเทพมหานคร 10510',taxId:'0105554059286',branch:'00000',phone:'02-000-0000',email:'billing@solar-roof.example.test'},
  customer: {name:'บริษัท ลูกค้าทดสอบเอกสาร จำกัด',address:'123 ถนนทดสอบ แขวงทดสอบ เขตทดสอบ กรุงเทพมหานคร 10110',taxId:'0105554059286',branch:'00000'},
  siteName:'อาคารเรียนหนึ่ง',contractNumber:'PPA261000001',
  paymentAccounts:[{bankName:'ธนาคารทดสอบ',accountName:'บริษัท โซลาร์ รูฟ จำกัด (ทดสอบ)',accountNumber:'000-0-00000-0'}],
  period:'2020-06-01 - 2020-06-30',dueDate:'2026-11-07',paymentTerms:'ชำระภายใน 30 วัน (ข้อมูลสมมติสำหรับทดสอบ)',
  items:[{description:'ค่าไฟฟ้าพลังงานแสงอาทิตย์ / Solar electricity charges',period:'2020-06-01 - 2020-06-30',quantity:'1234.567',rate:'3.5000',amount:'4320.98'}],
  totals:{subtotal:'4320.98',tax:'302.47',taxLabel:'ภาษีทดสอบ 7% / Simulated tax 7%',total:'4623.45'},
  approvedTransfers:[{paidAt:'2026-10-08T06:10:29Z',amount:'4623.45',evidence:'document-channels-synthetic-9daba5b1-5049-44c3-89ef-b2323cd60ae6',status:'approved'}],
};
function pdfPageCount(bytes:Buffer):number {return [...bytes.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length;}
test('ordinary invoice and one-transfer receipt fit one A4 page with their signatures',async()=>{
 for(const type of ['invoice','receipt'] as const){const bytes=await renderDocumentPdf({...financialFixture,type});assert.equal(pdfPageCount(bytes),1,`${type} must retain its signature block on its single ordinary page`);}
});
test('long financial documents paginate instead of shrinking or dropping saved rows',async()=>{
 const items=Array.from({length:45},(_,i)=>({...financialFixture.items[0]!,description:`รายการ ${i+1} ค่าไฟฟ้าพลังงานแสงอาทิตย์ / Solar electricity charges`}));
 const snapshot={...financialFixture,items};const saved=JSON.stringify(snapshot);const bytes=await renderDocumentPdf(snapshot);
 assert.ok(pdfPageCount(bytes)>1);assert.equal(JSON.stringify(snapshot),saved);
 const definition=documentDefinition(snapshot);const rows=definition.content.find((node:any)=>node.table?.headerRows===1).table;
 assert.equal(rows.body.length,46);assert.equal(rows.dontBreakRows,false);assert.equal(rows.keepWithHeaderRows,0);
 assert.match(visibleText(definition.footer(2,2)), /Prepared by/);
});


test('PPA presents frozen effective dates, every dated rate and payment days as factual prose', () => {
 const snapshot = {...fixture, type:'contract' as const, siteName:'ไซต์หนึ่ง',siteExternalId:'SCHOOL-001',contractNumber:'contract-record', startDate:'2026-01-01',endDate:'2046-12-31',paymentTermDays:30,paymentTerms:'ชำระตามข้อมูลสัญญาที่บันทึกไว้',rates:[{startDate:'2026-01-01',endDate:'2026-12-31',rate:'4.1234'},{startDate:'2027-01-01',rate:'3.9876'}]};
 const saved=JSON.stringify(snapshot);const d=documentDefinition(snapshot);const text=visibleText(d.content);
 assert.match(text,/ไซต์งาน: ไซต์หนึ่ง \(SCHOOL-001\)/);assert.match(text,/1 มกราคม 2569/);assert.match(text,/31 ธันวาคม 2589/);
 assert.match(text,/4\.1234/);assert.match(text,/3\.9876/);assert.match(text,/30 วัน/);assert.match(text,/ชำระตามข้อมูลสัญญาที่บันทึกไว้/);
 assert.equal(d.content.some((node:any)=>node.table?.headerRows===1),true);assert.equal(JSON.stringify(snapshot),saved);
 const footer=visibleText(d.footer(1,1));assert.equal((footer.match(/วันที่ลงนาม: ____________________/g)??[]).length,2);assert.doesNotMatch(footer,/8 ตุลาคม 2569/);
});
test('legacy site identity stays name-only and continuation signatures occur only on final page',()=>{
 const d=documentDefinition({...fixture,siteName:'ไซต์เก่า',contractNumber:'internal-contract',...{siteId:'internal-uuid'}});
 assert.match(visibleText(d.content),/ไซต์งาน: ไซต์เก่า/);assert.doesNotMatch(visibleText(d.content),/internal-uuid/);
 assert.doesNotMatch(visibleText(d.footer(1,2)),/Prepared by/);assert.match(visibleText(d.footer(2,2)),/Prepared by/);
 const header=(d as any).header;assert.ok(header);assert.equal(header(1),null);assert.match(visibleText(header(2)),/INV2026100001/);assert.match(visibleText(header(2)),/Invoice/);assert.ok(header(2).columns.some((n:any)=>n.image));
});

test('a signatory block taller than A4 fails explicitly instead of producing negative body space or clipping facts',()=>{
 assert.throws(()=>documentDefinition({...fixture,type:'contract',signatories:{issuer:{name:Array.from({length:80},()=> 'ผู้ลงนามทดสอบ').join('\n')}}}),/Signature block exceeds A4 capacity/);
});


test('reference header places issuer close to logo and includes saved title number issued and invoice due metadata',()=>{
 const snapshot={...fixture,dueDate:'2026-11-07'};const header=documentDefinition(snapshot).content[0];assert.deepEqual(header.columns.map((c:any)=>c.width),[65,'*',190]);assert.equal(header.columnGap,10);assert.equal(header.columns[0].image,snapshot.logoDataUri);assert.match(visibleText(header.columns[1]),/Tax ID/);assert.match(visibleText(header.columns[2]),/Invoice.*INV2026100001.*Issued.*Due/s);assert.ok(header.columns[2].stack.every((n:any)=>n.noWrap!==true));
});
