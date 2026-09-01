import { OperationPage } from '../../features/shared/operation-page';
export default function Page() { return <OperationPage eyebrow='DOCUMENTS' title='เอกสาร' description='ใบแจ้งหนี้ ใบเสร็จรับเงิน และเอกสารตามสัญญา' action='อัปโหลดเอกสาร' columns={['รายการ','รายละเอียด','ข้อมูล','สถานะ']} rows={[['INV-2026-000128','โรงเรียนบ้านคลองแสน','ใบแจ้งหนี้ · 31 ส.ค. 2569','ออกแล้ว'],['RCT-2026-000112','โรงเรียนบ้านไผ่เมือง','ใบเสร็จรับเงิน · 2 ก.ย. 2569','ออกแล้ว'],['CON-2026-000021','โรงเรียนเทศบาลหนองยาง','สัญญา · v2','ใช้งานอยู่']]} />; }

