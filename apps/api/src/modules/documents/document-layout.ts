import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export interface DocumentParty {
  name: string;
  address: string;
  taxId: string;
  branch?: string;
  phone?: string;
  email?: string;
}
export interface DocumentSignatory { name?: string; title?: string; }
/** Frozen input only: never fetch current settings, identities or rates during rendering. */
export interface DocumentSnapshot {
  type: 'contract' | 'invoice' | 'receipt';
  documentNumber: string;
  issueDate: string;
  issuer: DocumentParty;
  customer: DocumentParty;
  siteName?: string;
  contractNumber?: string;
  period?: string;
  signatories: { issuer?: DocumentSignatory; customer?: DocumentSignatory };
  rates: { startDate: string; endDate?: string; rate: string }[];
  items: { description: string; period?: string; quantity: string; rate: string; amount: string }[];
  totals?: { subtotal: string; tax?: string; taxLabel?: string; total: string };
  approvedTransfers: { paidAt: string; amount: string; evidence?: string; status: 'paid' | 'approved' }[];
  paymentAccounts: { bankName: string; accountName: string; accountNumber: string }[];
  dueDate?: string;
  paymentTerms?: string;
  logoDataUri: string;
  templateVersion: string;
  syntheticTest: boolean;
}
// pdfmake's definition is intentionally kept at the rendering boundary.
export interface DocumentDefinition {
  pageSize: 'A4';
  pageOrientation: 'portrait';
  pageMargins: number[];
  defaultStyle: { font: string; fontSize: number; color: string; lineHeight: number };
  content: any[];
  footer: (page: number, total: number) => any;
  info: { title: string; subject: string };
}

