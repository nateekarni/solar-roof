import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  documentDefinition,
  type DocumentSnapshot,
} from './document-layout.js';
const require = createRequire(import.meta.url);
export const fixtureFonts = Object.fromEntries(
  ['normal', 'bold', 'italics', 'bolditalics'].map((style, i) => [
    style,
    fileURLToPath(
      new URL(
        `../../../assets/fonts/th-sarabun-new/${['THSarabunNew.ttf', 'THSarabunNew Bold.ttf', 'THSarabunNew Italic.ttf', 'THSarabunNew BoldItalic.ttf'][i]}`,
        import.meta.url,
      ),
    ),
  ]),
);
export function refinementFixtures(): Record<string, DocumentSnapshot> {
  const base: DocumentSnapshot = {
    type: 'invoice',
    documentNumber: 'INV2026100001',
    issueDate: '2026-10-08',
    issuer: {
      name: 'บริษัท โซลาร์ รูฟ จำกัด',
      address:
        '68/184 ซอยรามคำแหง 164 แขวงมีนบุรี เขตมีนบุรี กรุงเทพมหานคร 10510',
      taxId: '0105554059286',
      branch: '00000',
      phone: '02-000-0000',
      email: 'billing@solar-roof.example.test',
    },
    customer: {
      name: 'บริษัท ลูกค้าทดสอบเอกสาร จำกัด',
      address: '123 ถนนทดสอบ แขวงทดสอบ เขตทดสอบ กรุงเทพมหานคร 10110',
      taxId: '0105554059286',
      branch: '00000',
    },
    siteName: 'อาคารเรียนหนึ่ง',
    siteExternalId: 'SITE-001',
    contractNumber: '8a9c0caf-317c-44e4-8dac-bdc686c2d8a23',
    period: '2020-06-01 - 2020-06-30',
    dueDate: '2026-11-07',
    paymentTerms: 'ชำระภายใน 30 วัน (ข้อมูลสมมติสำหรับทดสอบ)',
    paymentAccounts: [
      {
        bankName: 'ธนาคารทดสอบ',
        accountName: 'บริษัท โซลาร์ รูฟ จำกัด (ทดสอบ)',
        accountNumber: '000-0-00000-0',
      },
    ],
    signatories: {},
    rates: [],
    items: [
      {
        description: 'ค่าไฟฟ้าพลังงานแสงอาทิตย์ / Solar electricity charges',
        period: '2020-06-01 - 2020-06-30',
        quantity: '1234.567',
        rate: '3.5000',
        amount: '4320.98',
      },
    ],
    totals: {
      subtotal: '4320.98',
      tax: '302.47',
      taxLabel: 'ภาษีทดสอบ 7% / Simulated tax 7%',
      total: '4623.45',
    },
    approvedTransfers: [
      {
        paidAt: '2026-10-08T06:10:29Z',
        amount: '4623.45',
        evidence:
          'document-channels-synthetic-9daba5b1-5049-44c3-89ef-b2323cd60ae6',
        status: 'approved',
      },
    ],
    logoDataUri: `data:image/png;base64,${readFileSync(new URL('../../../../web/public/brand/solar-roof-document.png', import.meta.url)).toString('base64')}`,
    templateVersion: 'sarabun-a4-v3',
    syntheticTest: true,
  };
  const { totals, ...contractBase } = base;
  const contract: DocumentSnapshot = {
    ...contractBase,
    type: 'contract',
    documentNumber: 'PPA2026100001',
    templateVersion: 'ppa-th-sarabun-new-v2',
    items: [],
    startDate: '2026-01-01',
    endDate: '2046-12-31',
    paymentTermDays: 30,
    rates: [
      { startDate: '2026-01-01', endDate: '2026-12-31', rate: '4.1234' },
      { startDate: '2027-01-01', rate: '3.9876' },
    ],
    signatories: {
      issuer: { name: 'นายผู้ขาย โครงการทดสอบ', title: 'กรรมการผู้มีอำนาจ' },
      customer: { name: 'นายผู้ซื้อ องค์กรทดสอบ', title: 'ผู้แทนองค์กร' },
    },
  };
  return {
    contract,
    invoice: base,
    receipt: { ...base, type: 'receipt', documentNumber: 'RCT2026100001' },
    'long-contract': {
      ...contract,
      endDate: '2085-12-31',
      rates: Array.from({ length: 60 }, (_, i) => ({
        startDate: `${2026 + i}-01-01`,
        endDate: `${2026 + i}-12-31`,
        rate: `4.${String(i).padStart(4, '0')}`,
      })),
    },
    'long-invoice': {
      ...base,
      items: Array.from({ length: 45 }, (_, i) => ({
        ...base.items[0]!,
        description: `ROW-${i + 1} ค่าไฟฟ้าพลังงานแสงอาทิตย์ / Solar electricity charges`,
      })),
    },
    'long-receipt': {
      ...base,
      type: 'receipt',
      documentNumber: 'RCT2026100002',
      approvedTransfers: Array.from({ length: 35 }, (_, i) => ({
        ...base.approvedTransfers[0]!,
        evidence: `TRANSFER-${i + 1}`,
      })),
    },
    'long-identity': {
      ...contract,
      issuer: {
        ...base.issuer,
        name: 'บริษัทโซลาร์รูฟทดสอบชื่อภาษาไทยที่ยาวมากและไม่มีเว้นวรรคเพื่อทดสอบการตัดบรรทัด',
        address:
          'ที่อยู่ภาษาไทยที่ยาวมากและไม่มีเว้นวรรคเพื่อยืนยันว่าข้อมูลไม่ล้นออกนอกหน้ากระดาษ',
      },
      customer: { ...base.customer, address: base.customer.address.repeat(3) },
      signatories: {
        issuer: {
          name: 'ผู้ลงนามฝ่ายผู้ขายโครงการทดสอบและตรวจสอบการจัดบรรทัดรายชื่อที่ยาวมาก'.repeat(
            2,
          ),
          title: 'กรรมการผู้มีอำนาจลงนามตามข้อมูลสัญญา',
        },
        customer: {
          name: 'ผู้ลงนามฝ่ายผู้ซื้อโครงการทดสอบและตรวจสอบการจัดบรรทัดรายชื่อที่ยาวมาก'.repeat(
            2,
          ),
          title: 'ผู้แทนองค์กรตามข้อมูลสัญญา',
        },
      },
    },
    'oversized-row': {
      ...base,
      items: [
        {
          ...base.items[0]!,
          description: Array.from(
            { length: 100 },
            (_, i) => `LINE-${i + 1} ข้อมูลรายละเอียดที่ต้องแสดงครบถ้วน`,
          ).join('\n'),
          quantity: '90071992547409.123',
          rate: '12345.6789',
          amount: '90071992547409.91',
        },
      ],
    },
  };
}
/** Actual pdfmake layout, without an external parser or test-only production hooks. */
export function layoutDocumentPages(snapshot: DocumentSnapshot): any[] {
  const PDFDocument = require('pdfmake/js/PDFDocument.js').default;
  const LayoutBuilder = require('pdfmake/js/LayoutBuilder.js').default;
  const { tableLayouts } = require('pdfmake/js/tableLayouts.js');
  const d = documentDefinition(snapshot);
  const doc = new PDFDocument(
    { THSarabunNew: fixtureFonts },
    {},
    {},
    {},
    { autoFirstPage: false },
  );
  const [left, top, right, bottom] = d.pageMargins;
  const builder = new LayoutBuilder(
    { width: 595.28, height: 841.89 },
    { left, top, right, bottom },
  );
  builder.registerTableLayouts(tableLayouts);
  try {
    return builder.layoutDocument(
      d.content,
      doc,
      {},
      d.defaultStyle,
      undefined,
      d.header,
      d.footer,
    );
  } finally {
    doc.end();
    doc.resume();
  }
}
export const pageLines = (page: any): any[] =>
  page.items
    .filter((item: any) => item.type === 'line')
    .map((item: any) => item.item);
export const lineText = (line: any): string =>
  line.inlines
    .map((inline: any) => inline.text)
    .join('')
    .replaceAll('\u200b', '');
