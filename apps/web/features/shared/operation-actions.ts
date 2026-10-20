import type {Capabilities,OperationAction,OperationRow} from '@solar/api-contracts';

/** Policy originates in server capabilities; status only narrows allowed actions. */
export function getOperationActions(resource:string,row:OperationRow,capabilities:Capabilities):OperationAction[] {
 const actions:OperationAction[]=[];
 if(resource==='billing') {
  actions.push({id:'detail',label:'ดูรายละเอียดรอบบิล',enabled:true});
  if(row.billingStatusView==='pending_issue_approval'&&capabilities.operationsActions?.includes('approve_invoice'))actions.push({id:'approve_issuance',label:'อนุมัติและออกเอกสาร',enabled:true});
  if(capabilities.operationsActions?.includes('submit_payment')&&(['approved','pending_review','rejected'].includes(String(row.status))||(capabilities.financialScope==='TEST'&&row.status==='pending_verification')))actions.push({id:'pay',label:'ชำระเงินและแนบสลิป',enabled:true});
  const outstanding=typeof row.outstandingAmount==='string'&&/^\d+(?:\.\d+)?$/.test(row.outstandingAmount)?Number(row.outstandingAmount):0;
  if(capabilities.operationsActions?.includes('record_cash_payment')&&outstanding>0&&Number(row.pendingEvidenceCount??0)===0&&['awaiting_payment','overdue','partially_paid'].includes(String(row.billingStatusView))&&['approved','partially_paid'].includes(String(row.status)))actions.push({id:'cash',label:'รับชำระเงินสด',enabled:true});
  if(capabilities.actions.includes('approve_payment')&&(row.status==='pending_verification'||row.paymentStatus==='pending_verification'))actions.push({id:'verify',label:'ตรวจสอบสลิปการโอน',enabled:true});
 }
 for(const type of ['invoice','receipt'] as const) {
  if(!['billing','documents','receipts'].includes(resource)||!capabilities.operationsActions?.includes('read_'+type))continue;
  if(resource==='receipts'&&type!=='receipt')continue;
  if(resource==='documents'&&row.type!==type)continue;
  const id=resource==='billing'?row[type+'Id']:row.id;
  actions.push({id:type,label:type==='invoice'?'ดูใบวางบิล':'ดูใบเสร็จรับเงิน',enabled:typeof id==='string'&&!!id,...(id?{}:{reason:'ยังไม่มีเอกสารที่ออกและบันทึกไว้สำหรับรายการนี้'})});
 }
 return actions;
}
