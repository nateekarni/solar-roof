import { OperationPage } from '../../../features/shared/operation-page';
import type { OperationSearchParams } from '../../../features/shared/operation-request-query';
export const dynamic = 'force-dynamic';
export default function Page({searchParams}:{searchParams:Promise<OperationSearchParams>}) { return <OperationPage resource='customers' eyebrow='ORGANIZATIONS' title='องค์กร' description='จัดการองค์กรทั้งหมดในแพลตฟอร์มและสถานะการเชื่อมต่อ' action='องค์กรใหม่' searchParams={searchParams} />; }
