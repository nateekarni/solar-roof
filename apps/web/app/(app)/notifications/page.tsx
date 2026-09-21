import { OperationPage } from '../../../features/shared/operation-page';
export const dynamic = 'force-dynamic';
export default function Page() { return <OperationPage resource='notifications' eyebrow='NOTIFICATION CENTER' title='การแจ้งเตือน' description='Alarm, เอกสารออกใหม่ และสถานะการชำระเงิน พร้อมผลการส่งอีเมล' action='ตั้งค่าการแจ้งเตือน' />; }
