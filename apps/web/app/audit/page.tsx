import { OperationPage } from '../../features/shared/operation-page';
export default function Page() { return <OperationPage eyebrow='AUDIT TRAIL' title='Audit log' description='ตรวจสอบเหตุการณ์สำคัญและการเปลี่ยนแปลงข้อมูลแบบ append-only' action='ส่งออก log' columns={['รายการ','รายละเอียด','ข้อมูล','สถานะ']} rows={[['09:41:12','owner@natee.co','APPROVE_BILLING','โรงเรียนบ้านคลองแสน · สิงหาคม','สำเร็จ'],['09:18:04','admin@solar.co','UPDATE_GATEWAY','GW-007 · polling interval 60s','สำเร็จ'],['เมื่อวาน','school.user@school.th','UPLOAD_EVIDENCE','RCT-2026-000112','สำเร็จ']]} />; }

