import { OperationPage } from '../../../features/shared/operation-page';
export const dynamic = 'force-dynamic';
export default function Page() { return <OperationPage resource='contracts' eyebrow='CONTRACTS & RATES' title='สัญญาและอัตราค่าไฟ' description='จัดการ version, effective date, ผู้ลงนาม และ rate ต่อ Site' action='สร้างสัญญา' />; }
