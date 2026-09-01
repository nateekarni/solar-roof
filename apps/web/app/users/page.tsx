import { OperationPage } from '../../features/shared/operation-page';
export default function Page() { return <OperationPage eyebrow='IDENTITY' title='ผู้ใช้งาน' description='จัดการ owner, admin และ school_user พร้อมขอบเขตโรงเรียน' action='เชิญผู้ใช้' columns={['รายการ','รายละเอียด','ข้อมูล','สถานะ']} rows={[['Somchai Admin','admin','โรงเรียนบ้านคลองแสน, บ้านไผ่เมือง','ใช้งานอยู่'],['Suda School','school_user','โรงเรียนบ้านคลองแสน','ใช้งานอยู่'],['Narin School','school_user','โรงเรียนเทศบาลหนองยาง','รอการยืนยัน']]} />; }

