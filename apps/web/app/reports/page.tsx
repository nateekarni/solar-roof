import { OperationPage } from '../../features/shared/operation-page';
export default function Page() { return <OperationPage eyebrow='REPORTS' title='รายงาน' description='ส่งออกข้อมูลพลังงาน อุปกรณ์ การเงิน การชำระเงิน และ audit' action='สร้างรายงาน' columns={['รายการ','รายละเอียด','ข้อมูล','สถานะ']} rows={[['Energy monthly','ทุกโรงเรียน · ส.ค. 2569','CSV / XLSX','พร้อมดาวน์โหลด'],['Device health','ทุก Gateway · วันนี้','PDF','กำลังประมวลผล'],['Audit events','owner · เดือนนี้','CSV','พร้อมดาวน์โหลด']]} />; }

