import type {Capabilities,OperationRow} from '@solar/api-contracts';
import {Button} from '../../components/ui/button';
import {getOperationActions} from '../shared/operation-actions';
import {PaymentHistory,type TransferHistoryRow} from './payment-history';
export function billingRecordTransfers(value:unknown):TransferHistoryRow[] {
 if(!Array.isArray(value))return [];
 return value.filter((entry):entry is TransferHistoryRow=>typeof entry==='object'&&entry!==null&&'id' in entry&&typeof entry.id==='string'&&'amount' in entry&&typeof entry.amount==='string'&&'status' in entry&&typeof entry.status==='string');
}
export function BillingRecordPanel({row,capabilities,locale,onPay,onVerify,historyVisible=true}:{row:OperationRow;capabilities:Capabilities;locale:'th'|'en';onPay:()=>void;onVerify:()=>void;historyVisible?:boolean}) {
 const actions=getOperationActions('billing',row,capabilities),unpaid=row.status!=='paid';
 const pay=unpaid&&actions.some(action=>action.id==='pay'&&action.enabled),verify=unpaid&&actions.some(action=>action.id==='verify'&&action.enabled);
 return <section className="space-y-4" aria-label={locale==='th'?'การชำระเงินรอบบิล':'Billing payment actions'}>
  {(pay||verify)&&<div className="flex flex-wrap gap-2">
   {pay&&<Button onClick={onPay}>{locale==='th'?'ส่งหลักฐานการโอนเงิน':'Submit transfer evidence'}</Button>}
   {verify&&<Button variant="outline" onClick={onVerify}>{locale==='th'?'ตรวจสอบรายการโอนที่รออนุมัติ':'Verify pending transfers'}</Button>}
  </div>}
  {historyVisible&&<PaymentHistory payments={billingRecordTransfers(row.payments)} locale={locale}/>}
 </section>;
}