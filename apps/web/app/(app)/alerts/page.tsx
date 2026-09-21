import { OperationPage } from '../../../features/shared/operation-page';
export const dynamic = 'force-dynamic';
export default function Page() { return <OperationPage resource='alerts' eyebrow='ALERTS' title='การแจ้งเตือน' description='ติดตาม alarm ของ Gateway, Meter และ Inverter พร้อมประวัติการรับทราบ' action='รับทราบทั้งหมด' />; }
