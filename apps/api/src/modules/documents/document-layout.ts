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
  siteExternalId?: string | undefined;
  startDate?: string;
  endDate?: string | undefined;
  paymentTermDays?: number | null | undefined;
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
  header: (page: number) => any;
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
const section = (text: string) => ({ text, bold: true, margin: [0, 10, 0, 4] });
function party(p: DocumentParty, title?: string): any {
  return { stack: [
    ...(title ? [{ text: title, bold: true, margin: [0, 0, 0, 3] }] : []),
    { text: printableText(p.name), bold: true }, { text: printableText(p.address) },
    { text: printableText(`เลขประจำตัวผู้เสียภาษี / Tax ID: ${p.taxId}${p.branch ? ` (${p.branch})` : ''}`) },
    ...(p.phone ? [{ text: printableText(`โทร / Tel: ${p.phone}`) }] : []),
    ...(p.email ? [{ text: p.email }] : []),
  ] };
}
function table(headers: string[], rows: any[][], widths: (string | number)[], caption?: string, compact = false): any {
  const captionRow = caption ? [[{ text: caption, bold: true, colSpan: headers.length, fillColor: '#eeeeee' }, ...headers.slice(1).map(() => ({}))]] : [];
  return { margin: [0, compact ? 5 : 8, 0, compact ? 5 : 8], table: {
    // Keep only the header unbreakable: keeping an oversized first row with it
    // makes pdfmake discard that row even when dontBreakRows is false.
    headerRows: caption ? 2 : 1, keepWithHeaderRows: 0, dontBreakRows: false, widths,
    body: [...captionRow, headers.map(text => ({ text: printableText(text), bold: true, fillColor: '#eeeeee' })), ...rows],
  }, layout: {
    hLineWidth: () => 0.5, vLineWidth: () => 0.5,
    hLineColor: () => '#000000', vLineColor: () => '#000000',
    paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => compact ? 3 : 4, paddingBottom: () => compact ? 3 : 4,
  } };
}
const right = (text: string) => ({ text, alignment: 'right', noWrap: true });
function signatures(s: DocumentSnapshot): any {
  const contract = s.type === 'contract';
  const issuer = s.signatories.issuer;
  const customer = s.signatories.customer;
  const centered = (text: string, margin?: number[]) => ({ text: printableText(text), alignment: 'center', ...(margin ? { margin } : {}) });
  // Invisible paired rows align names, roles and blank dates even when one name
  // wraps more than its counterpart. This is signature structure, not a data table.
  return { table: { widths: ['*', '*'], body: [
    [centered('________________________', [0, 10, 0, 4]), centered('________________________', [0, 10, 0, 4])],
    ...(issuer?.name || customer?.name ? [[centered(issuer?.name ?? ''), centered(customer?.name ?? '')]] : []),
    ...(issuer?.title || customer?.title ? [[centered(issuer?.title ?? ''), centered(customer?.title ?? '')]] : []),
    [centered(contract ? 'ผู้ลงนามฝ่ายผู้ขาย / Provider signatory' : 'ผู้จัดทำ / Prepared by'),
      centered(contract ? 'ผู้ลงนามฝ่ายผู้ซื้อ / Customer signatory' : s.type === 'receipt' ? 'ผู้รับเงิน / Received by' : 'ผู้รับเอกสาร / Document received by')],
    ...(contract ? [[centered('วันที่ลงนาม: ____________________', [0, 4, 0, 0]), centered('วันที่ลงนาม: ____________________', [0, 4, 0, 0])]] : []),
  ] }, layout: {
    hLineWidth: () => 0, vLineWidth: () => 0,
    paddingLeft: (column: number) => column === 0 ? 0 : 12,
    paddingRight: (column: number) => column === 0 ? 12 : 0,
    paddingTop: () => 0, paddingBottom: () => 0,
  } };
}
/** Measure with the same pdfmake engine/font so long signatory names reserve real space.
 * This small internal-API boundary is covered by actual page geometry regressions. */
