import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { BRAND_PRIMARY } from "@solar/domain";

export interface DocumentParty {
  name: string;
  address: string;
  taxId: string;
  branch?: string;
  phone?: string;
  email?: string;
}
export interface DocumentSignatory {
  name?: string;
  title?: string;
  signatureDataUri?: string;
  signatureDate?: string;
}
/** Frozen input only: never fetch current settings, identities or rates during rendering. */
export interface DocumentSnapshot {
  type: "contract" | "invoice" | "receipt";
  documentNumber: string;
  issueDate: string;
  issuer: DocumentParty;
  customer: DocumentParty;
  brandPrimary?: string;
  invoiceNumber?: string;
  capacityKwp?: string;
  ppaOpening?: string;
  ppaClauses?: { number: number; title: string; body: string }[];
  remarks?: string[];
  siteName?: string;
  siteExternalId?: string | undefined;
  startDate?: string;
  endDate?: string | undefined;
  paymentTermDays?: number | null | undefined;
  contractNumber?: string;
  period?: string;
  signatories: { issuer?: DocumentSignatory; customer?: DocumentSignatory };
  rates: { startDate: string; endDate?: string; rate: string }[];
  items: {
    description: string;
    period?: string;
    quantity: string;
    unit?: string;
    rate: string;
    amount: string;
  }[];
  totals?: { subtotal: string; tax?: string; taxLabel?: string; total: string };
  approvedTransfers: {
    payerName?: string;
    /** promptpay is retained only for frozen pre-v9 snapshots. */
    paymentMethod?: "bank_transfer" | "cash" | "promptpay";
    transferChannel?: "bank_account" | "promptpay";
    originBank?: string;
    originAccount?: string;
    paidAt: string;
    amount: string;
    evidence?: string;
    status: "paid" | "approved";
  }[];
  outstandingBills?: {
    bills: {
      period: string;
      billedAmount: string;
      paidAmount: string;
      remainingAmount: string;
    }[];
    totalOutstanding: string;
  };
  paymentAccounts: {
    bankName: string;
    accountName: string;
    accountNumber: string;
    branchName?: string;
    accountType?: string;
    promptPayId?: string;
    qrImageDataUri?: string;
  }[];
  dueDate?: string;
  paymentTerms?: string;
  approver?: { name?: string; role?: string; approvedAt?: string } | null;
  letterNumber?: string;
  contractSignedDate?: string;
  serviceStartDate?: string;
  installmentIndex?: number;
  totalInstallments?: number;
  recipientTitle?: string;
  customerProvince?: string;
  dailyEnergy?: {
    day: number;
    date?: string;
    totalKwh?: string;
    onPeakKwh?: string;
    offPeakKwh?: string;
  }[];
  energySummary?: {
    totalKwh: string;
    onPeakKwh: string;
    offPeakKwh: string;
  };
  logoDataUri: string;
  templateVersion: string;
  syntheticTest: boolean;
}
// pdfmake's definition is intentionally kept at the rendering boundary.
export interface DocumentDefinition {
  pageSize: "A4";
  pageOrientation: "portrait";
  pageMargins: number[];
  defaultStyle: {
    font: string;
    fontSize: number;
    color: string;
    lineHeight: number;
  };
  content: any[];
  header: (page: number) => any;
  footer: (page: number, total: number) => any;
  info: { title: string; subject: string };
}

function moneyParts(value: string): [string, string] {
  if (typeof value !== "string" || !/^\d+(\.\d+)?$/.test(value))
    throw new Error("Exact nonnegative money required");
  const [whole, fraction = ""] = value.split(".");
  if (/[1-9]/.test(fraction.slice(2)))
    throw new Error("Money must be whole satang");
  return [whole!.replace(/^0+(?=\d)/, ""), fraction.padEnd(2, "0").slice(0, 2)];
}
export function formatDocumentMoney(value: string): string {
  const [whole, fraction] = moneyParts(value);
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}
export function formatDisplayDecimal(value: string): string {
  if (typeof value !== "string" || !/^\d+(\.\d+)?$/.test(value))
    throw new Error("Exact nonnegative decimal required");
  const [whole = "0", fraction = ""] = value.split(".");
  const formattedWhole = (whole.replace(/^0+(?=\d)/, "") || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  let formattedFraction = fraction;
  if (fraction.length < 2) {
    formattedFraction = fraction.padEnd(2, "0");
  }
  return `${formattedWhole}.${formattedFraction}`;
}
function exactDecimal(value: string): string {
  if (typeof value !== "string" || !/^\d+(\.\d+)?$/.test(value))
    throw new Error("Exact nonnegative decimal required");
  return value;
}
const thaiDigits: Record<string, string> = {
  "0": "",
  "1": "หนึ่ง",
  "2": "สอง",
  "3": "สาม",
  "4": "สี่",
  "5": "ห้า",
  "6": "หก",
  "7": "เจ็ด",
  "8": "แปด",
  "9": "เก้า",
};
function thaiInteger(value: string, hasHigherGroup = false): string {
  const normalized = value.replace(/^0+(?=\d)/, "");
  if (normalized === "0") return "ศูนย์";
  if (normalized.length > 6) {
    const low = normalized.slice(-6);
    return `${thaiInteger(normalized.slice(0, -6))}ล้าน${/^0+$/.test(low) ? "" : thaiInteger(low, true)}`;
  }
  const units = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];
  return [...normalized]
    .map((digit, index) => {
      const power = normalized.length - index - 1;
      if (digit === "0") return "";
      if (power === 1)
        return `${digit === "1" ? "" : digit === "2" ? "ยี่" : thaiDigits[digit]}สิบ`;
      if (
        power === 0 &&
        digit === "1" &&
        (normalized.length > 1 || hasHigherGroup)
      )
        return "เอ็ด";
      return `${thaiDigits[digit]}${units[power]}`;
    })
    .join("");
}
export function thaiAmountWords(value: string): string {
  const [whole, fraction] = moneyParts(value);
  return `${thaiInteger(whole)}บาท${fraction === "00" ? "ถ้วน" : `${thaiInteger(fraction)}สตางค์`}`;
}
const thaiWords = new Intl.Segmenter("th", { granularity: "word" });
function printableText(
  text: string,
): string | { text: string; fontSize?: number; opacity?: number }[] {
  if (!/[\u0e00-\u0e7f]/.test(text)) return text;
  // SIPA 1.35 has no U+200B glyph. Invisible, zero-size break inlines let pdfmake
  // wrap at Thai word boundaries without printing .notdef boxes or changing fonts.
  return [...thaiWords.segment(text)].flatMap((part) =>
    /[\u0e00-\u0e7f]/.test(part.segment)
      ? [{ text: part.segment }, { text: "\u200b", fontSize: 0, opacity: 0 }]
      : [{ text: part.segment }],
  );
}
const bodyText = (text: string, extra: any = {}) => ({
  text: printableText(text),
  ...extra,
});
const section = (text: string, margin = [0, 2, 0, 3]) =>
  bodyText(text, {
    bold: true,
    fontSize: 18,
    margin,
  });
