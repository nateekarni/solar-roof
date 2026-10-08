import { formatAppDateTime } from '../../lib/date-format';
import { formatTransferAmount,pendingTransferTotal } from './payment-input';
export interface TransferHistoryRow {id:string;amount:string;status:string;transferDate?:string|null;rejectionReason?:string|null;}
export function PaymentHistory({payments,locale}:{payments:TransferHistoryRow[];locale:'th'|'en'}) {
 if(!payments.length)return null;
 let total='—';try{total=formatTransferAmount(pendingTransferTotal(payments));}catch{}
 const status=(value:string)=>({pending_verification:locale==='th'?'รอตรวจสอบ':'Pending verification',paid:locale==='th'?'อนุมัติแล้ว':'Approved',rejected:locale==='th'?'ปฏิเสธ':'Rejected'}[value]??value);
 return <section aria-label={locale==='th'?'ประวัติการโอนเงิน':'Transfer history'} className="space-y-3 border-t pt-4">
  <h3 className="font-semibold">{locale==='th'?'ประวัติการโอนเงิน':'Transfer history'}</h3>
  <ul className="space-y-2">{payments.map(payment=><li key={payment.id} className="space-y-1 border-b pb-2">
   <div className="flex justify-between gap-2"><span className="font-mono">฿{formatTransferAmount(payment.amount)}</span><span>{status(payment.status)}</span></div>
   <p className="text-muted-foreground">{payment.transferDate?formatAppDateTime(payment.transferDate,locale):'—'}</p>
   {payment.rejectionReason&&<p>{locale==='th'?'เหตุผลการปฏิเสธ: ':'Rejection reason: '}{payment.rejectionReason}</p>}
  </li>)}</ul>
  <p className="font-semibold">{locale==='th'?'ยอดโอนรวมที่รอตรวจสอบ: ':'Total pending transfers: '}฿{total}</p>
  <p className="text-muted-foreground">{locale==='th'?'อนุมัติได้เมื่อยอดที่รอตรวจสอบรวมเท่ากับยอดบิล การปฏิเสธจะปฏิเสธรายการที่รอตรวจสอบทั้งหมด และเก็บประวัติไว้':'Approval requires the pending total to equal the bill. Rejection applies to all pending transfers and retains their history.'}</p>
 </section>;
}