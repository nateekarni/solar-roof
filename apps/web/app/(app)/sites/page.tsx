import { OperationPage } from '../../../features/shared/operation-page';
import type { OperationSearchParams } from '../../../features/shared/operation-request-query';
export const dynamic = 'force-dynamic';
export default function Page({searchParams}:{searchParams:Promise<OperationSearchParams>}) { return <OperationPage resource='sites' eyebrow='SITES & GATEWAYS' title='ไซต์งาน' description='จัดการข้อมูลไซต์งานและการตั้งค่าบริการ' action='เพิ่มไซต์' searchParams={searchParams} />; }
