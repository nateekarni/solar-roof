import { OperationPage } from '../../features/shared/operation-page';
export default function Page() { return <OperationPage eyebrow='SITES & GATEWAYS' title='ไซต์และ Gateway' description='ติดตาม Gateway, Billing Meter และอุปกรณ์ของแต่ละโรงเรียน' action='เพิ่มไซต์' columns={['รายการ','รายละเอียด','ข้อมูล','สถานะ']} rows={[['SITE-001','โรงเรียนบ้านคลองแสน','GW-001 · MQTT','ออนไลน์'],['SITE-002','โรงเรียนบ้านไผ่เมือง','GW-002 · Modbus TCP','ออนไลน์'],['SITE-003','โรงเรียนเทศบาลหนองยาง','GW-007 · MQTT','ออฟไลน์']]} />; }

