import { OperationPage } from '../../features/shared/operation-page';
export default function Page() { return <OperationPage eyebrow='ALERTS' title='การแจ้งเตือน' description='ติดตาม alarm ของ Gateway, Meter และ Inverter พร้อมประวัติการรับทราบ' action='รับทราบทั้งหมด' columns={['รายการ','รายละเอียด','ข้อมูล','สถานะ']} rows={[['ALM-0091','Gateway GW-007 · offline','1 ชั่วโมงที่แล้ว','ต้องดำเนินการ'],['ALM-0090','Inverter INV-03 · over temperature','3 ชั่วโมงที่แล้ว','กำลังตรวจสอบ'],['ALM-0088','Meter MTR-12 · stale data','เมื่อวาน','รับทราบแล้ว']]} />; }

