'use client';
import {FileText,ImageIcon,ChevronDown} from 'lucide-react';
import {InlinePdfCanvas} from '../shared/inline-pdf-canvas';
import {InlineOriginalDocument} from '../shared/inline-original-document';
import {originalSourceFromRow,type OriginalDocumentSource} from '../shared/original-document-loader';
import {billingRecordTransfers} from './billing-record-panel';
import {type TransferHistoryRow} from './payment-history';
import {formatAppDateTime} from '../../lib/date-format';
import type {ReactNode} from 'react';
import {Button} from '../../components/ui/button';

export type FinancialDocument = {id:string;kind:'invoice'|'receipt'|'payment';source?:OriginalDocumentSource;payment?:TransferHistoryRow;number?:string};
export function financialDocuments(resource:string,row:Record<string,unknown>,billing:Record<string,unknown>|null):FinancialDocument[] {
 const invoiceDoc: FinancialDocument[] = [];
 if(resource==='billing'||billing) {
  const bill=billing??row;
  invoiceDoc.push({id:'invoice',kind:'invoice',number:String(bill.invoiceNumber??''),source:originalSourceFromRow('invoice',bill,'billing')});
 }
 const receiptDocs: FinancialDocument[] = [];
 if(resource==='receipts'||billing?.receiptId) {
  const receipt=resource==='receipts'?row:billing!;
  receiptDocs.push({id:'receipt',kind:'receipt',number:String(receipt.documentNumber??receipt.receiptNumber??''),source:originalSourceFromRow('receipt',receipt,resource)});
 }
 const pendingPayments: FinancialDocument[] = [];
 const otherPayments: FinancialDocument[] = [];
 for(const payment of billingRecordTransfers(billing?.payments??row.payments)) {
  const doc: FinancialDocument = {id:'payment:'+payment.id,kind:'payment',payment};
  if(payment.status==='pending_verification') {
   pendingPayments.push(doc);
  } else {
   otherPayments.push(doc);
  }
 }
 return [...pendingPayments, ...invoiceDoc, ...otherPayments, ...receiptDocs];
}
export function initialFinancialDocument(documents:FinancialDocument[],resource='billing'):string|null {
 return documents.find(document=>document.payment?.status==='pending_verification')?.id??documents.find(document=>document.kind===(resource==='receipts'?'receipt':'invoice'))?.id??documents[0]?.id??null;
}
export function FinancialDocumentList({documents,selected,onSelect,disabled,locale,canReview=false,onReview}:{documents:FinancialDocument[];selected:string|null;onSelect:(id:string|null)=>void;disabled:boolean;locale:'th'|'en';canReview?:boolean;onReview?:(paymentId:string,action:'approved'|'rejected')=>void}) {
 const th=locale==='th';
 const label=(document:FinancialDocument)=>document.kind==='invoice'?(th?'ใบเรียกเก็บเงิน':'Billing statement'):document.kind==='receipt'?(th?'ใบเสร็จรับเงิน':'Receipt'):(th?'หลักฐานการโอน':'Transfer evidence');
 const statuses:Record<string,string>={pending_verification:th?'รอตรวจสอบ':'Pending review',paid:th?'อนุมัติแล้ว':'Approved',rejected:th?'ปฏิเสธแล้ว':'Rejected'};
 return <section className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-6" aria-label={th?'เอกสารและหลักฐาน':'Documents and evidence'}>
 <header className="flex items-center justify-between"><h2 className="font-semibold">{th?'เอกสารและหลักฐาน':'Documents and evidence'}</h2><span className="text-sm text-muted-foreground">{documents.length} {th?'รายการ':'items'}</span></header>
 <ul className="space-y-2">{documents.map((document,index)=>{
  const payment=document.payment,expanded=selected===document.id,previewId='financial-document-'+(payment?index:document.id);
  const renderItem=({download,preview}:{download:ReactNode;preview:ReactNode})=><li key={document.id} className={`min-w-0 rounded-lg border ${expanded?'border-primary':' '}`}>
   <div className={`flex flex-wrap items-center gap-2 p-3 ${expanded?'bg-primary/5':''}`}>
    <button type="button" disabled={disabled} aria-expanded={expanded} aria-controls={previewId} onClick={()=>onSelect(expanded?null:document.id)} className="flex min-h-10 min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-60">
     {payment?<ImageIcon className="size-5 shrink-0 text-muted-foreground"/>:<FileText className="size-5 shrink-0 text-muted-foreground"/>}<span className="min-w-0"><span className="block break-words text-sm font-medium">{label(document)}{payment?` ${documents.slice(0,index+1).filter(item=>item.kind==='payment').length}`:''}{document.number?` · ${document.number}`:''}</span>{payment&&<span className="mt-1 block text-xs text-muted-foreground">{statuses[payment.status]??(th?'ไม่ทราบสถานะ':'Unknown status')}{payment.submittedAt?' · '+formatAppDateTime(payment.submittedAt,locale):''}</span>}</span>
    </button>
    <div className="ml-auto flex flex-wrap items-center gap-2">
     {payment?.status==='pending_verification'&&canReview&&onReview&&<><Button size="sm" disabled={disabled} onClick={()=>onReview(payment.id,'approved')}>{th?'อนุมัติ':'Approve'}</Button><Button size="sm" variant="destructive" disabled={disabled} onClick={()=>onReview(payment.id,'rejected')}>{th?'ปฏิเสธ':'Reject'}</Button></>}
     {download}<Button size="icon" variant="ghost" disabled={disabled} aria-label={`${expanded?(th?'ย่อ':'Collapse'):(th?'ขยาย':'Expand')} ${label(document)}`} aria-expanded={expanded} aria-controls={previewId} onClick={()=>onSelect(expanded?null:document.id)}><ChevronDown className={`size-4 transition-transform ${expanded?'rotate-180':''}`}/></Button>
    </div>
   </div>
   {expanded&&<div id={previewId} className="min-w-0 space-y-3 border-t p-3">{preview}</div>}
  </li>;
  if(document.source)return <InlineOriginalDocument key={document.id} source={document.source}>{renderItem}</InlineOriginalDocument>;
  const url=payment?.slipUrl;
  return renderItem({
    download:url?<Button asChild variant="outline" size="sm"><a href={url} download onClick={event=>event.stopPropagation()}>{th?'ดาวน์โหลด':'Download'}</a></Button>:null,
    preview:<div className="space-y-4">
      {url ? (/^data:application\/pdf/i.test(url) || /\.pdf($|\?)/i.test(url) ? <InlinePdfCanvas locale={locale} title={th ? 'หลักฐานการโอน PDF' : 'Transfer evidence PDF'} url={url} /> : <div className="flex justify-center rounded-lg border bg-muted/20 p-2"><img src={url} alt={th ? 'หลักฐานการโอนที่เลือก' : 'Selected transfer evidence'} className="max-h-[65vh] w-auto max-w-full rounded-md object-contain" /></div>) : <p className="text-sm text-muted-foreground">{th ? 'ไม่มีไฟล์หลักฐานสำหรับรายการนี้' : 'No evidence file is available for this transfer.'}</p>}
      {payment&&(
        <div className="rounded-xl border border-border/80 bg-card p-4 space-y-3 text-sm shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">{th?'ข้อมูลการชำระเงิน':'Payment Details'}</span>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                payment.status === 'paid' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' :
                payment.status === 'rejected' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800' :
                'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
              }`}>
                {statuses[payment.status]??(th?'ไม่ทราบสถานะ':'Unknown status')}
              </span>
            </div>
            {(payment.amount || payment.verifiedAmount) && (
              <span className="font-bold text-foreground text-base">
                ฿{Number(payment.verifiedAmount || payment.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {(payment.verifiedTransferAt || (payment as any).paidAt || payment.submittedAt) && (
              <div>
                <span className="text-muted-foreground">{th?'วันเวลาที่ชำระ/ส่งข้อมูล:':'Transfer/Submitted date:'}</span>
                <p className="font-medium text-foreground mt-0.5">
                  {formatAppDateTime(payment.verifiedTransferAt || (payment as any).paidAt || payment.submittedAt, locale)}
                </p>
              </div>
            )}
            {(payment as any).paymentMethod && (
              <div>
                <span className="text-muted-foreground">{th?'ช่องทางการชำระ:':'Payment method:'}</span>
                <p className="font-medium text-foreground mt-0.5">
                  {(payment as any).paymentMethod === 'promptpay' ? (th ? 'พร้อมเพย์' : 'PromptPay') : (th ? 'โอนเงินผ่านธนาคาร' : 'Bank Transfer')}
                </p>
              </div>
            )}
          </div>
          {payment.note && (
            <div className="text-xs pt-2.5 border-t border-border/60">
              <span className="text-muted-foreground">{th?'หมายเหตุ:':'Note:'}</span>
              <p className="font-medium text-foreground mt-0.5 whitespace-pre-wrap">{payment.note}</p>
            </div>
          )}
          {payment.rejectionReason && (
            <div className="text-xs pt-2.5 border-t border-destructive/20 text-destructive">
              <span className="font-semibold">{th?'เหตุผลการปฏิเสธ:':'Rejection reason:'}</span>
              <p className="mt-0.5">{payment.rejectionReason}</p>
            </div>
          )}
        </div>
      )}
    </div>
  });
 })}</ul>
 {!selected&&<p className="py-6 text-center text-sm text-muted-foreground">{th?'เลือกเอกสารเพื่อดูตัวอย่าง':'Select a document to preview'}</p>}
 </section>;
}