function moneyParts(value: string): [string, string] {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) throw new Error('Exact nonnegative money required');
  const [whole, fraction = ''] = value.split('.');
  if (/[1-9]/.test(fraction.slice(2))) throw new Error('Money must be whole satang');
  return [whole!.replace(/^0+(?=\d)/, ''), fraction.padEnd(2, '0').slice(0, 2)];
}
export function formatDocumentMoney(value: string): string {
  const [whole, fraction] = moneyParts(value);
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
}
function exactDecimal(value: string): string {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) throw new Error('Exact nonnegative decimal required');
  return value;
}
const thaiDigits: Record<string, string> = { '0': '', '1': 'หนึ่ง', '2': 'สอง', '3': 'สาม', '4': 'สี่', '5': 'ห้า', '6': 'หก', '7': 'เจ็ด', '8': 'แปด', '9': 'เก้า' };
function thaiInteger(value: string, hasHigherGroup = false): string {
  const normalized = value.replace(/^0+(?=\d)/, '');
  if (normalized === '0') return 'ศูนย์';
  if (normalized.length > 6) {
    const low = normalized.slice(-6);
    return `${thaiInteger(normalized.slice(0, -6))}ล้าน${/^0+$/.test(low) ? '' : thaiInteger(low, true)}`;
  }
  const units = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
  return [...normalized].map((digit, index) => {
    const power = normalized.length - index - 1;
    if (digit === '0') return '';
    if (power === 1) return `${digit === '1' ? '' : digit === '2' ? 'ยี่' : thaiDigits[digit]}สิบ`;
    if (power === 0 && digit === '1' && (normalized.length > 1 || hasHigherGroup)) return 'เอ็ด';
    return `${thaiDigits[digit]}${units[power]}`;
  }).join('');
}
export function thaiAmountWords(value: string): string {
  const [whole, fraction] = moneyParts(value);
  return `${thaiInteger(whole)}บาท${fraction === '00' ? 'ถ้วน' : `${thaiInteger(fraction)}สตางค์`}`;
}
const thaiWords = new Intl.Segmenter('th', { granularity: 'word' });
function printableText(text: string): string | { text: string; fontSize?: number; opacity?: number }[] {
  if (!/[\u0e00-\u0e7f]/.test(text)) return text;
  // SIPA 1.35 has no U+200B glyph. Invisible, zero-size break inlines let pdfmake
  // wrap at Thai word boundaries without printing .notdef boxes or changing fonts.
  return [...thaiWords.segment(text)].flatMap(part => [{ text: part.segment }, { text: '\u200b', fontSize: 0, opacity: 0 }]);
}
const section = (text: string) => ({ text, bold: true, fillColor: '#eeeeee', margin: [0, 14, 0, 6] });
function party(p: DocumentParty, title: string): any {
  return { stack: [
    { text: title, bold: true, margin: [0, 0, 0, 3] },
    { text: printableText(p.name), bold: true }, { text: printableText(p.address) },
    { text: `เลขประจำตัวผู้เสียภาษี / Tax ID: ${p.taxId}${p.branch ? ` (${p.branch})` : ''}` },
    ...(p.phone ? [{ text: `โทร / Tel: ${p.phone}` }] : []),
    ...(p.email ? [{ text: p.email }] : []),
  ] };
}
function table(headers: string[], rows: any[][], widths: (string | number)[], caption?: string): any {
  const remaining = 515.28 - headers.length * 12 - (headers.length + 1) * 0.5 - widths.reduce<number>((sum, width) => sum + (typeof width === 'number' ? width : 0), 0);
  const flexibleCount = widths.filter(width => width === '*').length;
  const boundedWidths = widths.map(width => width === '*' ? remaining / flexibleCount : width);
  const captionRow = caption ? [[{ text: caption, bold: true, colSpan: headers.length, fillColor: '#eeeeee' }, ...headers.slice(1).map(() => ({}))]] : [];
  return { margin: [0, 8, 0, 8], table: {
    headerRows: caption ? 2 : 1, keepWithHeaderRows: 1, dontBreakRows: true, widths: boundedWidths,
    body: [...captionRow, headers.map(text => ({ text, bold: true, fillColor: '#eeeeee' })), ...rows],
  }, layout: {
    hLineWidth: () => 0.5, vLineWidth: () => 0.5,
    hLineColor: () => '#000000', vLineColor: () => '#000000',
    paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 4, paddingBottom: () => 4,
  } };
}
const right = (text: string) => ({ text, alignment: 'right' });
function signatures(s: DocumentSnapshot): any {
  const contract = s.type === 'contract';
  const person = (signatory: DocumentSignatory | undefined, label: string) => ({ stack: [
    { text: '________________________', margin: [0, 28, 0, 6] },
    ...(signatory?.name ? [{ text: printableText(signatory.name) }] : []),
    ...(signatory?.title ? [{ text: printableText(signatory.title) }] : []),
    { text: label },
  ], alignment: 'center' });
  return { unbreakable: true, margin: [0, 8, 0, 0], table: { widths: ['*', '*'], body: [[
    person(s.signatories.issuer, contract ? 'ผู้ลงนามฝ่ายผู้ขาย / Provider signatory' : 'ผู้จัดทำ / Prepared by'),
    person(s.signatories.customer, contract ? 'ผู้ลงนามฝ่ายผู้ซื้อ / Customer signatory' : s.type === 'receipt' ? 'ผู้รับเงิน / Received by' : 'ผู้รับเอกสาร / Document received by'),
  ]] }, layout: 'noBorders' };
}
export function documentDefinition(s: DocumentSnapshot): DocumentDefinition {
  const title = s.type === 'contract' ? ['สัญญาซื้อขายไฟฟ้า', 'Power Purchase Agreement (PPA)'] : s.type === 'receipt' ? (s.syntheticTest ? ['ใบเสร็จรับเงิน / ใบกำกับภาษีทดสอบ', 'Receipt / Test Tax Invoice'] : ['ใบเสร็จรับเงิน', 'Receipt']) : ['ใบแจ้งหนี้', 'Invoice'];
  const content: any[] = [
    { columns: [{ image: s.logoDataUri, width: 160 }, { width: '*', alignment: 'right', stack: [
      { text: title[0], bold: true, fontSize: 20 }, { text: title[1], fontSize: 12 },
      { text: `${s.syntheticTest ? 'TEST - ' : ''}${s.documentNumber}`, margin: [0, 6, 0, 0] },
      { text: `วันที่ / Issued: ${s.issueDate}` },
    ] }], margin: [0, 0, 0, 12] },
  ];
  if (s.syntheticTest) content.push({ text: s.type === 'contract' ? 'SYNTHETIC LOCAL TEST / เอกสารทดสอบ' : 'SYNTHETIC LOCAL TEST - simulated tax 7%; no withholding / เอกสารทดสอบ', italics: true, fontSize: 12, margin: [0, 0, 0, 8] });
  content.push({ table: { widths: [240.89, 240.89], body: [[party(s.issuer, 'ผู้ขาย / Issuer'), party(s.customer, 'ลูกค้า / Customer')]], dontBreakRows: true }, layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#000000', vLineColor: () => '#000000', paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 8, paddingBottom: () => 8 } });
  if (s.siteName) content.push({ text: `ไซต์ / Site: ${s.siteName}`, margin: [0, 8, 0, 0] });
  if (s.contractNumber) content.push({ text: `สัญญา / Contract: ${s.contractNumber}` });
  if (s.period) content.push({ text: `รอบบิล / Period: ${s.period}` });
  if (s.type === 'contract') {
    content.push({ text: `ผู้ลงนาม: ${s.signatories.customer?.name ?? ''}`, margin: [0, 8, 0, 0] });
    if (s.rates.length) content.push(table(['วันเริ่มต้น / Start date', 'วันสิ้นสุด (รวมวันนั้น) / End date (inclusive)', 'THB/kWh'], s.rates.map(r => [r.startDate, r.endDate || 'ไม่กำหนด / Not specified', right(exactDecimal(r.rate))]), [120, '*', 95]));
    else content.push({ text: 'ไม่มีตารางอัตราที่บันทึกไว้ / No recorded rate schedule', margin: [0, 8, 0, 0] });
  } else {
    content.push(table(['รายการ / Description', 'kWh', 'THB/kWh', 'THB'], s.items.map(item => [
      { text: printableText(`${item.description}${item.period ? `\n${item.period}` : ''}`) }, right(exactDecimal(item.quantity)), right(exactDecimal(item.rate)), right(formatDocumentMoney(item.amount)),
    ]), ['*', 65, 65, 115]));
    if (s.totals) content.push({ unbreakable: true, margin: [0, 8, 0, 8], stack: [
      { columns: [{ text: 'ยอดก่อนภาษี / Subtotal' }, right(`${formatDocumentMoney(s.totals.subtotal)} THB`)] },
      ...(s.totals.tax === undefined ? [] : [{ columns: [{ text: s.totals.taxLabel ?? 'ภาษี / Tax' }, right(`${formatDocumentMoney(s.totals.tax)} THB`)] }]),
      { table: { widths: ['*', 190], body: [[{ text: 'ยอดรวม / Total', bold: true, fillColor: '#eeeeee' }, { ...right(`${formatDocumentMoney(s.totals.total)} THB`), bold: true, fillColor: '#eeeeee' }]] }, layout: 'noBorders', margin: [0, 5, 0, 5] },
      { text: printableText(thaiAmountWords(s.totals.total)), alignment: 'right', italics: true },
    ] });
    if (s.type === 'receipt') {
      const transfers = s.approvedTransfers.filter(p => p.status === 'paid' || p.status === 'approved');
      if (transfers.length) content.push(table(['วันที่ชำระ / Paid', 'หลักฐาน / Evidence', 'THB'], transfers.map(p => [p.paidAt, p.evidence ?? '', right(formatDocumentMoney(p.amount))]), [140, '*', 115], 'หลักฐานการชำระ / Approved transfers'));
    } else {
      if (s.dueDate) content.push({ text: `กำหนดชำระ / Due: ${s.dueDate}`, margin: [0, 5, 0, 0] });
      if (s.paymentAccounts.length) content.push(section('บัญชีรับชำระ / Payment accounts'), ...s.paymentAccounts.map(b => ({ text: `${b.bankName} - ${b.accountName} - ${b.accountNumber}` })));
    }
  }
  if (s.paymentTerms) content.push({ text: s.paymentTerms, margin: [0, 8, 0, 0] });
  content.push(signatures(s));
  return {
    pageSize: 'A4', pageOrientation: 'portrait', pageMargins: [40, 36, 40, 52],
    defaultStyle: { font: 'THSarabunNew', fontSize: 15, color: '#000000', lineHeight: 1.1 }, content,
    info: { title: s.documentNumber, subject: s.templateVersion },
    footer: (page, total) => ({ text: `${s.syntheticTest ? 'TEST - ' : ''}${s.documentNumber} | หน้า / Page ${page} / ${total}`, fontSize: 11, color: '#000000', alignment: 'right', margin: [40, 12, 40, 0] }),
  };
}

const require = createRequire(import.meta.url);
const fontDirectory = new URL('../../../assets/fonts/th-sarabun-new/', import.meta.url);
const fonts = {
  normal: fileURLToPath(new URL('THSarabunNew.ttf', fontDirectory)),
  bold: fileURLToPath(new URL('THSarabunNew Bold.ttf', fontDirectory)),
  italics: fileURLToPath(new URL('THSarabunNew Italic.ttf', fontDirectory)),
  bolditalics: fileURLToPath(new URL('THSarabunNew BoldItalic.ttf', fontDirectory)),
};
export async function renderDocumentPdf(snapshot: DocumentSnapshot): Promise<Buffer> {
  const pdf = require('pdfmake');
  const permitted = new Set(Object.values(fonts).map(path => resolve(path)));
  pdf.setUrlAccessPolicy(() => false);
  pdf.setLocalAccessPolicy((path: string) => permitted.has(resolve(path)));
  pdf.addFonts({ THSarabunNew: fonts });
  const bytes: Buffer = await pdf.createPdf(documentDefinition(snapshot)).getBuffer();
  if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid PDF bytes');
  return bytes;
}
