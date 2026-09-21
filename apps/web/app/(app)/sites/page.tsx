import { OperationPage } from '../../../features/shared/operation-page';
export const dynamic = 'force-dynamic';
export default function Page() { return <OperationPage resource='sites' eyebrow='SITES & GATEWAYS' title='ไซต์และ Gateway' description='ติดตาม Gateway, Billing Meter และอุปกรณ์ของแต่ละโรงเรียน' action='เพิ่มไซต์' />; }
