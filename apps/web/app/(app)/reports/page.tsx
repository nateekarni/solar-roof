import { OperationPage } from '../../../features/shared/operation-page';
export const dynamic = 'force-dynamic';
export default function Page() { return <OperationPage resource='reports' eyebrow='REPORTS' title='รายงาน' description='ส่งออกข้อมูลพลังงาน อุปกรณ์ การเงิน การชำระเงิน และ audit' action='สร้างรายงาน' />; }
