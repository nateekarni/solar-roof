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
    rate: string;
    amount: string;
  }[];
  totals?: { subtotal: string; tax?: string; taxLabel?: string; total: string };
  approvedTransfers: {
    payerName?: string;
    paymentMethod?: "bank_transfer" | "promptpay";
    originBank?: string;
    originAccount?: string;
    paidAt: string;
    amount: string;
    evidence?: string;
    status: "paid" | "approved";
  }[];
  paymentAccounts: {
    bankName: string;
    accountName: string;
    accountNumber: string;
  }[];
  dueDate?: string;
  paymentTerms?: string;
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
function party(p: DocumentParty): any {
  return {
    stack: [
      bodyText(p.name, { bold: true }),
      bodyText(p.address),
      bodyText(
        `เลขประจำตัวผู้เสียภาษี / Tax ID: ${p.taxId}${p.branch ? ` (${p.branch})` : ""}`,
      ),
      ...(p.phone ? [bodyText(`โทร / Tel: ${p.phone}`)] : []),
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
  return {
    fontSize: 14,
    table: {
      widths: ["*", "*"],
      body: [
        [
          left("________________________", [0, 10, 0, 4]),
          centered("________________________", [0, 10, 0, 4]),
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
              : "ผู้จัดทำ / Prepared by",
          ),
          centered(
            contract
              ? "ผู้ลงนามฝ่ายผู้ซื้อ / Customer signatory"
              : receipt
                ? "ผู้มีอำนาจลงนาม / Authorised Signature"
                : "ผู้รับเอกสาร / Document received by",
          ),
        ],
        ...(contract
          ? [[centered(s.issuer.name), centered(s.customer.name)]]
          : []),
        [
          left("วันที่ลงนาม: ____________________", [0, 4, 0, 0]),
          centered("วันที่ลงนาม: ____________________", [0, 4, 0, 0]),
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
    { left: 40, top: 0, right: 40, bottom: 0 },
  );
  try {
    const pages = builder.layoutDocument(block, doc, {}, style);
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
export function documentDefinition(s: DocumentSnapshot): DocumentDefinition {
  const title =
    s.type === "contract"
      ? ["สัญญาซื้อขายไฟฟ้า", "Power Purchase Agreement (PPA)"]
      : s.type === "receipt"
        ? s.syntheticTest
          ? ["ใบเสร็จรับเงิน", "Receipt / Test Tax Invoice"]
          : ["ใบเสร็จรับเงิน", "Receipt"]
        : ["ใบแจ้งหนี้", "Invoice"];
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
            `${title[0]} / ${s.type === "receipt" && s.syntheticTest ? "ใบกำกับภาษีทดสอบ / " : ""}${title[1]}`,
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
    bodyText(`เลขที่ / No: ${s.documentNumber}`),
    bodyText(`วันที่ / Issued: ${formatDocumentDate(s.issueDate)}`),
    ...(s.type === "invoice" && s.dueDate
      ? [bodyText(`กำหนดชำระ / Due: ${formatDocumentDate(s.dueDate)}`)]
      : []),
    ...(s.type === "receipt"
      ? [bodyText(`ใบแจ้งหนี้ / Invoice: ${s.invoiceNumber || "-"}`)]
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
        { width: "*", ...party(s.issuer), fontSize: 14 },
        {
          width: 190,
          alignment: "right",
          stack: [
            bodyText(title[0]!, { fontSize: 26, bold: true }),
            ...(s.type === "receipt" && s.syntheticTest
              ? [bodyText("ใบกำกับภาษีทดสอบ", { fontSize: 14 })]
              : []),
            bodyText(title[1]!, { fontSize: 16 }),
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
        section("ข้อมูลคู่สัญญา / Parties"),
        party(s.issuer),
        party(s.customer),
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
          ? [bodyText(`การชำระ ${i + 1} / Transfer ${i + 1}`, { bold: true })]
          : []),
        bodyText(
          `ช่องทาง / Method: ${p.paymentMethod === "promptpay" ? "พร้อมเพย์ / PromptPay" : p.paymentMethod === "bank_transfer" ? "โอนเงินผ่านธนาคาร / Bank transfer" : "-"}`,
        ),
        bodyText(`ผู้ชำระ / Payer: ${p.payerName || "-"}`),
        bodyText(`ธนาคารต้นทาง / Origin bank: ${p.originBank || "-"}`),
        bodyText(`บัญชีต้นทาง / Origin account: ${p.originAccount || "-"}`),
        bodyText(`ชำระ: ${formatDocumentDate(p.paidAt)}`),
        bodyText(`จำนวนเงิน / Amount: ${formatDocumentMoney(p.amount)} THB`),
        bodyText(`หลักฐาน / Evidence: ${p.evidence || "-"}`),
      ],
      fontSize: 14,
      margin: [0, i ? 5 : 0, 0, 0],
    }));
    const project = [
      section("ข้อมูลโครงการ / Project Information"),
      bodyText(
        `ไซต์งาน: ${s.siteName || "-"}${s.siteExternalId ? ` (${s.siteExternalId})` : ""}`,
      ),
      bodyText(`สัญญา / Contract: ${s.contractNumber || "-"}`),
      bodyText(
        `รอบบิล / Period: ${s.period ? formatDocumentDate(s.period) : "-"}`,
      ),
    ];
    content.push(
      cards(
        [section("ข้อมูลลูกค้า / Customer"), party(s.customer)],
        s.type === "receipt"
          ? [
              section("ข้อมูลการชำระเงิน / Payment Information"),
              ...(transferBlocks.length
                ? transferBlocks.slice(0, 1)
                : [bodyText("-")]),
            ]
          : project,
      ),
    );
    if (s.type === "receipt" && transfers.length > 1)
      content.push(
        table(
          [
            "วันที่ / Payer and paid date",
            "รายละเอียดการโอน / Transfer details",
          ],
          transfers.slice(1).map((p, i) => [
            {
              stack: [
                bodyText(`การชำระ ${i + 2} / Transfer ${i + 2}`, {
                  bold: true,
                }),
                bodyText(`ผู้ชำระ / Payer: ${p.payerName || "-"}`),
                bodyText(formatDocumentDate(p.paidAt)),
              ],
              fontSize: 14,
            },
            {
              stack: [
                bodyText(
                  `ช่องทาง / Method: ${p.paymentMethod === "promptpay" ? "พร้อมเพย์ / PromptPay" : p.paymentMethod === "bank_transfer" ? "โอนเงินผ่านธนาคาร / Bank transfer" : "-"}`,
                ),
                bodyText(`ธนาคารต้นทาง / Origin bank: ${p.originBank || "-"}`),
                bodyText(
                  `บัญชีต้นทาง / Origin account: ${p.originAccount || "-"}`,
                ),
                bodyText(
                  `จำนวนเงิน / Amount: ${formatDocumentMoney(p.amount)} THB`,
                ),
                bodyText(`หลักฐาน / Evidence: ${p.evidence || "-"}`),
              ],
              fontSize: 14,
            },
          ]),
          ["*", "*"],
          primary,
          "หลักฐานการชำระ / Approved transfers",
        ),
      );
    content.push(
      table(
        ["ลำดับ", "รายการ / Description", "kWh", "THB/kWh", "THB"],
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
                      bodyText("ยอดก่อนภาษี / Subtotal"),
                      right(`${formatDocumentMoney(s.totals.subtotal)} THB`),
                    ],
                    ...(s.totals.tax === undefined
                      ? []
                      : [
                          [
                            bodyText(s.totals.taxLabel ?? "ภาษี / Tax"),
                            right(`${formatDocumentMoney(s.totals.tax)} THB`),
                          ],
                        ]),
                    [
                      bodyText(
                        s.type === "receipt"
                          ? "ยอดชำระเงินทั้งสิ้น / Total Paid"
                          : "ยอดรวม / Total",
                        {
                          bold: true,
                          fontSize: 22,
                          fillColor: tint(primary, 0.75),
                        },
                      ),
                      {
                        ...right(`${formatDocumentMoney(s.totals.total)} THB`),
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
              bodyText("จำนวนเงินตัวอักษร / Amount in Words", {
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
        margin: [0, 0, 0, 4],
      });
    }
    const remarks = [
      section("หมายเหตุ / Remark"),
      ...(s.remarks?.length
        ? s.remarks.map((r) => bodyText(r))
        : [bodyText(s.paymentTerms || "-")]),
    ];
    const accounts = [
      section("บัญชีรับชำระ / Payment Accounts"),
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
          body: [[{ stack: remarks, fillColor: "#f3f4f5" }]],
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => 9,
          paddingRight: () => 9,
          paddingTop: () => 6,
          paddingBottom: () => 6,
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
    ? `${buddhistDateTime.format(instant)} (Asia/Bangkok)`
    : value;
}
