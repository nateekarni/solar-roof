import { OperationPage } from '../../features/shared/operation-page';
export default function Page() { return <OperationPage eyebrow='BILLING' title='การเรียกเก็บเงิน' description='ตรวจสอบ preview รอบบิล อนุมัติ และติดตามสถานะการชำระเงิน' action='สร้างรอบบิล' columns={['รายการ','รายละเอียด','ข้อมูล','สถานะ']} rows={[['2026-08 · โรงเรียนบ้านคลองแสน','1,824.50 kWh','฿4,926.15','รอตรวจสอบ'],['2026-08 · โรงเรียนบ้านไผ่เมือง','1,742.20 kWh','฿4,704.00','พร้อมออกเอกสาร'],['2026-07 · โรงเรียนเทศบาลหนองยาง','1,680.00 kWh','฿4,536.00','ชำระแล้ว']]} />; }

