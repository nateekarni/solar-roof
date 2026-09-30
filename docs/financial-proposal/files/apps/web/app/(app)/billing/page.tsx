import { OperationPage } from '../../../features/shared/operation-page';
import { FinancialWorkStatus } from '../../../features/billing/financial-work-status';
export const dynamic = 'force-dynamic';
export default function Page() { return <><FinancialWorkStatus/><OperationPage resource='billing' eyebrow='BILLING & INVOICES' title='ใบแจ้งหนี้และรอบการเรียกเก็บเงิน' description='ระบบออกบิลอัตโนมัติจากข้อมูลมิเตอร์จริง ตรวจหลักฐานชำระและติดตามเอกสารของแต่ละรอบ' action='' /></>; }
