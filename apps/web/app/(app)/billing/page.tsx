import { OperationPage } from '../../../features/shared/operation-page';
export const dynamic = 'force-dynamic';
export default function Page() { return <OperationPage resource='billing' eyebrow='BILLING & INVOICES' title='ใบแจ้งหนี้และรอบการเรียกเก็บเงิน' description='ตรวจสอบและจัดการใบแจ้งหนี้ รอบการเรียกเก็บเงิน ตรวจหลักฐานสลิป และติดตามสถานะการชำระเงิน' action='สร้างรอบบิล' />; }
