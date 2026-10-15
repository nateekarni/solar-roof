import type {Locale} from '@solar/i18n';

export function getFinancialDocumentIntroText({resource,role,locale}:{resource:string;role:string;locale:Locale}): string {
 if(!['billing','contracts','receipts'].includes(resource)||!['owner','customer_user'].includes(role))return '';
 const customer=role==='customer_user';const th=locale==='th';
 return resource==='billing'?(customer?(th?'ดูใบวางบิลขององค์กร ตรวจสอบยอดค่าไฟและวันครบกำหนด แล้วส่งหลักฐานการชำระเงิน':'View invoices for your organization, check electricity charges and due dates, and submit payment evidence.'):(th?'ตรวจสอบยอดเรียกเก็บ วันครบกำหนด และสถานะการชำระเงิน':'Review billed amounts, due dates and payment status.')):resource==='contracts'?(customer?(th?'ดูสัญญาและอัตราค่าไฟขององค์กร':'View contracts and electricity rates for your organization.'):(th?'จัดการสัญญาและอัตราค่าไฟสำหรับเอกสารเรียกเก็บเงิน':'Manage contracts and electricity rates for billing.')):(customer?(th?'ดูใบเสร็จรับเงินขององค์กรและดาวน์โหลดเอกสารที่ออกแล้ว':'View receipts for your organization and download issued documents.'):(th?'ตรวจสอบใบเสร็จรับเงินและดาวน์โหลดเอกสารที่ออกแล้ว':'Review receipts and download issued documents.'));
}

export function FinancialDocumentIntro({resource,role,locale}:{resource:string;role:string;locale:Locale}) {
 const text = getFinancialDocumentIntroText({resource, role, locale});
 if(!text)return null;
 return <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{text}</p>;
}
