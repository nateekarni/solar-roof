import { OperationPage } from '../../../features/shared/operation-page';
import type { OperationSearchParams } from '../../../features/shared/operation-request-query';
export const dynamic = 'force-dynamic';
export default function Page({searchParams}:{searchParams:Promise<OperationSearchParams>}) { return <OperationPage resource='notifications' eyebrow='NOTIFICATION CENTER' title='การแจ้งเตือน' description='Alarm, เอกสารออกใหม่ และสถานะการชำระเงิน พร้อมผลการส่งอีเมล' action='ตั้งค่าการแจ้งเตือน' searchParams={searchParams} />; }