function signatureHeight(s: DocumentSnapshot, style: DocumentDefinition['defaultStyle']): number {
  const PDFDocument = require('pdfmake/js/PDFDocument.js').default;
  const LayoutBuilder = require('pdfmake/js/LayoutBuilder.js').default;
  const doc = new PDFDocument({ THSarabunNew: fonts }, {}, {}, {}, { autoFirstPage: false });
  const builder = new LayoutBuilder({ width: 595.28, height: Infinity }, { left: 40, top: 0, right: 40, bottom: 0 });
  try {
    const pages = builder.layoutDocument(signatures(s), doc, {}, style);
    return Math.ceil(Math.max(0, ...pages[0].items.filter((item: any) => item.type === 'line').map((item: any) => item.item.y + item.item.getHeight())));
  } finally { doc.end(); doc.resume(); }
}
export function documentDefinition(s: DocumentSnapshot): DocumentDefinition {
  const title = s.type === 'contract' ? ['สัญญาซื้อขายไฟฟ้า', 'Power Purchase Agreement (PPA)'] : s.type === 'receipt' ? (s.syntheticTest ? ['ใบเสร็จรับเงิน / ใบกำกับภาษีทดสอบ', 'Receipt / Test Tax Invoice'] : ['ใบเสร็จรับเงิน', 'Receipt']) : ['ใบแจ้งหนี้', 'Invoice'];
  const financial = s.type !== 'contract';
  const defaultStyle = { font: 'THSarabunNew', fontSize: financial ? 14.5 : 15, color: '#000000', lineHeight: financial ? 1 : 1.1 };
  // Reserve signature space on every page. Final-page-only footer signatures cannot
  // force an empty signature page and cannot overlap long body/table content.
  const signatureSpace = signatureHeight(s, defaultStyle);
  const bottomMargin = signatureSpace + 48;
  if (bottomMargin >= 841.89 - 54 - 40) throw new Error('Signature block exceeds A4 capacity');
  const content: any[] = [
    { columns: [{ width: 310, stack: [{ image: s.logoDataUri, width: 160, margin: [0, 0, 0, 7] }, ...party(s.issuer).stack] }, { width: '*', alignment: 'right', stack: [
      { text: printableText(title[0]!), bold: true, fontSize: 20 }, { text: title[1], fontSize: 12 },
      { text: `${s.syntheticTest ? 'TEST - ' : ''}${s.documentNumber}`, margin: [0, 6, 0, 0] },
      { text: `วันที่ / Issued: ${formatDocumentDate(s.issueDate)}` },
    ] }], columnGap: 16, margin: [0, 0, 0, 12] },
  ];
  if (s.syntheticTest) content.push({ text: printableText(s.type === 'contract' ? 'SYNTHETIC LOCAL TEST / เอกสารทดสอบ' : 'SYNTHETIC LOCAL TEST - simulated tax 7%; no withholding / เอกสารทดสอบ'), italics: true, fontSize: 12, margin: [0, 0, 0, 8] });
  content.push({ ...party(s.customer, 'ลูกค้า / Customer'), margin: [0, 0, 0, 6] });
  if (s.type === 'contract') content.push({ text: printableText(`ข้อมูลคู่สัญญา: ${s.issuer.name} (ฝ่ายผู้ขาย) และ ${s.customer.name} (ฝ่ายผู้ซื้อ)`), margin: [0, 8, 0, 0] });
  if (s.siteName) content.push({ text: printableText(`ไซต์งาน: ${s.siteName}${s.siteExternalId ? ` (${s.siteExternalId})` : ''}`), margin: [0, 6, 0, 0] });
  if (s.contractNumber) content.push({ text: `สัญญา / Contract: ${s.contractNumber}` });
  if (s.period && financial) content.push({ text: `รอบบิล / Period: ${formatDocumentDate(s.period)}` });
  if (s.type === 'contract') {
    if (s.startDate) content.push({ text: `วันเริ่มมีผล / Effective start: ${formatDocumentDate(s.startDate)}`, margin: [0, 8, 0, 0] });
    if (s.endDate) content.push({ text: `วันสิ้นสุดสัญญา / Effective end: ${formatDocumentDate(s.endDate)}` });
    if (s.rates.length) content.push(...s.rates.map((r, index) => ({ text: printableText(`${index + 1}. อัตราค่าไฟ ${exactDecimal(r.rate)} THB/kWh ตั้งแต่ ${formatDocumentDate(r.startDate)}; วันสิ้นสุด (รวมวันนั้น): ${r.endDate ? formatDocumentDate(r.endDate) : 'ไม่กำหนด / Not specified'}`), margin: [0, 8, 0, 0] })));
    else content.push({ text: 'ไม่มีอัตราค่าไฟที่บันทึกไว้ / No recorded rate schedule', margin: [0, 8, 0, 0] });
    if (s.paymentTermDays !== undefined && s.paymentTermDays !== null) content.push({ text: `ระยะเวลาชำระเงิน / Payment term: ${s.paymentTermDays} วัน / days`, margin: [0, 8, 0, 0] });
  } else {
    content.push(table(['รายการ / Description', 'kWh', 'THB/kWh', 'THB'], s.items.map(item => [
      { text: printableText(`${item.description}${item.period ? `\n${formatDocumentDate(item.period)}` : ''}`) }, right(exactDecimal(item.quantity)), right(exactDecimal(item.rate)), right(formatDocumentMoney(item.amount)),
    ]), ['*', 'auto', 'auto', 'auto'], undefined, true));
    if (s.totals) content.push({ unbreakable: true, margin: [0, 8, 0, 8], stack: [
      { columns: [{ text: 'ยอดก่อนภาษี / Subtotal' }, right(`${formatDocumentMoney(s.totals.subtotal)} THB`)] },
      ...(s.totals.tax === undefined ? [] : [{ columns: [{ text: s.totals.taxLabel ?? 'ภาษี / Tax' }, right(`${formatDocumentMoney(s.totals.tax)} THB`)] }]),
      { table: { widths: ['*', 'auto'], body: [[{ text: 'ยอดรวม / Total', bold: true, fillColor: '#eeeeee' }, { ...right(`${formatDocumentMoney(s.totals.total)} THB`), bold: true, fillColor: '#eeeeee' }]] }, layout: 'noBorders', margin: [0, 5, 0, 5] },
      { text: printableText(thaiAmountWords(s.totals.total)), alignment: 'right', italics: true },
    ] });
    if (s.type === 'receipt') {
      const transfers = s.approvedTransfers.filter(p => p.status === 'paid' || p.status === 'approved');
      if (transfers.length) content.push(table(['วันที่ชำระ / Paid', 'หลักฐาน / Evidence', 'THB'], transfers.map(p => [{ text: printableText(formatDocumentDate(p.paidAt)) }, { text: printableText(p.evidence ?? '') }, right(formatDocumentMoney(p.amount))]), ['auto', '*', 'auto'], 'หลักฐานการชำระ / Approved transfers', true));
    } else {
      if (s.dueDate) content.push({ text: `กำหนดชำระ / Due: ${formatDocumentDate(s.dueDate)}`, margin: [0, 5, 0, 0] });
      if (s.paymentAccounts.length) content.push(section('บัญชีรับชำระ / Payment accounts'), ...s.paymentAccounts.map(b => ({ text: printableText(`${b.bankName} - ${b.accountName} - ${b.accountNumber}`) })));
    }
  }
  if (s.paymentTerms) content.push({ text: printableText(s.paymentTerms), margin: [0, 8, 0, 0] });
  return {
    pageSize: 'A4', pageOrientation: 'portrait', pageMargins: [40, 54, 40, bottomMargin], defaultStyle, content,
    info: { title: s.documentNumber, subject: s.templateVersion },
    header: page => page === 1 ? null : { columns: [{ image: s.logoDataUri, width: 85 }, { width: '*', text: printableText(`${title[0]} / ${title[1]}`), alignment: 'right', fontSize: 12 }, { text: s.documentNumber, alignment: 'right', fontSize: 12 }], columnGap: 12, margin: [40, 20, 40, 0] },
    footer: (page, total) => ({ margin: [40, page === total ? 8 : bottomMargin - 28, 40, 0], stack: [
      ...(page === total ? [signatures(s)] : []),
      { text: `${s.syntheticTest ? 'TEST - ' : ''}${s.documentNumber} | หน้า / Page ${page} / ${total}`, fontSize: 11, color: '#000000', alignment: 'right', margin: [0, page === total ? 12 : 0, 0, 0] },
    ] }),
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

const buddhistDate = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
});
const buddhistDateTime = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  second: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Bangkok',
});
function calendarDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : undefined;
}
/** Presentation only: ISO snapshots/numbering stay Gregorian; unknown values stay exact. */
export function formatDocumentDate(value: string): string {
  const range = /^(\d{4}-\d{2}-\d{2})\s+[-–]\s+(\d{4}-\d{2}-\d{2})$/.exec(value);
  if (range) {
    const start = calendarDate(range[1]!);
    const end = calendarDate(range[2]!);
    return start && end ? `${buddhistDate.format(start)} - ${buddhistDate.format(end)}` : value;
  }
  const date = calendarDate(value);
  if (date) return buddhistDate.format(date);
  const timestamp = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!timestamp || !calendarDate(timestamp[1]!)) return value;
  const instant = new Date(value);
  return Number.isFinite(instant.getTime()) ? `${buddhistDateTime.format(instant)} (Asia/Bangkok)` : value;
}