function party(p: DocumentParty, thaiOnly = false): any {
  return {
    stack: [
      bodyText(p.name, { bold: true }),
      bodyText(p.address),
      bodyText(
        `${thaiOnly ? 'เลขประจำตัวผู้เสียภาษี' : 'เลขประจำตัวผู้เสียภาษี / Tax ID'}: ${p.taxId}${p.branch ? ` (${p.branch})` : ""}`,
      ),
      ...(p.phone ? [bodyText(`${thaiOnly ? 'โทร' : 'โทร / Tel'}: ${p.phone}`)] : []),
      ...(p.email ? [bodyText(p.email)] : []),
    ],
  };
}
function tint(primary: string, white: number): string {
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(
          parseInt(primary.slice(i, i + 2), 16) * (1 - white) + 255 * white,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
const border = "#d9dde1";
function table(
  headers: string[],
  rows: any[][],
  widths: (string | number)[],
  primary: string,
  caption?: string,
): any {
  return {
    margin: [0, 8, 0, 6],
    table: {
      headerRows: caption ? 2 : 1,
      keepWithHeaderRows: 0,
      dontBreakRows: false,
      widths,
      body: [
        ...(caption
          ? [
              [
                bodyText(caption, {
                  bold: true,
                  colSpan: headers.length,
                  fillColor: tint(primary, 0.65),
                }),
                ...headers.slice(1).map(() => ({})),
              ],
            ]
          : []),
        headers.map((text) =>
          bodyText(text, { bold: true, fillColor: tint(primary, 0.35) }),
        ),
        ...rows,
      ],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => border,
      vLineColor: () => border,
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 3,
      paddingBottom: () => 3,
    },
  };
}
const right = (text: string) => ({ text, alignment: "right", noWrap: true });
function cards(left: any[], right: any[]): any {
  return {
    margin: [0, 3, 0, 3],
    table: {
      widths: ["*", "*"],
      dontBreakRows: false,
      body: [
        [
          { stack: left, fillColor: "#f3f4f5" },
          { stack: right, fillColor: "#f3f4f5" },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i: number) => (i === 1 ? 10 : 0),
      vLineColor: () => "#ffffff",
      paddingLeft: () => 9,
      paddingRight: () => 9,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
  };
}
function signatures(s: DocumentSnapshot): any {
  const contract = s.type === "contract";
  const receipt = s.type === "receipt";
  const issuer = s.signatories.issuer;
  const customer = s.signatories.customer;
  const centered = (text: string, margin?: number[]) =>
    bodyText(text, { alignment: "center", ...(margin ? { margin } : {}) });
  const left = (text: string, margin?: number[]) =>
    receipt ? { text: "" } : centered(text, margin);
  const issuerDate = issuer?.signatureDate || s.approver?.approvedAt || (s.type === 'invoice' && s.approver ? s.issueDate : undefined);
  const formatSignatoryDate = (dateStr?: string,full=false) => {
    if (!dateStr) return "____________________";
    const value=full?dateStr:dateStr.slice(0,10);
    return formatDocumentDate(value) || value;
  };
  if(!contract){
    if(s.templateVersion==='sarabun-a4-v12'){
      const signature=issuer?.signatureDataUri?{image:issuer.signatureDataUri,fit:[120,45],alignment:"center",margin:[0,10,0,4]}:centered("________________________",[0,10,0,4]);
      return {fontSize:14,table:{widths:["*"],body:[
        [signature],
        ...(issuer?.name?[[centered(issuer.name)]]:[]),
        [centered(receipt?"ผู้รับเงิน":"ผู้ออกใบวางบิล")],
        [centered(issuerDate?`วันที่: ${formatSignatoryDate(issuerDate,true)}`:"วันที่: ____________________",[0,4,0,0])],
      ]},layout:{hLineWidth:()=>0,vLineWidth:()=>0,paddingLeft:()=>0,paddingRight:()=>0,paddingTop:()=>0,paddingBottom:()=>0}};
    }
    if(!receipt){
      return {fontSize:14,table:{widths:["*","*"],body:[
        [centered("________________________",[0,10,0,4]),centered("________________________",[0,10,0,4])],
        [centered("ผู้วางบิล"),centered("ผู้รับวางบิล")],
        [centered("วันที่: ____________________",[0,4,0,0]),centered("วันที่: ____________________",[0,4,0,0])],
      ]},layout:{hLineWidth:()=>0,vLineWidth:()=>0,paddingLeft:()=>0,paddingRight:()=>0,paddingTop:()=>0,paddingBottom:()=>0}};
    }
    const signature=issuer?.signatureDataUri?{image:issuer.signatureDataUri,fit:[120,45],alignment:"center",margin:[0,10,0,4]}:centered("________________________",[0,10,0,4]);
    return {fontSize:14,table:{widths:["*"],body:[
      [signature],
      ...(issuer?.name?[[centered(issuer.name)]]:[]),
      ...(issuer?.title?[[centered(issuer.title)]]:[]),
      [centered("ผู้รับเงิน")],
      [centered(issuerDate?`วันที่: ${formatSignatoryDate(issuerDate)}`:"วันที่: ____________________",[0,4,0,0])],
    ]},layout:{hLineWidth:()=>0,vLineWidth:()=>0,paddingLeft:()=>0,paddingRight:()=>0,paddingTop:()=>0,paddingBottom:()=>0}};
  }
  return {
    fontSize: 14,
    table: {
      widths: ["*", "*"],
      body: [
        [
          !receipt && issuer?.signatureDataUri ? {image:issuer.signatureDataUri,fit:[120,45],alignment:"center",margin:[0,10,0,4]} : left("________________________", [0, 10, 0, 4]),
          (receipt ? issuer : customer)?.signatureDataUri ? {image:(receipt ? issuer : customer)!.signatureDataUri,fit:[120,45],alignment:"center",margin:[0,10,0,4]} : centered("________________________", [0, 10, 0, 4]),
        ],
        ...(issuer?.name || customer?.name
          ? [
              [
                left(issuer?.name ?? ""),
                centered(
                  receipt ? (issuer?.name ?? "") : (customer?.name ?? ""),
                ),
              ],
            ]
          : []),
        ...(issuer?.title || customer?.title
          ? [
              [
                left(issuer?.title ?? ""),
                centered(
                  receipt ? (issuer?.title ?? "") : (customer?.title ?? ""),
                ),
              ],
            ]
          : []),
        [
          left(
            contract
              ? "ผู้ลงนามฝ่ายผู้ขาย / Provider signatory"
              : "ผู้อนุมัติออกเอกสาร",
          ),
          centered(
            contract
              ? "ผู้ลงนามฝ่ายผู้ซื้อ / Customer signatory"
              : receipt
                ? "ผู้รับเงิน"
                : "ผู้รับวางบิล",
          ),
        ],
        ...(contract
          ? [[centered(s.issuer.name), centered(s.customer.name)]]
          : []),
        [
          left(
            receipt
              ? ""
              : issuerDate
                ? `วันที่ลงนาม: ${formatSignatoryDate(issuerDate)}`
                : "วันที่ลงนาม: ____________________",
            [0, 4, 0, 0],
          ),
          centered(
            receipt
              ? issuerDate
                ? `วันที่อนุมัติ: ${formatSignatoryDate(issuerDate)}`
                : "วันที่อนุมัติ: ____________________"
              : customer?.signatureDate
                ? `วันที่ลงนาม: ${formatSignatoryDate(customer.signatureDate)}`
                : "วันที่ลงนาม: ____________________",
            [0, 4, 0, 0],
          ),
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: (c: number) => (c === 0 ? 0 : 12),
      paddingRight: (c: number) => (c === 0 ? 12 : 0),
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
  };
}
/** Measure with the same pdfmake engine/font so wrapped headers and signatures reserve real space.
 * This small internal-API boundary is covered by actual page geometry regressions. */
function blockHeight(
  block: any,
  style: DocumentDefinition["defaultStyle"],
  horizontalMargin = 40,
): number {
  const PDFDocument = require("pdfmake/js/PDFDocument.js").default;
  const LayoutBuilder = require("pdfmake/js/LayoutBuilder.js").default;
  const doc = new PDFDocument(
    { THSarabunNew: fonts },
    {},
    {},
    {},
    { autoFirstPage: false },
  );
  const builder = new LayoutBuilder(
    { width: 595.28, height: Infinity },
    { left: horizontalMargin, top: 0, right: horizontalMargin, bottom: 0 },
  );
  try {
    const pages = builder.layoutDocument(cloneLayout(block), doc, {}, style);
    return Math.ceil(
      Math.max(
        0,
        ...pages[0].items.flatMap((item: any) =>
          item.type === "line"
            ? [item.item.y + item.item.getHeight()]
            : item.type === "image"
              ? [item.item.y + item.item._height]
              : [],
        ),
      ),
    );
  } finally {
    doc.end();
    doc.resume();
  }
}
/** Financial presentation consumes only frozen facts; contracts keep their established layout. */
function cloneLayout(value:any):any {
  if(Array.isArray(value))return value.map(cloneLayout);
  if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,cloneLayout(child)]));
  return value;
}
function financialDefinition(s: DocumentSnapshot): DocumentDefinition {
  const primary = s.brandPrimary ?? BRAND_PRIMARY;
  if (!/^#[0-9a-f]{6}$/i.test(primary)) throw new Error("Frozen primary must be an sRGB hex color");
  const defaultStyle = {font:"THSarabunNew",fontSize:11,color:"#000000",lineHeight:0.85};
  const title = s.type === "receipt" ? "ใบเสร็จรับเงิน / ใบกำกับภาษี" : "ใบวางบิล";
  const sign = {...signatures(s),fontSize:10};
  const signatureSpace=blockHeight(sign,defaultStyle,10);
  const bottomMargin=signatureSpace+30;
  if(bottomMargin>=750) throw new Error("Signature block exceeds A4 capacity");
  const head={columns:[
    {width:65,image:s.logoDataUri,fit:[65,48]},
    {width:"*",text:""},
    {width:245,alignment:"right",stack:[bodyText(title,{bold:true,fontSize:14}),bodyText(`เลขที่: ${s.documentNumber}`,{bold:true,fontSize:11.3}),bodyText(`วันที่: ${formatDocumentDate(s.issueDate)}`),...(s.type==='invoice'&&s.dueDate?[bodyText(`กำหนดชำระ: ${formatDocumentDate(s.dueDate)}`)]:[]),...(s.type==='receipt'?[bodyText(`ใบวางบิล: ${s.invoiceNumber||'-'}`)]:[])]}
  ],columnGap:8,margin:[0,0,0,5]};
  const content:any[]=[head];
  const financialParty=(p:DocumentParty)=>({stack:[bodyText(p.name,{bold:true}),bodyText(`เลขประจำตัวผู้เสียภาษี: ${p.taxId}${p.branch?` (${p.branch})`:''}`),bodyText(p.address),...(p.phone||p.email?[bodyText([p.phone?`โทร: ${p.phone}`:'',p.email||''].filter(Boolean).join(' / '))]:[])]});
  content.push({columns:[{width:'*',stack:[bodyText('ข้อมูลบริษัท',{bold:true}),financialParty(s.issuer)]},{width:'*',stack:[bodyText('ข้อมูลลูกค้า',{bold:true}),financialParty(s.customer)]}],fontSize:10.3,columnGap:16,margin:[0,0,0,5]});
  content.push({columns:[bodyText(`ไซต์งาน: ${s.siteName||'-'}`),bodyText(`รอบบิล: ${s.period?formatDocumentDate(s.period):'-'}`,{alignment:'right'})],margin:[0,0,0,4]});
  const neutralBorder="#d9dde1";
  const rule={hLineWidth:()=>0.28,vLineWidth:()=>0.28,hLineColor:()=>neutralBorder,vLineColor:()=>neutralBorder,paddingLeft:()=>4.8,paddingRight:()=>4.8,paddingTop:()=>2,paddingBottom:()=>2};
  // Fixed ordinary widths keep the reference rhythm. Exceptionally large exact numbers
  // claim measured space rather than overflowing or rounding the frozen values.
  const widthFor=(values:string[],minimum:number)=>Math.max(minimum,...values.map(text=>blockWidth(text,11)+9.6));
  const quantityWidth=widthFor(s.items.map(i=>formatDisplayDecimal(i.quantity)),55);
  const totalsLabels = s.totals ? ['ยอดก่อนภาษี', 'ภาษี', s.type === 'receipt' ? 'ยอดชำระเงินทั้งสิ้น' : 'ยอดรวม', ...(s.totals.taxLabel ? [s.totals.taxLabel.split(' / ')[0]!] : [])] : [];
  const rateWidth=Math.max(
    widthFor(s.items.map(i=>formatDisplayDecimal(i.rate)), 65),
    ...totalsLabels.map(text => blockWidth(text, 11) + 9.6)
  );
  const totalsValues = s.totals ? [s.totals.subtotal, s.totals.tax ?? '', s.totals.total].filter(Boolean).map(v => `${formatDocumentMoney(v)} บาท`) : [];
  const amountWidth=Math.max(
    widthFor(s.items.map(i=>formatDocumentMoney(i.amount)), 65),
    ...totalsValues.map(text => blockWidth(text, 11) + 9.6)
  );
  const grid:any={
    margin:[0,0,0,0],
    table:{
      headerRows:1,
      keepWithHeaderRows:0,
      dontBreakRows:false,
      widths:[28,'*',quantityWidth,38,rateWidth,amountWidth],
      body:[
        ['ลำดับ','รายการ','จำนวน','หน่วย','ราคาต่อหน่วย','จำนวนเงิน'].map((text, idx)=>bodyText(text,{bold:true,fontSize:9.7,fillColor:'#f5f5f7',alignment:idx===1?'left':'center'})),
        ...s.items.map((i,index)=>[
          bodyText(String(index+1),{alignment:'center'}),
          bodyText(`${i.description}${i.period?` (${formatDocumentDate(i.period)})`:''}`),
          right(formatDisplayDecimal(i.quantity)),
          bodyText(i.unit||'—',{alignment:'center'}),
          right(formatDisplayDecimal(i.rate)),
          right(formatDocumentMoney(i.amount))
        ])
      ]
    },
    layout:{...rule,hLineWidth:(i:number)=>i===0?1.19:0.28,hLineColor:(i:number)=>i===0?primary:neutralBorder}
  };
  content.push(grid);
  let totals:any;
  if(s.totals){
    const rows:any[][]=[['ยอดก่อนภาษี',s.totals.subtotal],...(s.totals.tax===undefined?[]:[[s.totals.taxLabel?.split(' / ')[0]||'ภาษี',s.totals.tax]]),[s.type==='receipt'?'ยอดชำระเงินทั้งสิ้น':'ยอดรวม',s.totals.total]].map(([label,value],index,all)=>[
      index===0?bodyText(thaiAmountWords(s.totals!.total),{rowSpan:all.length,fillColor:'#ffffff',bold:true,margin:[0,4,0,0]}):{},
      bodyText(label!,{bold:index===all.length-1,fillColor:'#ffffff',color:'#000000',alignment:'right'}),
      {...right(`${formatDocumentMoney(value!)} บาท`),bold:index===all.length-1,fillColor:'#ffffff',color:'#000000'}
    ]);
    totals={unbreakable:true,table:{widths:['*',rateWidth,amountWidth],body:rows},layout:rule,margin:[0,0,0,0]};
    content.push(totals);
  }
  const heading=(text:string)=>bodyText(text,{bold:true,fontSize:11,margin:[0,0,0,2]});
  const hasOutstandingBills=s.type==='receipt'&&Boolean(s.outstandingBills?.bills.length);
  if(hasOutstandingBills){
    const outstanding=s.outstandingBills!;
    content.push({
      unbreakable:true,
      table:{
        headerRows:1,
        widths:[28,'*','auto','auto','auto'],
        body:[
          ['ลำดับ','รอบบิล','ยอดเรียกเก็บ','ชำระแล้ว','ยอดค้างชำระ'].map((text,index)=>bodyText(text,{bold:true,fontSize:9.4,fillColor:'#f5f5f7',alignment:index===1?'left':'center'})),
          ...outstanding.bills.map((bill,index)=>[
            bodyText(String(index+1),{alignment:'center'}),
            bodyText(bill.period),
            right(formatDocumentMoney(bill.billedAmount)),
            right(formatDocumentMoney(bill.paidAmount)),
            right(formatDocumentMoney(bill.remainingAmount)),
          ]),
        ],
      },
      layout:{...rule,hLineWidth:(i:number)=>i===0?1.19:0.28,hLineColor:(i:number)=>i===0?primary:neutralBorder},
      margin:[0,8,0,0],
    });
    content.push(bodyText(`คงเหลืออีก ${outstanding.bills.length} บิล รวมยอดค้างชำระ ${formatDocumentMoney(outstanding.totalOutstanding)} บาท`,{bold:true,margin:[4,3,4,0]}));
  }
  const remarks=[heading('หมายเหตุ'),...(s.remarks?.length?s.remarks.map(r=>bodyText(r)):[bodyText(s.paymentTerms||'-')])];
  const payments=s.approvedTransfers.filter(p=>p.status==='paid'||p.status==='approved').map((p,index)=>({stack:[...(s.approvedTransfers.length>1?[bodyText(`การชำระ ${index+1}`,{bold:true})]:[]),bodyText(`ช่องทาง: ${p.paymentMethod==='cash'?'เงินสด':p.paymentMethod==='promptpay'||p.transferChannel==='promptpay'?'พร้อมเพย์':p.paymentMethod==='bank_transfer'?'โอนเงินผ่านธนาคาร':'-'} / ผู้ชำระ: ${p.payerName||'-'}`),bodyText(`ธนาคารต้นทาง: ${p.originBank||'-'} / บัญชีต้นทาง: ${p.originAccount||'-'}`),bodyText(`ชำระ: ${formatDocumentDate(p.paidAt)}`),bodyText(`จำนวนเงิน: ${formatDocumentMoney(p.amount)} บาท`),bodyText(`หลักฐาน: ${p.evidence||'-'}`)],margin:[0,0,0,4]}));
  const lower=s.type==='receipt'?{stack:[heading('ข้อมูลการชำระเงิน'),...payments,{columns:[{width:'*',stack:remarks},{width:'*',text:''}],columnGap:16}],margin:[4,10,4,0]}:{columns:[{width:'*',stack:[heading('บัญชีรับชำระ'),...(s.paymentAccounts.length?s.paymentAccounts.map(b=>bodyText(`${b.bankName}\n${b.accountName}\n${b.accountNumber}`)):[bodyText('-')])]},{width:'*',stack:remarks}],columnGap:16,margin:[4,10,4,0]};
  content.push(lower);
  // Add whitespace only when the complete short document fits. The same engine
  // measures parties, rows and lower facts, so long inputs receive no spacer.
  const continuation={columns:[{width:32,image:s.logoDataUri,fit:[32,26]},{width:'*',alignment:'right',stack:[bodyText(title,{bold:true}),bodyText(s.documentNumber)]}],columnGap:12};
  const topMargin=Math.max(10,12+blockHeight(continuation,defaultStyle,10)+8);
  head.margin=[0,10-topMargin,0,5];
  if(!hasOutstandingBills){
    const usableHeight=841.89-topMargin-bottomMargin;
    const naturalHeight=blockHeight(content,defaultStyle,10);
    const filler=Math.max(0,Math.min(220,Math.floor(usableHeight-naturalHeight-10)));
    if(filler>0) grid.table.body.push([
      bodyText('',{colSpan:6,margin:[0,0,0,filler]}),{},{},{},{},{}
    ]);
  }
  return {pageSize:'A4',pageOrientation:'portrait',pageMargins:[10,topMargin,10,bottomMargin],defaultStyle,content,info:{title:s.documentNumber,subject:s.templateVersion},header:page=>page===1?null:{...continuation,margin:[10,12,10,0]},footer:(page,total)=>({margin:[10,8,10,0],stack:[...(page===total?[sign]:[{canvas:[],margin:[0,signatureSpace,0,0]}]),bodyText(`หน้า ${page} / ${total}`,{fontSize:8,alignment:'right',margin:[0,4,0,0]})]})};
}
function blockWidth(text:string,size:number):number {
  const PDFDocument=require('pdfmake/js/PDFDocument.js').default;
  const doc=new PDFDocument({THSarabunNew:fonts},{},{},{},{autoFirstPage:false});
  try{return doc.provideFont('THSarabunNew',false,false).widthOfString(text,size);}finally{doc.end();doc.resume();}
}
export function documentDefinition(s: DocumentSnapshot): DocumentDefinition {
  if (s.type === "contract") return contractDefinition(s);
  if (s.type === "invoice" && s.templateVersion === SOLAR_LEASING_PACKET_TEMPLATE_VERSION) {
    return solarLeasingPacketDefinition(s);
  }
  return financialDefinition(s);
}
function contractDefinition(s: DocumentSnapshot): DocumentDefinition {
  const title =
    s.type === "contract"
      ? ["สัญญาซื้อขายไฟฟ้า", "Power Purchase Agreement (PPA)"]
      : s.type === "receipt"
        ? s.syntheticTest
          ? ["ใบเสร็จรับเงิน / ใบกำกับภาษี", ""]
          : ["ใบเสร็จรับเงิน / ใบกำกับภาษี", ""]
        : ["ใบวางบิล", ""];
  const primary = s.brandPrimary ?? BRAND_PRIMARY;
  if (!/^#[0-9a-f]{6}$/i.test(primary))
    throw new Error("Frozen primary must be an sRGB hex color");
  const defaultStyle = {
    font: "THSarabunNew",
    fontSize: 16,
    color: "#000000",
    lineHeight: 1,
  };
  const signatureSpace = blockHeight(signatures(s), defaultStyle);
  const bottomMargin = signatureSpace + 32;
  if (bottomMargin >= 841.89 - 54 - 40)
    throw new Error("Signature block exceeds A4 capacity");
  const continuation = {
    columns: [
      { width: 32, image: s.logoDataUri, fit: [32, 26] },
      {
        width: "*",
        alignment: "right",
        fontSize: 14,
        stack: [
          bodyText(
            `${title[0]}${title[1] ? ` / ${title[1]}` : ""}`,
          ),
          bodyText(s.documentNumber),
        ],
      },
    ],
    columnGap: 12,
  };
  const topMargin = Math.max(
    40,
    12 + blockHeight(continuation, defaultStyle) + 8,
  );
  if (topMargin + bottomMargin >= 841.89 - 40)
    throw new Error("Continuation header exceeds A4 capacity");
  const metadata = [
    bodyText(`เลขที่: ${s.documentNumber}`),
    bodyText(`วันที่: ${formatDocumentDate(s.issueDate)}`),
    ...(s.type === "invoice" && s.dueDate
      ? [bodyText(`กำหนดชำระ: ${formatDocumentDate(s.dueDate)}`)]
      : []),
    ...(s.type === "receipt"
      ? [bodyText(`ใบวางบิล: ${s.invoiceNumber || "-"}`)]
      : []),
    ...(s.type === "contract" && s.startDate
      ? [
          bodyText(
            `วันเริ่มมีผล / Effective start: ${formatDocumentDate(s.startDate)}`,
          ),
        ]
      : []),
  ];
  const content: any[] = [
    {
      columns: [
        { width: 65, image: s.logoDataUri, fit: [65, 70] },
        { width: "*", text: "" },
        {
          width: 245,
          alignment: "right",
          stack: [
            bodyText(title[0]!, { fontSize: s.type === "receipt" ? 22 : 26, bold: true }),
            ...(title[1] ? [bodyText(title[1], { fontSize: 16 })] : []),
            {
              canvas: [
                {
                  type: "line",
                  x1: 135,
                  y1: 0,
                  x2: 190,
                  y2: 0,
                  lineWidth: 1.5,
                  lineColor: primary,
                },
              ],
              margin: [0, 3, 0, 6],
            },
            {
              table: {
                widths: ["*"],
                body: [
                  [{ stack: metadata, fontSize: 14, fillColor: "#f3f4f5" }],
                ],
              },
              layout: {
                hLineWidth: () => 0,
                vLineWidth: () => 0,
                paddingLeft: () => 8,
                paddingRight: () => 8,
                paddingTop: () => 6,
                paddingBottom: () => 6,
              },
            },
          ],
        },
      ],
      columnGap: 10,
      margin: [0, 0, 0, 6],
    },
  ];
  if (s.syntheticTest)
    content.push(
      bodyText(
        s.type === "contract" && s.ppaClauses
          ? "SYNTHETIC LOCAL DRAFT / ร่างสัญญาทดสอบเฉพาะเครื่อง"
          : "SYNTHETIC LOCAL TEST - simulated tax 7%; no withholding / เอกสารทดสอบ",
        { fontSize: 14, italics: true, margin: [0, 0, 0, 5] },
      ),
    );
  const rates = () =>
    table(
      ["ตั้งแต่ / Start", "วันสิ้นสุด (รวมวันนั้น) / End inclusive", "THB/kWh"],
      s.rates.map((r) => [
        bodyText(formatDocumentDate(r.startDate)),
        bodyText(
          r.endDate
            ? formatDocumentDate(r.endDate)
            : "ไม่กำหนด / Not specified",
        ),
        right(exactDecimal(r.rate)),
      ]),
      ["*", "*", "auto"],
      primary,
    );
  if (s.type === "contract") {
    content.push({
      canvas: [
        {
          type: "line",
          x1: 0,
          y1: 0,
          x2: 515.28,
          y2: 0,
          lineWidth: 0.8,
          lineColor: primary,
        },
      ],
      margin: [0, 3, 0, 8],
    });
    // Frozen PPA clauses already contain the legal parties; do not duplicate or rebuild them.
    if (!s.ppaClauses?.length) content.push(cards(
      [section("ข้อมูลบริษัท / Company Information"), {...party(s.issuer), fontSize: 14}],
      [section("ข้อมูลลูกค้า / Customer Information"), {...party(s.customer), fontSize: 14}],
    ));
    if (s.ppaClauses?.length) {
      if (s.ppaOpening)
        content.push(bodyText(s.ppaOpening, { margin: [0, 0, 0, 4] }));
      for (const clause of s.ppaClauses) {
        // Keep the heading with a bounded lead paragraph; the remaining saved text
        // remains breakable, including clauses longer than an entire page.
        const paragraph = clause.body.split("\n")[0]!;
        const lead =
          paragraph.length <= 220
            ? paragraph
            : [...thaiWords.segment(paragraph)]
                .slice(0, 16)
                .map((part) => part.segment)
                .join("");
        content.push({
          unbreakable: true,
          stack: [
            section(`${clause.number}. ${clause.title}`, [0, 1, 0, 0]),
            bodyText(lead, { margin: [16, 0, 0, 0] }),
          ],
        });
        const remaining = clause.body.slice(lead.length).replace(/^\n/, "");
        if (remaining)
          content.push(bodyText(remaining, { margin: [16, 0, 0, 0] }));
        if (clause.number === 5) content.push(rates());
      }
    } else {
      content.push(
        section("สถานที่ติดตั้งระบบ / Site"),
        bodyText(
          `ไซต์งาน: ${s.siteName || "ไม่ระบุ"}${s.siteExternalId ? ` (${s.siteExternalId})` : ""}`,
        ),
        bodyText(
          `ขนาดกำลังการผลิต: ${s.capacityKwp === undefined ? "ไม่ระบุ / Not specified" : `${s.capacityKwp} kWp`}`,
        ),
      );
      if (s.contractNumber)
        content.push(bodyText(`สัญญา / Contract: ${s.contractNumber}`));
      if (s.startDate)
        content.push(
          bodyText(
            `วันเริ่มมีผล / Effective start: ${formatDocumentDate(s.startDate)}`,
          ),
        );
      if (s.endDate)
        content.push(
          bodyText(
            `วันสิ้นสุดสัญญา / Effective end: ${formatDocumentDate(s.endDate)}`,
          ),
        );
      content.push(
        section("อัตราค่าไฟฟ้า / Rates"),
        s.rates.length
          ? rates()
          : bodyText("ไม่มีอัตราค่าไฟที่บันทึกไว้ / No recorded rate schedule"),
      );
      if (s.paymentTermDays != null)
        content.push(
          bodyText(
            `ระยะเวลาชำระเงิน / Payment term: ${s.paymentTermDays} วัน / days`,
          ),
        );
      if (s.paymentTerms)
        content.push(bodyText(s.paymentTerms, { margin: [0, 6, 0, 0] }));
    }
  } else {
    const transfers = s.approvedTransfers.filter(
      (p) => p.status === "paid" || p.status === "approved",
    );
    const transferBlocks = transfers.map((p, i) => ({
      stack: [
        ...(transfers.length > 1
          ? [bodyText(`การชำระ ${i + 1}`, { bold: true })]
          : []),
        {columns:[bodyText(`ช่องทาง: ${p.paymentMethod === "promptpay" ? "พร้อมเพย์" : p.paymentMethod === "bank_transfer" ? "โอนเงินผ่านธนาคาร" : "-"}`),bodyText(`วัน/เวลา: ${p.paidAt ? formatDocumentDate(p.paidAt) : "-"}`)],columnGap:12},
        {columns:[bodyText(`จำนวนเงิน: ${formatDocumentMoney(p.amount)} บาท`),bodyText(`หลักฐาน: ${p.evidence || "-"}`)],columnGap:12},
      ],
      fontSize: 14,
      margin: [0, i ? 5 : 0, 0, 0],
    }));
    content.push(cards(
      [section("ข้อมูลบริษัท"),{...party(s.issuer,true),fontSize:14}],
      [section("ข้อมูลลูกค้า"),{...party(s.customer,true),fontSize:14}],
    ));
    content.push({columns:[bodyText(`ไซต์งาน: ${s.siteName || "-"}`),bodyText(`รอบบิล: ${s.period ? formatDocumentDate(s.period) : "-"}`,{alignment:"right"})],margin:[0,2,0,4]});
    content.push(
      table(
        ["ลำดับ", "รายการ", "จำนวน", "ราคาต่อหน่วย", "จำนวนเงิน"],
        s.items.map((item, i) => [
          right(String(i + 1)),
          bodyText(
            `${item.description}${item.period ? `\n${formatDocumentDate(item.period)}` : ""}`,
          ),
          right(exactDecimal(item.quantity)),
          right(exactDecimal(item.rate)),
          right(formatDocumentMoney(item.amount)),
        ]),
        ["auto", "*", "auto", "auto", "auto"],
        primary,
      ),
    );
    if (s.totals) {
      content.push({
        unbreakable: true,
        stack: [
          {
            columns: [
              { width: "*", text: "" },
              {
                width: 330,
                table: {
                  widths: ["*", "auto"],
                  body: [
                    [
                      bodyText("ยอดก่อนภาษี"),
                      right(`${formatDocumentMoney(s.totals.subtotal)} บาท`),
                    ],
                    ...(s.totals.tax === undefined
                      ? []
                      : [
                          [
                            bodyText(s.totals.taxLabel?.split(" / ")[0] ?? "ภาษี"),
                            right(`${formatDocumentMoney(s.totals.tax)} บาท`),
                          ],
                        ]),
                    [
                      bodyText(
                        s.type === "receipt"
                          ? "ยอดชำระเงินทั้งสิ้น"
                          : "ยอดรวม",
                        {
                          bold: true,
                          fontSize: 22,
                          fillColor: tint(primary, 0.75),
                        },
                      ),
                      {
                        ...right(`${formatDocumentMoney(s.totals.total)} บาท`),
                        bold: true,
                        fontSize: 22,
                        fillColor: tint(primary, 0.75),
                      },
                    ],
                  ],
                },
                layout: {
                  hLineWidth: () => 0.5,
                  vLineWidth: () => 0.5,
                  hLineColor: () => border,
                  vLineColor: () => border,
                  paddingLeft: () => 6,
                  paddingRight: () => 6,
                  paddingTop: () => 3,
                  paddingBottom: () => 3,
                },
              },
            ],
          },
          {
            columns: [
              bodyText("จำนวนเงินตัวอักษร", {
                width: 225,
                fontSize: 14,
              }),
              bodyText(thaiAmountWords(s.totals.total), {
                width: "*",
                alignment: "right",
              }),
            ],
            margin: [0, 5, 0, 3],
          },
        ],
        margin: [0, 0, 0, 2],
      });
    }
    if (s.type === "receipt" && s.outstandingBills && s.outstandingBills.bills.length > 0) {
      content.push(
        section("รายการค้างชำระ / Outstanding Balances"),
        table(
          ["ลำดับ", "รอบบิล", "ยอดเรียกเก็บ (บาท)", "ชำระแล้ว (บาท)", "ยอดค้างชำระ (บาท)"],
          s.outstandingBills.bills.map((bill, i) => [
            right(String(i + 1)),
            bodyText(bill.period),
            right(formatDocumentMoney(bill.billedAmount)),
            right(formatDocumentMoney(bill.paidAmount)),
            right(formatDocumentMoney(bill.remainingAmount)),
          ]),
          ["auto", "*", "auto", "auto", "auto"],
          primary,
        ),
        bodyText(
          `คงเหลืออีก ${s.outstandingBills.bills.length} บิล รวมยอดค้างชำระ ${formatDocumentMoney(s.outstandingBills.totalOutstanding)} บาท`,
          { bold: true, margin: [0, 4, 0, 6] }
        )
      );
    }
    if(s.type === "receipt")content.push({stack:[{...section("ข้อมูลการชำระเงิน"),fontSize:16},...transferBlocks],margin:[0,2,0,3]});
    const remarks = [
      section("หมายเหตุ"),
      ...(s.remarks?.length
        ? s.remarks.map((r) => bodyText(r))
        : [bodyText(s.paymentTerms || "-")]),
    ];
    const accounts = [
      section("บัญชีรับชำระ"),
      ...(s.paymentAccounts.length
        ? s.paymentAccounts.map((b) =>
            bodyText(`${b.bankName}\n${b.accountName}\n${b.accountNumber}`),
          )
        : [bodyText("-")]),
    ];
    if (s.type === "invoice") content.push(cards(accounts, remarks));
    else
      content.push({
        table: {
          widths: ["*"],
          dontBreakRows: false,
          body: [[{ columns: [{width:65,...bodyText("หมายเหตุ",{bold:true,fontSize:16})},{width:"*",stack:remarks.slice(1),fontSize:14}], columnGap:8, fillColor: "#f3f4f5" }]],
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => 9,
          paddingRight: () => 9,
          paddingTop: () => 4,
          paddingBottom: () => 4,
        },
        margin: [0, 5, 0, 0],
      });
  }
  return {
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: [40, topMargin, 40, bottomMargin],
    defaultStyle,
    content,
    info: { title: s.documentNumber, subject: s.templateVersion },
    header: (page) =>
      page === 1 ? null : { ...continuation, margin: [40, 12, 40, 0] },
    footer: (page, total) =>
      page === total
        ? { margin: [40, 8, 40, 0], stack: [signatures(s)] }
        : null,
  };
}

const require = createRequire(import.meta.url);
const fontDirectory = new URL(
  "../../../assets/fonts/th-sarabun-new/",
  import.meta.url,
);
const fonts = {
  normal: fileURLToPath(new URL("THSarabunNew.ttf", fontDirectory)),
  bold: fileURLToPath(new URL("THSarabunNew Bold.ttf", fontDirectory)),
  italics: fileURLToPath(new URL("THSarabunNew Italic.ttf", fontDirectory)),
  bolditalics: fileURLToPath(
    new URL("THSarabunNew BoldItalic.ttf", fontDirectory),
  ),
};
export async function renderDocumentPdf(
  snapshot: DocumentSnapshot,
): Promise<Buffer> {
  const pdf = require("pdfmake");
  const permitted = new Set(Object.values(fonts).map((path) => resolve(path)));
  pdf.setUrlAccessPolicy(() => false);
  pdf.setLocalAccessPolicy((path: string) => permitted.has(resolve(path)));
  pdf.addFonts({ THSarabunNew: fonts });
  const bytes: Buffer = await pdf
    .createPdf(documentDefinition(snapshot))
    .getBuffer();
  if (bytes.subarray(0, 5).toString() !== "%PDF-")
    throw new Error("Invalid PDF bytes");
  return bytes;
}

const buddhistDate = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const buddhistDateTime = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Bangkok",
});
function calendarDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? date
    : undefined;
}
/** Presentation only: ISO snapshots/numbering stay Gregorian; unknown values stay exact. */
export function formatDocumentDate(value: string): string {
  const range = /^(\d{4}-\d{2}-\d{2})\s+[-–]\s+(\d{4}-\d{2}-\d{2})$/.exec(
    value,
  );
  if (range) {
    const start = calendarDate(range[1]!);
    const end = calendarDate(range[2]!);
    if (!start || !end) return value;
    const endDate = buddhistDate.format(end);
    if (
      start.getTime() <= end.getTime() &&
      start.getUTCFullYear() === end.getUTCFullYear()
    ) {
      const parts = buddhistDate.formatToParts(start);
      const day = parts.find((part) => part.type === "day")!.value;
      if (start.getUTCMonth() === end.getUTCMonth()) return `${day}-${endDate}`;
      const month = parts.find((part) => part.type === "month")!.value;
      return `${day} ${month} - ${endDate}`;
    }
    return `${buddhistDate.format(start)} - ${endDate}`;
  }
  const date = calendarDate(value);
  if (date) return buddhistDate.format(date);
  const timestamp =
    /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
      value,
    );
  if (!timestamp || !calendarDate(timestamp[1]!)) return value;
  const instant = new Date(value);
  return Number.isFinite(instant.getTime())
    ? `${buddhistDateTime.format(instant)} (เวลาไทย)`
    : value;
}


export const SOLAR_LEASING_PACKET_TEMPLATE_VERSION = "solar-leasing-packet-v13";

const THAI_MONTH_NAMES = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
] as const;

interface ThaiDateBreakdown {
  year: number;
  month: number;
  day: number;
  dayStr: string;
  monthThai: string;
  buddhistYear: string;
  shortSlash: string;
}

function parseThaiDateBreakdown(
  iso: string | undefined,
  fallbackIso = "2026-01-01",
): ThaiDateBreakdown {
  const clean =
    iso && /^\d{4}-\d{2}-\d{2}/.test(iso)
      ? iso.slice(0, 10)
      : /^\d{4}-\d{2}-\d{2}/.test(fallbackIso)
        ? fallbackIso.slice(0, 10)
        : "2026-01-01";
  const [yStr, mStr, dStr] = clean.split("-");
  const year = Number(yStr) || 2026;
  const month = Math.min(12, Math.max(1, Number(mStr) || 1));
  const day = Math.min(31, Math.max(1, Number(dStr) || 1));
  const monthThai = THAI_MONTH_NAMES[month - 1]!;
  const buddhistYear = String(year + 543);
  const mm = String(month).padStart(2, "0");
  return {
    year,
    month,
    day,
    dayStr: String(day),
    monthThai,
    buddhistYear,
    shortSlash: `${day}/${mm}/${buddhistYear}`,
  };
}

export function extractCustomerOrgAndProvince(
  rawName: string,
  rawAddress: string,
  explicitProvince?: string,
): {
  orgName: string;
  province: string;
  orgWithProvinceInline: string;
  orgWithProvinceSpaced: string;
} {
  let orgName = (rawName || "-").trim();
  let province = (explicitProvince || "").trim();
  const inlineProvinceMatch = /^(.*?)\s*จังหวัด\s*([^\s,]+)\s*$/.exec(orgName);
  if (inlineProvinceMatch) {
    if (inlineProvinceMatch[1]?.trim()) {
      orgName = inlineProvinceMatch[1].trim();
    }
    if (!province && inlineProvinceMatch[2]?.trim()) {
      province = inlineProvinceMatch[2].trim();
    }
  }
  if (!province && rawAddress) {
    const addrMatch =
      /จังหวัด\s*([^\s,0-9]+)/.exec(rawAddress) ??
      /จ\.\s*([^\s,0-9]+)/.exec(rawAddress);
    if (addrMatch?.[1]) {
      province = addrMatch[1].trim();
    } else if (rawAddress.includes("กรุงเทพมหานคร")) {
      province = "กรุงเทพมหานคร";
    }
  }
  province = province.replace(/^จังหวัด\s*/, "").trim();
  return {
    orgName,
    province,
    orgWithProvinceInline: province
      ? `${orgName} จังหวัด${province}`
      : orgName,
    orgWithProvinceSpaced: province
      ? `${orgName} จังหวัด ${province}`
      : orgName,
  };
}

export function formatPacketRecipientLine(
  recipientTitle: string | undefined,
  orgWithProvinceInline: string,
): string {
  const title = (recipientTitle || "ผู้อำนวยการ").trim();
  if (!title) return orgWithProvinceInline;
  if (orgWithProvinceInline.startsWith(title)) return orgWithProvinceInline;
  if (
    title.endsWith("โรงพยาบาล") &&
    orgWithProvinceInline.startsWith("โรงพยาบาล")
  ) {
    return `${title}${orgWithProvinceInline.slice("โรงพยาบาล".length)}`;
  }
  return `${title}${orgWithProvinceInline}`;
}

function resolveCycleBounds(s: DocumentSnapshot): {
  periodStartIso: string;
  periodEndIso: string;
} {
  const rawPeriod = s.period || s.items[0]?.period || "";
  const rangeMatch = /^(\d{4}-\d{2}-\d{2})\s*[-–]\s*(\d{4}-\d{2}-\d{2})$/.exec(
    rawPeriod.trim(),
  );
  if (rangeMatch) {
    return {
      periodStartIso: rangeMatch[1]!,
      periodEndIso: rangeMatch[2]!,
    };
  }
  const issue = parseThaiDateBreakdown(s.issueDate);
  const mm = String(issue.month).padStart(2, "0");
  const lastDay = new Date(Date.UTC(issue.year, issue.month, 0)).getUTCDate();
  return {
    periodStartIso: `${issue.year}-${mm}-01`,
    periodEndIso: `${issue.year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

function resolveInstallmentNumbers(
  s: DocumentSnapshot,
  periodStartIso: string,
): { installmentIndex: number; totalInstallments: number } {
  const totalInstallments =
    s.totalInstallments && s.totalInstallments > 0 ? s.totalInstallments : 300;
  if (s.installmentIndex && s.installmentIndex > 0) {
    return { installmentIndex: s.installmentIndex, totalInstallments };
  }
  const startIso = s.serviceStartDate || s.startDate;
  if (startIso && /^\d{4}-\d{2}-\d{2}/.test(startIso)) {
    const start = parseThaiDateBreakdown(startIso);
    const current = parseThaiDateBreakdown(periodStartIso);
    const diff =
      (current.year - start.year) * 12 + (current.month - start.month) + 1;
    return {
      installmentIndex: Math.max(1, diff),
      totalInstallments,
    };
  }
  return { installmentIndex: 1, totalInstallments };
}

function formatPacketKwh(value: string | number | undefined): string {
  if (value === undefined || value === null || value === "") return "0.00";
  const raw = String(value).replace(/,/g, "").trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return String(value);
  const [, frac = ""] = raw.split(".");
  const cleanFrac = frac.replace(/0+$/, "");
  if (cleanFrac.length > 2) {
    const [whole = "0"] = raw.split(".");
    return `${ whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") }.${cleanFrac}`;
  }
  return formatDocumentMoney(raw);
}

function packetScaledCents(value: string | number | undefined): bigint {
  const raw = String(value ?? "0").replace(/,/g, "").trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!m) return 0n;
  const whole = BigInt(m[2] || "0");
  const frac = (m[3] || "").padEnd(3, "0");
  const cents = BigInt(frac.slice(0, 2));
  const roundUp = Number(frac[2] || "0") >= 5 ? 1n : 0n;
  const abs = whole * 100n + cents + roundUp;
  return m[1] === "-" ? -abs : abs;
}

function resolveDailyEnergyRows(
  s: DocumentSnapshot,
  periodStartIso: string,
  totalKwhRaw: string,
): {
  rows: {
    day: number;
    date: string;
    totalKwh: string;
    onPeakKwh: string;
    offPeakKwh: string;
  }[];
  summary: { totalKwh: string; onPeakKwh: string; offPeakKwh: string };
} {
  const period = parseThaiDateBreakdown(periodStartIso);
  const daysInMonth = new Date(
    Date.UTC(period.year, period.month, 0),
  ).getUTCDate();
  if (s.dailyEnergy && s.dailyEnergy.length > 0) {
    const byDay = new Map(s.dailyEnergy.map((row) => [row.day, row]));
    let sumTotalCents = 0n;
    let sumOnPeakCents = 0n;
    let sumOffPeakCents = 0n;
    const rows = Array.from({ length: 31 }, (_, index) => {
      const day = index + 1;
      if (day > daysInMonth) {
        return { day, date: "", totalKwh: "", onPeakKwh: "", offPeakKwh: "" };
      }
      const existing = byDay.get(day);
      const date =
        existing?.date ?? `${day}/${period.month}/${period.buddhistYear}`;
      const totalCents = packetScaledCents(existing?.totalKwh ?? "0.00");
      const onPeakCents = packetScaledCents(existing?.onPeakKwh ?? "0.00");
      const offPeakCents =
        existing?.offPeakKwh !== undefined
          ? packetScaledCents(existing.offPeakKwh)
          : totalCents - onPeakCents;
      sumTotalCents += totalCents;
      sumOnPeakCents += onPeakCents;
      sumOffPeakCents += offPeakCents;
      return {
        day,
        date,
        totalKwh: formatDocumentMoney(
          `${totalCents / 100n}.${String(totalCents % 100n).padStart(2, "0")}`,
        ),
        onPeakKwh: formatDocumentMoney(
          `${onPeakCents / 100n}.${String(onPeakCents % 100n).padStart(2, "0")}`,
        ),
        offPeakKwh: formatDocumentMoney(
          `${offPeakCents / 100n}.${String(offPeakCents % 100n).padStart(2, "0")}`,
        ),
      };
    });
    const summary = s.energySummary
      ? {
          totalKwh: formatPacketKwh(s.energySummary.totalKwh),
          onPeakKwh: formatPacketKwh(s.energySummary.onPeakKwh),
          offPeakKwh: formatPacketKwh(s.energySummary.offPeakKwh),
        }
      : {
          totalKwh: formatDocumentMoney(
            `${sumTotalCents / 100n}.${String(sumTotalCents % 100n).padStart(2, "0")}`,
          ),
          onPeakKwh: formatDocumentMoney(
            `${sumOnPeakCents / 100n}.${String(sumOnPeakCents % 100n).padStart(2, "0")}`,
          ),
          offPeakKwh: formatDocumentMoney(
            `${sumOffPeakCents / 100n}.${String(sumOffPeakCents % 100n).padStart(2, "0")}`,
          ),
        };
    return { rows, summary };
  }

  const totalCents = packetScaledCents(totalKwhRaw || "0.00");
  const daysBig = BigInt(daysInMonth);
  const baseDayCents = daysBig > 0n ? totalCents / daysBig : 0n;
  const remainderCents = daysBig > 0n ? totalCents % daysBig : 0n;
  let sumOnPeakCents = 0n;
  let sumOffPeakCents = 0n;
  const rows = Array.from({ length: 31 }, (_, index) => {
    const day = index + 1;
    if (day > daysInMonth) {
      return { day, date: "", totalKwh: "", onPeakKwh: "", offPeakKwh: "" };
    }
    const dayTotalCents =
      baseDayCents + (BigInt(index) < remainderCents ? 1n : 0n);
    const dow = new Date(
      Date.UTC(period.year, period.month - 1, day),
    ).getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    const onPeakCents = isWeekend ? 0n : (dayTotalCents * 82n) / 100n;
    const offPeakCents = dayTotalCents - onPeakCents;
    sumOnPeakCents += onPeakCents;
    sumOffPeakCents += offPeakCents;
    return {
      day,
      date: `${day}/${period.month}/${period.buddhistYear}`,
      totalKwh: formatDocumentMoney(
        `${dayTotalCents / 100n}.${String(dayTotalCents % 100n).padStart(2, "0")}`,
      ),
      onPeakKwh: formatDocumentMoney(
        `${onPeakCents / 100n}.${String(onPeakCents % 100n).padStart(2, "0")}`,
      ),
      offPeakKwh: formatDocumentMoney(
        `${offPeakCents / 100n}.${String(offPeakCents % 100n).padStart(2, "0")}`,
      ),
    };
  });
  return {
    rows,
    summary: {
      totalKwh: formatDocumentMoney(
        `${totalCents / 100n}.${String(totalCents % 100n).padStart(2, "0")}`,
      ),
      onPeakKwh: formatDocumentMoney(
        `${sumOnPeakCents / 100n}.${String(sumOnPeakCents % 100n).padStart(2, "0")}`,
      ),
      offPeakKwh: formatDocumentMoney(
        `${sumOffPeakCents / 100n}.${String(sumOffPeakCents % 100n).padStart(2, "0")}`,
      ),
    },
  };
}

function packetLetterhead(
  s: DocumentSnapshot,
  pageBreakBefore = false,
): Record<string, unknown> {
  const contactParts: string[] = [];
  if (s.issuer.phone) contactParts.push(`โทร : ${s.issuer.phone}`);
  if (s.issuer.email) contactParts.push(`อีเมล : ${s.issuer.email}`);
  return {
    ...(pageBreakBefore ? { pageBreak: "before" } : {}),
    stack: [
      {
        columns: [
          ...(s.logoDataUri
            ? [{ width: 46, image: s.logoDataUri, fit: [44, 44] }]
            : []),
          {
            width: "*",
            stack: [
              bodyText(s.issuer.name, { fontSize: 15, bold: true }),
              bodyText(`เลขประจำตัวผู้เสียภาษี ${s.issuer.taxId}`, {
                fontSize: 11.5,
              }),
            ],
          },
          {
            width: 270,
            alignment: "right",
            stack: [
              bodyText(s.issuer.address || "-", {
                fontSize: 11,
                alignment: "right",
              }),
              ...(contactParts.length
                ? [
                    bodyText(contactParts.join("  "), {
                      fontSize: 11,
                      alignment: "right",
                    }),
                  ]
                : []),
            ],
          },
        ],
        columnGap: 8,
        margin: [0, 0, 0, 8],
      },
    ],
  };
}

function packetGridLayout(paddingV = 2.5, paddingH = 5) {
  return {
    hLineWidth: () => 0.5,
    vLineWidth: () => 0.5,
    hLineColor: () => "#000000",
    vLineColor: () => "#000000",
    paddingLeft: () => paddingH,
    paddingRight: () => paddingH,
    paddingTop: () => paddingV,
    paddingBottom: () => paddingV,
  };
}

function solarLeasingPacketDefinition(s: DocumentSnapshot): DocumentDefinition {
  const defaultStyle = {
    font: "THSarabunNew",
    fontSize: 14,
    color: "#000000",
    lineHeight: 1.12,
  };
  const issueDate = parseThaiDateBreakdown(s.issueDate);
  const { periodStartIso, periodEndIso } = resolveCycleBounds(s);
  const periodStart = parseThaiDateBreakdown(periodStartIso, s.issueDate);
  const periodEnd = parseThaiDateBreakdown(periodEndIso, s.issueDate);
  const startDate = parseThaiDateBreakdown(
    s.serviceStartDate || s.startDate || periodStartIso,
    periodStartIso,
  );
  const contractDate = parseThaiDateBreakdown(
    s.contractSignedDate || s.serviceStartDate || s.startDate || periodStartIso,
    periodStartIso,
  );
  const { installmentIndex, totalInstallments } = resolveInstallmentNumbers(
    s,
    periodStartIso,
  );
  const { orgWithProvinceInline, orgWithProvinceSpaced } =
    extractCustomerOrgAndProvince(
      s.customer.name,
      s.customer.address,
      s.customerProvince,
    );
  const recipientLine = formatPacketRecipientLine(
    s.recipientTitle,
    orgWithProvinceInline,
  );
  const seqDigits =
    /(\d{4})$/.exec(s.documentNumber)?.[1] ??
    s.documentNumber.replace(/\D/g, "").slice(-4).padStart(4, "0") ??
    "0001";
  const letterNo =
    s.letterNumber?.trim() || `สฟ ${seqDigits}/${issueDate.buddhistYear}`;
  const contractNo = s.contractNumber?.trim() || "-";

  const totalKwhRaw =
    s.items.reduce((acc, item) => {
      const n = Number(String(item.quantity || "0").replace(/,/g, ""));
      return Number.isFinite(n) ? acc + n : acc;
    }, 0) > 0
      ? s.items.length === 1
        ? s.items[0]!.quantity
        : String(
            s.items.reduce(
              (acc, item) =>
                acc + Number(String(item.quantity || "0").replace(/,/g, "")),
              0,
            ),
          )
      : "0.00";
  const totalKwhFormatted = formatPacketKwh(totalKwhRaw);
  const rawRate = s.items[0]?.rate ?? "0.00";
  const rateFormatted = formatPacketKwh(rawRate);
  const subtotalFormatted = formatDocumentMoney(s.totals?.subtotal ?? "0.00");
  const taxFormatted = formatDocumentMoney(s.totals?.tax ?? "0.00");
  const totalFormatted = formatDocumentMoney(s.totals?.total ?? "0.00");
  const amountWords = thaiAmountWords(s.totals?.total ?? "0.00");
  const taxPercentMatch = /(\d+(?:\.\d+)?)\s*%/.exec(
    s.totals?.taxLabel ?? "ภาษี 7%",
  );
  const taxPercentLabel = taxPercentMatch?.[1] ?? "7";

  const primaryBank = s.paymentAccounts[0];
  const bankAccountName = primaryBank?.accountName || s.issuer.name || "-";
  const bankAccountNumber = primaryBank?.accountNumber || "-";
  const bankAccountType = primaryBank?.accountType || "ออมทรัพย์";
  const bankBranch = primaryBank?.branchName || s.issuer.branch || "-";
  const bankName = primaryBank?.bankName || "-";
  const companyEmail = s.issuer.email || "-";
  const issuerSignatory = s.signatories.issuer;

  const { rows: dailyRows, summary: energySummary } = resolveDailyEnergyRows(
    s,
    periodStartIso,
    totalKwhRaw,
  );
  const page3Rows = dailyRows.slice(0, 24);
  const page4Rows = dailyRows.slice(24, 31);

  const indent = "\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0";

  // ==================== PAGE 1: หนังสือนำส่งแจ้งหนี้ ====================
  const page1Content: unknown[] = [
    packetLetterhead(s, false),
    bodyText(
      `วันที่ ${issueDate.dayStr} เดือน ${issueDate.monthThai} พ.ศ. ${issueDate.buddhistYear}`,
      { alignment: "center", margin: [0, 2, 0, 6], fontSize: 14 },
    ),
    bodyText(`ที่ ${letterNo}`, { margin: [0, 0, 0, 2], fontSize: 14 }),
    bodyText(
      "เรื่อง  แจ้งหนี้ค่าเช่าระบบผลิตไฟฟ้าพลังงานแสงอาทิตย์ (ค่ากระแสไฟฟ้าจากพลังงานทดแทน)",
      { margin: [0, 0, 0, 2], fontSize: 14 },
    ),
    bodyText(`เรียน  ${recipientLine}`, { margin: [0, 0, 0, 2], fontSize: 14 }),
    bodyText(
      `อ้างถึง  สัญญาเช่าเลขที่ ${contractNo} ลงวันที่ ${contractDate.shortSlash}`,
      { margin: [0, 0, 0, 2], fontSize: 14 },
    ),
    bodyText("สิ่งที่ส่งมาด้วย", { margin: [0, 0, 0, 1], fontSize: 14 }),
    bodyText(
      `1. ใบแจ้งหนี้ค่าเช่าระบบผลิตไฟฟ้าพลังงานแสงอาทิตย์ (ค่ากระแสไฟฟ้าจากพลังงานทดแทน) เลขที่ ${s.documentNumber} ลงวันที่ ${issueDate.dayStr} เดือน ${issueDate.monthThai} พ.ศ. ${issueDate.buddhistYear} จำนวน 1 ฉบับ`,
      { margin: [36, 0, 0, 1], fontSize: 13.5 },
    ),
    bodyText(
      `2. รายงานผลค่าไฟฟ้าจากพลังงานทดแทน (พลังงานแสงอาทิตย์) ประจำเดือน ${periodStart.monthThai} พ.ศ. ${periodStart.buddhistYear} จำนวน 1 ฉบับ`,
      { margin: [36, 0, 0, 1], fontSize: 13.5 },
    ),
    bodyText(
      "3. แบบฟอร์มยืนยันการชำระค่าเช่าระบบผลิตไฟฟ้าพลังงานแสงอาทิตย์ จำนวน 1 ฉบับ",
      { margin: [36, 0, 0, 6], fontSize: 13.5 },
    ),
    bodyText(
      `${indent}ตามสัญญาที่อ้างถึง ${orgWithProvinceInline} ได้เช่าระบบผลิตไฟฟ้าพลังงานแสงอาทิตย์ชนิดติดตั้งบนหลังคากับ${s.issuer.name} โดยได้ตกลงให้${s.issuer.name} เป็นผู้ให้บริการติดตั้งและบำรุงรักษาอุปกรณ์ประหยัดพลังงานในระบบการผลิตไฟฟ้าจากพลังงานทดแทนหรือพลังงานทางเลือก ภายในพื้นที่${orgWithProvinceInline} นั้น โดยกำหนดวันเริ่มคิดค่าเช่างวดที่ 1 ในเดือนที่ 1/${totalInstallments} นับตั้งแต่วันที่ ${startDate.dayStr} เดือน${startDate.monthThai} พ.ศ. ${startDate.buddhistYear} เป็นต้นไป`,
      { margin: [0, 0, 0, 4], fontSize: 13.5, lineHeight: 1.15 },
    ),
    bodyText(
      `${indent}ในการนี้บริษัทฯ ขอแจ้งให้ทราบว่า ได้ให้บริการไฟฟ้าจากพลังงานทดแทน(พลังงานแสงอาทิตย์) ในเดือนที่ ${installmentIndex}/${totalInstallments} (รอบเดือน${periodStart.monthThai} พ.ศ. ${periodStart.buddhistYear}) เสร็จสิ้นแล้ว จึงขอนำส่งใบแจ้งหนี้ค่าเช่า (ค่ากระแสไฟฟ้าที่ระบบผลิตได้ตามหน่วยใช้ไฟฟ้าจริง (kwh)) เลขที่ ${s.documentNumber} ลงวันที่ ${issueDate.dayStr} เดือน${issueDate.monthThai} พ.ศ. ${issueDate.buddhistYear} เป็นเงิน ${totalFormatted} บาท (${amountWords}) รวมภาษีมูลค่าเพิ่ม ${taxPercentLabel}% แล้ว`,
      { margin: [0, 0, 0, 4], fontSize: 13.5, lineHeight: 1.15 },
    ),
    bodyText(
      `${indent}โดยวิธีชำระเงินค่าเช่าดังนี้ โอนเงินเข้าบัญชีบริษัทฯ ชื่อบัญชี ${bankAccountName} บัญชีเลขที่ ${bankAccountNumber} ประเภทบัญชี${bankAccountType} สาขา${bankBranch} ธนาคาร${bankName}`,
      { margin: [0, 0, 0, 4], fontSize: 13.5, lineHeight: 1.15 },
    ),
    bodyText(
      `${indent}หากทาง${orgWithProvinceInline} ชำระค่าเช่า(ค่ากระแสไฟฟ้าที่ระบบผลิตได้ตามหน่วยใช้ไฟฟ้าจริง (kwh))แล้ว โปรดยืนยันการชำระเงินในแบบฟอร์มยืนยันตามที่สิ่งที่ส่งมาด้วย 3 และส่งหลักฐานการชำระเงินดังกล่าว มายัง อีเมลล์บริษัทฯ อีเมลล์ ${companyEmail} เพื่อบริษัทฯ จะออกใบเสร็จรับเงินให้${orgWithProvinceInline} ต่อไป`,
      { margin: [0, 0, 0, 8], fontSize: 13.5, lineHeight: 1.15 },
    ),
    bodyText("จึงเรียนมาเพื่อโปรดทราบและดำเนินการต่อไป", {
      margin: [170, 0, 0, 8],
      fontSize: 14,
    }),
    {
      margin: [180, 0, 0, 0],
      alignment: "center",
      stack: [
        bodyText("ขอแสดงความนับถือ", {
          alignment: "center",
          fontSize: 14,
          margin: [0, 0, 0, 4],
        }),
        ...(issuerSignatory?.signatureDataUri
          ? [
              {
                image: issuerSignatory.signatureDataUri,
                fit: [100, 34],
                alignment: "center",
                margin: [0, 2, 0, 2],
              },
            ]
          : [
              bodyText("...........................................", {
                alignment: "center",
                margin: [0, 12, 0, 4],
              }),
            ]),
        bodyText(`(${issuerSignatory?.name || "ผู้มีอำนาจลงนาม"})`, {
          alignment: "center",
          fontSize: 13.5,
        }),
        bodyText(
          issuerSignatory?.title || "กรรมการผู้จัดการ",
          { alignment: "center", fontSize: 13.5 },
        ),
      ],
    },
  ];

  // ==================== PAGE 2: ใบแจ้งหนี้ค่ากระแสไฟฟ้า ====================
  const page2Content: unknown[] = [
    packetLetterhead(s, true),
    bodyText("ใบแจ้งหนี้ค่ากระแสไฟฟ้า", {
      alignment: "center",
      bold: true,
      fontSize: 16,
      margin: [0, 4, 0, 2],
    }),
    bodyText(`เลขประจำตัวผู้เสียภาษี ${s.issuer.taxId}`, {
      alignment: "center",
      fontSize: 14,
      margin: [0, 0, 0, 8],
    }),
    bodyText("กรุณาส่ง", { bold: true, fontSize: 14, margin: [0, 0, 0, 2] }),
    bodyText(s.customer.name, { margin: [36, 0, 0, 1], fontSize: 14 }),
    bodyText(`ที่อยู่ ${s.customer.address || "-"}`, {
      margin: [36, 0, 0, 1],
      fontSize: 14,
    }),
    bodyText(`เลขประจำตัวผู้เสียภาษี ${s.customer.taxId || "-"}`, {
      margin: [36, 0, 0, 8],
      fontSize: 14,
    }),
    bodyText(
      `วันที่ ${issueDate.dayStr} เดือน ${issueDate.monthThai} พ.ศ. ${issueDate.buddhistYear}`,
      { alignment: "center", margin: [0, 0, 0, 4], fontSize: 14 },
    ),
    bodyText(`เลขที่ใบแจ้งหนี้ ${s.documentNumber}`, {
      alignment: "right",
      margin: [0, 0, 0, 8],
      fontSize: 14,
    }),
    bodyText("รายละเอียด", {
      alignment: "center",
      bold: true,
      fontSize: 14,
      margin: [0, 0, 0, 6],
    }),
    {
      table: {
        headerRows: 1,
        widths: ["*", 78, 92, 92],
        body: [
          [
            bodyText("รายการ", { bold: true, alignment: "center" }),
            bodyText("จำนวนหน่วย\n(kwh)", {
              bold: true,
              alignment: "center",
            }),
            bodyText("ราคาต่อหน่วย\n(บาทต่อ kwh)", {
              bold: true,
              alignment: "center",
            }),
            bodyText("จำนวนเงิน (บาท)", { bold: true, alignment: "center" }),
          ],
          [
            {
              stack: [
                bodyText("ค่ากระแสไฟฟ้าจากพลังงานทดแทน", { bold: true }),
                bodyText(orgWithProvinceSpaced),
                bodyText(
                  `สัญญาเลขที่ ${contractNo} ลงวันที่ ${contractDate.shortSlash}`,
                  { margin: [0, 0, 0, 8] },
                ),
                bodyText("รายการใช้กระแสไฟฟ้าจากพลังงานทดแทน", { bold: true }),
                bodyText("เดือนปัจจุบัน", { bold: true }),
                bodyText(
                  `- รอบเดือนที่ ${installmentIndex}/${totalInstallments} ( วันที่ ${periodStart.dayStr} ถึง วันที่ ${periodEnd.dayStr} เดือน ${periodStart.monthThai} พ.ศ. ${periodStart.buddhistYear} )`,
                ),
                bodyText(`- จำนวน ${totalKwhFormatted} kwh`),
              ],
              margin: [4, 6, 4, 70],
            },
            bodyText(totalKwhFormatted, {
              alignment: "right",
              margin: [0, 6, 2, 0],
            }),
            bodyText(rateFormatted, {
              alignment: "right",
              margin: [0, 6, 2, 0],
            }),
            bodyText(subtotalFormatted, {
              alignment: "right",
              margin: [0, 6, 2, 0],
            }),
          ],
          [
            bodyText("รวมเงิน (บาท)", {
              colSpan: 3,
              alignment: "center",
              bold: true,
            }),
            {},
            {},
            bodyText(subtotalFormatted, { alignment: "right" }),
          ],
          [
            bodyText(`ภาษีมูลค่าเพิ่ม ${taxPercentLabel}%`, {
              colSpan: 3,
              alignment: "center",
              bold: true,
            }),
            {},
            {},
            bodyText(taxFormatted, { alignment: "right" }),
          ],
          [
            bodyText("รวมเงินทั้งสิ้น (บาท)", {
              colSpan: 3,
              alignment: "center",
              bold: true,
            }),
            {},
            {},
            bodyText(totalFormatted, { alignment: "right", bold: true }),
          ],
          [
            {
              colSpan: 4,
              margin: [18, 2, 12, 2],
              columns: [
                bodyText("รวมเงินเป็นตัวอักษร : (", {
                  width: "auto",
                  bold: true,
                }),
                bodyText(amountWords, {
                  width: "*",
                  alignment: "center",
                  bold: true,
                }),
                bodyText(")", {
                  width: "auto",
                  alignment: "right",
                  bold: true,
                }),
              ],
            },
            {},
            {},
            {},
          ],
        ],
      },
      layout: packetGridLayout(4, 6),
    },
    bodyText(
      `โปรดชำระเงิน โดยโอนเงินเข้าบัญชีบริษัท ชื่อบัญชี ${bankAccountName} บัญชีเลขที่ ${bankAccountNumber}`,
      { margin: [0, 16, 0, 2], fontSize: 14 },
    ),
    bodyText(`สาขา ${bankBranch} ธนาคาร ${bankName}`, {
      margin: [0, 0, 0, 0],
      fontSize: 14,
    }),
  ];

  // ==================== PAGE 3: Monthly Energy Report (1/2) ====================
  const page3Content: unknown[] = [
    packetLetterhead(s, true),
    bodyText("Monthly Energy Report", {
      alignment: "center",
      bold: true,
      fontSize: 13.5,
      lineHeight: 1.05,
    }),
    bodyText("รายงานผลค่าไฟฟ้าจากพลังงานทดแทน (พลังงานแสงอาทิตย์)", {
      alignment: "center",
      bold: true,
      fontSize: 13.5,
      lineHeight: 1.05,
    }),
    bodyText(`สำหรับ ${orgWithProvinceSpaced}`, {
      alignment: "center",
      bold: true,
      fontSize: 13.5,
      lineHeight: 1.05,
    }),
    bodyText(`เดือน ${periodStart.monthThai} พ.ศ. ${periodStart.buddhistYear}`, {
      alignment: "center",
      bold: true,
      fontSize: 13.5,
      lineHeight: 1.05,
      margin: [0, 0, 0, 6],
    }),
    {
      fontSize: 12,
      lineHeight: 0.9,
      table: {
        widths: [36, 76, "*", 95, 95],
        body: [
          [
            bodyText("Summary", {
              colSpan: 5,
              alignment: "center",
              bold: true,
              fontSize: 12,
            }),
            {},
            {},
            {},
            {},
          ],
          [
            bodyText("Total Energy Production", {
              colSpan: 3,
              alignment: "center",
              fontSize: 12,
            }),
            {},
            {},
            bodyText(energySummary.totalKwh, {
              alignment: "right",
              fontSize: 12,
            }),
            bodyText("kwh", { alignment: "center", fontSize: 12 }),
          ],
          [
            bodyText("Energy Production On Peak", {
              colSpan: 3,
              alignment: "center",
              fontSize: 12,
            }),
            {},
            {},
            bodyText(energySummary.onPeakKwh, {
              alignment: "right",
              fontSize: 12,
            }),
            bodyText("kwh", { alignment: "center", fontSize: 12 }),
          ],
          [
            bodyText("Energy Production Off Peak", {
              colSpan: 3,
              alignment: "center",
              fontSize: 12,
            }),
            {},
            {},
            bodyText(energySummary.offPeakKwh, {
              alignment: "right",
              fontSize: 12,
            }),
            bodyText("kwh", { alignment: "center", fontSize: 12 }),
          ],
          [
            bodyText("Day", {
              bold: true,
              alignment: "center",
              fontSize: 12,
            }),
            bodyText("Date", {
              bold: true,
              alignment: "center",
              fontSize: 12,
            }),
            bodyText("Total Energy Production (kwh)", {
              bold: true,
              alignment: "center",
              fontSize: 12,
            }),
            bodyText("On Peak (kwh)", {
              bold: true,
              alignment: "center",
              fontSize: 12,
            }),
            bodyText("Off Peak (kwh)", {
              bold: true,
              alignment: "center",
              fontSize: 12,
            }),
          ],
          ...page3Rows.map((row) => [
            bodyText(String(row.day), { alignment: "center", fontSize: 12 }),
            bodyText(row.date, { alignment: "center", fontSize: 12 }),
            bodyText(row.totalKwh, { alignment: "right", fontSize: 12 }),
            bodyText(row.onPeakKwh, { alignment: "right", fontSize: 12 }),
            bodyText(row.offPeakKwh, { alignment: "right", fontSize: 12 }),
          ]),
        ],
      },
      layout: packetGridLayout(0.6, 4),
    },
  ];

  // ==================== PAGE 4: Monthly Energy Report (2/2) ====================
  const page4Content: unknown[] = [
    packetLetterhead(s, true),
    {
      fontSize: 12,
      lineHeight: 0.9,
      margin: [0, 4, 0, 0],
      table: {
        widths: [36, 76, "*", 95, 95],
        body: [
          ...page4Rows.map((row) => [
            bodyText(String(row.day), { alignment: "center", fontSize: 12 }),
            bodyText(row.date, { alignment: "center", fontSize: 12 }),
            bodyText(row.totalKwh, { alignment: "right", fontSize: 12 }),
            bodyText(row.onPeakKwh, { alignment: "right", fontSize: 12 }),
            bodyText(row.offPeakKwh, { alignment: "right", fontSize: 12 }),
          ]),
          [
            bodyText("Total", {
              colSpan: 2,
              alignment: "center",
              bold: true,
              fontSize: 12,
            }),
            {},
            bodyText(energySummary.totalKwh, {
              alignment: "right",
              bold: true,
              fontSize: 12,
            }),
            bodyText(energySummary.onPeakKwh, {
              alignment: "right",
              bold: true,
              fontSize: 12,
            }),
            bodyText(energySummary.offPeakKwh, {
              alignment: "right",
              bold: true,
              fontSize: 12,
            }),
          ],
        ],
      },
      layout: packetGridLayout(2.2, 5),
    },
  ];

  // ==================== PAGE 5: แบบฟอร์มยืนยันการชำระค่ากระแสไฟฟ้า ====================
  const page5Content: unknown[] = [
    bodyText("แบบฟอร์ม ยืนยันการชำระค่ากระแสไฟฟ้า จากพลังงานทดแทน", {
      pageBreak: "before",
      alignment: "center",
      bold: true,
      fontSize: 16,
      margin: [0, 28, 0, 28],
    }),
    bodyText(`ชื่อหน่วยงาน: ${orgWithProvinceInline}`, {
      fontSize: 15,
      margin: [12, 0, 0, 18],
    }),
    bodyText("ยืนยันการชำระเงินค่า: ค่ากระแสไฟฟ้าจากพลังงานทดแทน", {
      fontSize: 15,
      margin: [12, 0, 0, 4],
    }),
    bodyText(
      `งวดที่ ${installmentIndex}/${totalInstallments} เดือน ${periodStart.monthThai} พ.ศ. ${periodStart.buddhistYear}`,
      { fontSize: 15, margin: [60, 0, 0, 18] },
    ),
    bodyText(`จำนวนเงินรวมภาษีมูลค่าเพิ่มแล้ว: ${totalFormatted} บาท`, {
      fontSize: 15,
      margin: [12, 0, 0, 4],
    }),
    bodyText(`จำนวนเป็นตัวอักษร: ( ${amountWords} )`, {
      fontSize: 15,
      margin: [12, 0, 0, 18],
    }),
    bodyText(
      `ช่องทางการชำระเงิน: โอนเข้าบัญชีบริษัทฯ ชื่อบัญชี ${bankAccountName}`,
      { fontSize: 15, margin: [12, 0, 0, 4] },
    ),
    bodyText(`บัญชีเลขที่ ${bankAccountNumber} สาขา ${bankBranch}`, {
      fontSize: 15,
      margin: [12, 0, 0, 4],
    }),
    bodyText(`ธนาคาร ${bankName}`, {
      fontSize: 15,
      margin: [12, 0, 0, 24],
    }),
    bodyText(
      "ลงชื่อผู้ชำระเงิน....................................................... ตำแหน่ง .......................................................",
      { fontSize: 15, margin: [12, 0, 0, 8] },
    ),
    bodyText(
      "เบอร์ติดต่อ .............................................................. E-Mail: ........................................................",
      { fontSize: 15, margin: [12, 0, 0, 24] },
    ),
    bodyText(
      `และได้ส่งหลักฐานการโอนเงิน ไปยัง E-Mail ของบริษัท ${s.issuer.name}`,
      { fontSize: 15, margin: [36, 0, 0, 4] },
    ),
    bodyText(
      `อีเมลล์ : ${companyEmail} เป็นที่เรียบร้อยแล้ว เมื่อวันที่ ........./............/...............`,
      { fontSize: 15, margin: [12, 0, 0, 0] },
    ),
  ];

  return {
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: [44, 22, 44, 22],
    defaultStyle,
    content: [
      ...page1Content,
      ...page2Content,
      ...page3Content,
      ...page4Content,
      ...page5Content,
    ],
    info: { title: s.documentNumber, subject: s.templateVersion },
    header: () => null,
    footer: () => null,
  };
}
