import type { DocumentSnapshot, DocumentParty } from "./document-layout.js";
import { formatDocumentDate } from "./document-layout.js";
/** Exact decimal conversion: one MWp = 1000 kWp; missing facts remain missing. */
export function capacityKwp(
  value: string | null | undefined,
): string | undefined {
  if (value == null || !/^\d+(\.\d+)?$/.test(value)) return undefined;
  const [whole, fraction = ""] = value.split(".");
  const digits = (whole! + fraction.padEnd(3, "0").slice(0, 3)).replace(
    /^0+(?=\d)/,
    "",
  );
  const remainder = fraction.slice(3).replace(/0+$/, "");
  return digits + (remainder ? `.${remainder}` : "");
}
const identity = (p: DocumentParty) =>
  `${p.name}\nที่อยู่: ${p.address}\nเลขประจำตัวผู้เสียภาษี: ${p.taxId}${p.branch ? ` (${p.branch})` : ""}\nโทร: ${p.phone || "-"}   อีเมล: ${p.email || "-"}`;
/** Adopted docs/ppa-local-draft-reference-2026-10-08.md. Call ONLY at issuance under
 * the exact localFinancialBinding. Renderer consumes saved text without a template lookup. */
export function freezeLocalPpaDraft(
  s: DocumentSnapshot,
): Pick<DocumentSnapshot, "ppaOpening" | "ppaClauses"> {
  const titles = [
    "คู่สัญญา",
    "วัตถุประสงค์ของสัญญา",
    "สถานที่ติดตั้งระบบ",
    "ระยะเวลาสัญญา",
    "อัตราค่าไฟฟ้า",
    "การวัดหน่วยและการออกใบแจ้งหนี้",
    "เงื่อนไขการชำระเงิน",
    "การบำรุงรักษาและความรับผิดชอบ",
    "การบอกเลิกสัญญา",
    "ข้อกำหนดทั่วไป",
  ];
  const bodies = [
    `1.1 ผู้ขาย: ${identity(s.issuer)}\n1.2 ผู้ซื้อ: ${identity(s.customer)}`,
    "ผู้ขายตกลงขาย และผู้ซื้อตกลงซื้อไฟฟ้าที่ผลิตจากพลังงานแสงอาทิตย์จากระบบผลิตไฟฟ้าของผู้ขาย ณ สถานที่ติดตั้งตามที่ระบุในสัญญา เพื่อใช้ในการดำเนินงานของผู้ซื้อ โดยเป็นไปตามเงื่อนไขและราคาที่กำหนดในสัญญาฉบับนี้",
    `ไซต์งาน: ${s.siteName || "ไม่ระบุ"}${s.siteExternalId ? ` (${s.siteExternalId})` : ""}\nขนาดกำลังการผลิต: ${s.capacityKwp === undefined ? "ไม่ระบุ / Not specified" : `${s.capacityKwp} kWp`}`,
    `สัญญาฉบับนี้เริ่มมีผลตั้งแต่วันที่ ${s.startDate ? formatDocumentDate(s.startDate) : "ไม่ระบุ"}${s.endDate ? ` และสิ้นสุดวันที่ ${formatDocumentDate(s.endDate)}` : " และมีผลต่อเนื่องจนกว่าจะมีการบอกเลิกสัญญาโดยฝ่ายใดฝ่ายหนึ่ง หรือมีข้อตกลงเป็นอย่างอื่นเป็นลายลักษณ์อักษร"}`,
    "ผู้ขายตกลงขายไฟฟ้าให้แก่ผู้ซื้อในอัตราค่าไฟฟ้าตามช่วงเวลาที่กำหนด ดังนี้",
    "6.1 ปริมาณไฟฟ้าที่จำหน่ายให้แก่ผู้ซื้อให้ถือจากค่าที่วัดได้จากมิเตอร์ของระบบผลิตไฟฟ้าของผู้ขาย\n6.2 ผู้ขายจะออกใบแจ้งหนี้เป็นรายเดือน โดยระบุปริมาณหน่วยไฟฟ้า อัตราค่าไฟฟ้า และจำนวนเงินที่ต้องชำระ\n6.3 ผู้ซื้อสามารถตรวจสอบข้อมูลการใช้ไฟฟ้าได้จากรายการอ่านมิเตอร์ที่ผู้ขายจัดส่งให้",
    `7.1 ผู้ซื้อตกลงชำระเงินค่าซื้อไฟฟ้าภายใน ${s.paymentTermDays == null ? "ไม่ระบุ" : s.paymentTermDays} วัน นับจากวันที่ได้รับใบแจ้งหนี้\n7.2 การชำระเงินให้โอนเข้าบัญชีธนาคารของผู้ขายตามที่ระบุในใบแจ้งหนี้\n7.3 หากผู้ซื้อชำระเงินล่าช้า ผู้ขายมีสิทธิเรียกเก็บดอกเบี้ยในอัตราที่กฎหมายกำหนด${s.paymentTerms ? `\nเงื่อนไขที่บันทึกไว้: ${s.paymentTerms}` : ""}`,
    "8.1 ผู้ขายเป็นผู้รับผิดชอบในการบำรุงรักษาระบบผลิตไฟฟ้าให้อยู่ในสภาพพร้อมใช้งานตลอดระยะเวลาสัญญา\n8.2 ผู้ซื้อเป็นผู้รับผิดชอบในการใช้งานไฟฟ้าที่ได้รับจากระบบผลิตไฟฟ้าตามวัตถุประสงค์ของสัญญา",
    "คู่สัญญาสามารถบอกเลิกสัญญาได้โดยทำเป็นหนังสือแจ้งล่วงหน้าไม่น้อยกว่า90วัน เว้นแต่มีเหตุอันสมควรตามที่กฎหมายกำหนด",
    "10.1 สัญญานี้อยู่ภายใต้กฎหมายไทย\n10.2 หากมีข้อพิพาท ให้คู่สัญญาเจรจาหรือไกล่เกลี่ยกันก่อน และหากไม่สามารถตกลงกันได้ให้ขึ้นศาลที่มีเขตอำนาจในกรุงเทพมหานคร\n10.3 สัญญานี้จัดทำขึ้น2ฉบับ มีข้อความถูกต้องตรงกัน คู่สัญญาได้อ่านและเข้าใจโดยตลอดแล้ว จึงได้ลงลายมือชื่อไว้เป็นสำคัญ",
  ];
  return {
    ppaOpening: `สัญญาฉบับนี้ (“สัญญา”) ทำขึ้นระหว่าง ${s.issuer.name} (“ผู้ขาย”) และ ${s.customer.name} (“ผู้ซื้อ”) โดยทั้งสองฝ่ายตกลงทำสัญญาซื้อขายไฟฟ้าจากพลังงานแสงอาทิตย์ ภายใต้เงื่อนไขดังต่อไปนี้`,
    ppaClauses: bodies.map((body, i) => ({
      number: i + 1,
      title: titles[i]!,
      body,
    })),
  };
}
