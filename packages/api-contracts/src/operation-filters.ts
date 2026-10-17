/** Public filter vocabulary; SQL identifiers are chosen independently by the server. */
export interface OperationFilter {
 key: 'status'|'severity'|'type'|'role'|'entityType'|'channel'|'category'|'format';
 label: readonly [string,string];
 options: readonly {value:string;label:readonly [string,string]}[];
}
const option=(value:string,th:string,en:string)=>({value,label:[th,en] as const});
const status=(options:OperationFilter['options']):OperationFilter=>({key:'status',label:['สถานะ','Status'],options});
const active=status([option('active','ใช้งาน','Active'),option('inactive','ปิดใช้งาน','Inactive'),option('archived','เก็บถาวร','Archived')]);
const documentStatus=status([option('draft','ฉบับร่าง','Draft'),option('issued','ออกแล้ว','Issued'),option('finalized','ยืนยันแล้ว','Finalized'),option('superseded','ถูกแทนที่ด้วยฉบับใหม่','Replaced by a new version'),option('cancelled','ยกเลิก','Cancelled')]);
export const operationFilters:Record<string,readonly OperationFilter[]>={
 customers:[active],sites:[status([option('online','ออนไลน์','Online'),option('offline','ออฟไลน์','Offline'),option('inactive','ปิดใช้งาน','Inactive')])],
 billing:[],
 contracts:[status([option('draft','ฉบับร่าง','Draft'),option('active','ใช้งาน','Active'),option('expired','หมดอายุ','Expired'),option('terminated','สิ้นสุด','Terminated'),option('cancelled','ยกเลิก','Cancelled')])],
 documents:[documentStatus,{key:'type',label:['ประเภท','Type'],options:[option('invoice','ใบวางบิล','Billing statement'),option('receipt','ใบเสร็จรับเงิน','Receipt'),option('billing_statement','สรุปยอดเรียกเก็บ','Billing summary'),option('contract','สัญญา','Contract')]}],
 receipts:[documentStatus],
 alerts:[status([option('open','ยังไม่รับทราบ','Open'),option('acknowledged','รับทราบแล้ว','Acknowledged'),option('resolved','กลับสู่ปกติ','Resolved')]),{key:'severity',label:['ความรุนแรง','Severity'],options:[option('critical','วิกฤต','Critical'),option('error','ร้ายแรง','Error'),option('warning','คำเตือน','Warning'),option('info','ข้อมูล','Info')]}],
 users:[status([option('active','ใช้งาน','Active'),option('inactive','ปิดใช้งาน','Inactive'),option('invited','รอตอบรับ','Invited')]),{key:'role',label:['บทบาท','Role'],options:[option('owner','เจ้าของระบบ','Owner'),option('admin','ผู้ดูแลระบบ','Admin'),option('operator','เจ้าหน้าที่','Operator'),option('accountant','ฝ่ายบัญชี','Accountant'),option('customer_user','ลูกค้า','Customer')]}],
 audit:[{key:'entityType',label:['ประเภทข้อมูล','Entity type'],options:[option('site','ไซต์งาน','Site'),option('gateway','เกตเวย์','Gateway'),option('device','อุปกรณ์','Device'),option('user','บัญชีผู้ใช้','User'),option('customer','ลูกค้า','Customer'),option('billing_cycle','รอบบิล','Billing cycle'),option('payment','การชำระเงิน','Payment'),option('document','เอกสาร','Document'),option('settings','การตั้งค่า','Settings')]}],
 notifications:[status([option('pending','รอส่ง','Pending'),option('sent','ส่งแล้ว','Sent'),option('failed','ส่งไม่สำเร็จ','Failed')]),{key:'channel',label:['ช่องทาง','Channel'],options:[option('email','อีเมล','Email'),option('in_app','ในระบบ','In app')]}],
 reports:[{key:'format',label:['รูปแบบ','Format'],options:[option('CSV','CSV','CSV'),option('XLSX','Excel','Excel'),option('PDF','PDF','PDF')]}],
};
