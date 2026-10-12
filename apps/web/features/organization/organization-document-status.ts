const labels: Record<string, [string, string]> = {
    approved: ["อนุมัติแล้ว", "Approved"],
    pending_approval: ["รออนุมัติ", "Awaiting approval"],
    pending_review: ["รอตรวจสอบ", "Awaiting review"],
    finalized: ["ยืนยันแล้ว", "Finalized"],
    awaiting_payment: ["รอชำระ", "Awaiting payment"],
    payment_rejected: ["หลักฐานถูกปฏิเสธ", "Proof rejected"],
    issued: ["ออกแล้ว", "Issued"],
    superseded: ["ถูกแทนที่ด้วยฉบับใหม่", "Replaced by a new version"],
    paid: ["ชำระแล้ว", "Paid"],
    draft: ["ฉบับร่าง", "Draft"],
    cancelled: ["ยกเลิก", "Cancelled"],
    pending_verification: ["รอตรวจสอบ", "Awaiting verification"],
    rejected: ["หลักฐานถูกปฏิเสธ", "Proof rejected"],
    active: ["ใช้งาน", "Active"],
    expired: ["หมดอายุ", "Expired"],
    unpaid: ["รอชำระ", "Awaiting payment"],
  };
  
export function organizationDocumentStatus(value: string | undefined, locale: 'th' | 'en') {
  return value ? (labels[value]?.[locale === 'th' ? 0 : 1] ?? value) : '—';
}

export function receiptDocumentStatus(value:string,locale:'th'|'en') {
 return ['issued','finalized','draft','cancelled','superseded'].includes(value)?organizationDocumentStatus(value,locale):(locale==='th'?'ไม่ทราบสถานะเอกสาร':'Unknown document status');
}
