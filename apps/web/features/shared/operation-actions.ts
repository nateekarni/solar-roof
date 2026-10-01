import type {Capabilities,OperationAction,OperationRow} from '@solar/api-contracts';

/** Policy originates in server capabilities; status only narrows allowed actions. */
export function getOperationActions(resource:string,row:OperationRow,capabilities:Capabilities):OperationAction[] {
 const actions:OperationAction[]=[];
 if(resource==='billing') {
  actions.push({id:'detail',label:'ดูรายละเอียดรอบบิล',enabled:true});
  if(capabilities.operationsActions?.includes('submit_payment')&&['approved','pending_review','rejected'].includes(String(row.status)))actions.push({id:'pay',label:'ชำระเงินและแนบสลิป',enabled:true});
  if(capabilities.actions.includes('approve_payment')&&(row.status==='pending_verification'||row.paymentStatus==='pending_verification'))actions.push({id:'verify',label:'ตรวจสอบสลิปการโอน',enabled:true});
 }
 for(const type of ['invoice','receipt'] as const) {
  if(!['billing','documents','receipts'].includes(resource)||!capabilities.operationsActions?.includes('read_'+type))continue;
  if(resource==='receipts'&&type!=='receipt')continue;
  if(resource==='documents'&&row.type!==type)continue;
  const id=resource==='billing'?row[type+'Id']:row.id;
  actions.push({id:type,label:type==='invoice'?'ดูใบแจ้งหนี้':'ดูใบเสร็จรับเงิน',enabled:typeof id==='string'&&!!id,...(id?{}:{reason:'ยังไม่มีเอกสารที่ออกและบันทึกไว้สำหรับรายการนี้'})});
 }
 return actions;
}
