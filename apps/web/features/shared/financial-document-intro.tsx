import type {Locale} from '@solar/i18n';
export function FinancialDocumentIntro({resource,role,locale}:{resource:string;role:string;locale:Locale}) {
 if(!['billing','contracts','receipts'].includes(resource)||!['owner','school_user'].includes(role))return null;
 const school=role==='school_user';const th=locale==='th';
 const text=resource==='billing'?(school?(th?'ดูใบแจ้งหนี้ของโรงเรียน ตรวจสอบยอดค่าไฟและวันครบกำหนด แล้วส่งหลักฐานการชำระเงิน':'View invoices for your school, check electricity charges and due dates, and submit payment evidence.'):(th?'ตรวจสอบยอดเรียกเก็บ วันครบกำหนด และสถานะการชำระเงิน':'Review billed amounts, due dates and payment status.')):resource==='contracts'?(school?(th?'ดูสัญญาและอัตราค่าไฟของโรงเรียน':'View contracts and electricity rates for your school.'):(th?'จัดการสัญญาและอัตราค่าไฟสำหรับเอกสารเรียกเก็บเงิน':'Manage contracts and electricity rates for billing.')):(school?(th?'ดูใบเสร็จรับเงินของโรงเรียนและดาวน์โหลดเอกสารที่ออกแล้ว':'View receipts for your school and download issued documents.'):(th?'ตรวจสอบใบเสร็จรับเงินและดาวน์โหลดเอกสารที่ออกแล้ว':'Review receipts and download issued documents.'));
 return <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{text}</p>;
}
