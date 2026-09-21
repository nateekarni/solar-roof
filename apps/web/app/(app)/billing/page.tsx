import { OperationPage } from '../../../features/shared/operation-page';
export const dynamic = 'force-dynamic';
export default function Page() { return <OperationPage resource='billing' eyebrow='BILLING' title='การเรียกเก็บเงิน' description='ตรวจสอบ preview รอบบิล อนุมัติ และติดตามสถานะการชำระเงิน' action='สร้างรอบบิล' />; }
