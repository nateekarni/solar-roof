import { formatAppDateTime } from '../../lib/date-format';
import { formatTransferAmount,pendingTransferTotal } from './payment-input';
import type {PaymentTransferRow} from '@solar/api-contracts';
import {paymentMetadataCopy} from './payment-metadata-copy';
export type TransferHistoryRow = PaymentTransferRow;
export function PaymentHistory({payments,locale}:{payments:TransferHistoryRow[];locale:'th'|'en'}) {
 if(!payments.length)return null;
 const copy=paymentMetadataCopy[locale];

 const status=(value:string)=>({pending_verification:locale==='th'?'รอตรวจสอบ':'Pending verification',paid:locale==='th'?'อนุมัติแล้ว':'Approved',rejected:locale==='th'?'ปฏิเสธ':'Rejected'}[value]??(locale==='th'?'ไม่ทราบสถานะ':'Unknown status'));
 return <section aria-label={locale==='th'?'ประวัติการโอนเงิน':'Transfer history'} className="space-y-3 border-t pt-4">
  <h3 className="font-semibold">{locale==='th'?'ประวัติการโอนเงิน':'Transfer history'}</h3>
  <ul className="space-y-2">{payments.map(payment=><li key={payment.id} className="space-y-1 border-b pb-2">
   <div className="flex justify-between gap-2"><span className="font-mono">{payment.verifiedAmount ? '฿'+formatTransferAmount(payment.verifiedAmount) : locale==='th'?'รอตรวจยอด':'Awaiting amount verification'}</span><span>{status(payment.status)}</span></div>
   <p className="text-muted-foreground">{payment.verifiedTransferAt?formatAppDateTime(payment.verifiedTransferAt,locale):'—'}</p>
   <dl className="grid grid-cols-2 gap-x-3 text-sm">
    <>{payment.payerName&&<><dt>{copy.payerName}</dt><dd>{payment.payerName}</dd></>}</>
    {payment.paymentMethod&&<><dt>{copy.paymentMethod}</dt><dd>{copy[payment.paymentMethod]}</dd></>}
    {payment.transferChannel&&<><dt>{copy.transferChannel}</dt><dd>{copy[payment.transferChannel]}</dd></>}
    {payment.originBank&&<><dt>{copy.originBank}</dt><dd>{payment.originBank}</dd></>}
    {payment.originAccount&&<><dt>{copy.originAccount}</dt><dd>{payment.originAccount}</dd></>}
   </dl>
   {payment.slipUrl&&<a className="text-primary underline" href={payment.slipUrl} target="_blank" rel="noreferrer">{locale==='th'?'เปิดหลักฐานการโอน':'Open transfer evidence'}</a>}
   {payment.rejectionReason&&<p>{locale==='th'?'เหตุผลการปฏิเสธ: ':'Rejection reason: '}{payment.rejectionReason}</p>}
  </li>)}</ul>
  <p className="text-muted-foreground">{locale==='th'?'ตรวจแต่ละรายการแยกกัน ออกใบเสร็จเมื่อยอดที่อนุมัติครบยอดบิล':'Each transfer is reviewed separately. A receipt is issued when verified transfers exactly settle the bill.'}</p>
 </section>;
}
