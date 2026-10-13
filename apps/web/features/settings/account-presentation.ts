export function canDismissAuthenticator(busy:boolean,recoveryCodeCount:number):boolean{
 return !busy&&recoveryCodeCount===0;
}
const roleLabels:Record<string,readonly [string,string]>={
 owner:['เจ้าของ','Owner'],admin:['ผู้ดูแลระบบ','Administrator'],operator:['ผู้ปฏิบัติงาน','Operator'],accountant:['นักบัญชี','Accountant'],customer_user:['ผู้ใช้งานลูกค้า','Customer user'],
};
export function accountRoleLabel(role:string|undefined,locale:string):string{
 return roleLabels[role??'']?.[locale==='th'?0:1]??(locale==='th'?'ไม่มีข้อมูล':'Not available');
}
