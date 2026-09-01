import { OperationPage } from '../../features/shared/operation-page';
export default function Page() { return <OperationPage eyebrow='SCHOOLS' title='โรงเรียน' description='จัดการโรงเรียนทั้งหมดในแพลตฟอร์มและสถานะการเชื่อมต่อ' action='โรงเรียนใหม่' columns={['รายการ','รายละเอียด','ข้อมูล','สถานะ']} rows={[['โรงเรียนบ้านคลองแสน','ภาคกลาง','3 sites','ออนไลน์'],['โรงเรียนบ้านไผ่เมือง','ภาคตะวันออกเฉียงเหนือ','2 sites','ออนไลน์'],['โรงเรียนเทศบาลหนองยาง','ภาคเหนือ','1 site','ต้องตรวจสอบ']]} />; }

