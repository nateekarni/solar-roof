"use client";
import {PaymentRejectionDialog} from './payment-rejection-dialog';
import * as React from 'react';
import {FormErrorSummary} from '../../components/feedback/form-feedback';
import {focusErrorElement} from '../../lib/form-feedback';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '../../components/ui/dialog';
import {Button} from '../../components/ui/button';
import {useLocale} from '../../providers/locale-provider';
import {apiClient} from '../../lib/api-client';
import {formatAppDateTime} from '../../lib/date-format';

import {billingDetailRequest} from './billing-detail-request';
import {PaymentHistory,type TransferHistoryRow} from './payment-history';
import {formatTransferAmount} from './payment-input';
import {reviewBalance} from './payment-review-summary';
interface Props {initialRejectOpen?:boolean;selectedPaymentId?:string;formOnly?:boolean;onBusyChange?:(busy:boolean)=>void;canReview?:boolean;inline?:boolean;open:boolean;onOpenChange:(value:boolean)=>void;billingCycle:{id:string;period?:string;customerName?:string;siteName?:string;amount?:number|string;[key:string]:unknown}|null;onSuccess?:()=>void;}
interface Detail {payments?:TransferHistoryRow[];amount?:string|number;invoiceId?:string;invoiceNumber?:string;customerName?:string;siteName?:string;}
export function PaymentVerificationDialog({open,onOpenChange,billingCycle,onSuccess,inline=false,canReview=true,selectedPaymentId,formOnly=false,onBusyChange,initialRejectOpen=false}:Props){
 const locale=useLocale();const t=(th:string,en:string)=>locale==='th'?th:en;
 const [transfers,setTransfers]=React.useState<TransferHistoryRow[]>([]),[detail,setDetail]=React.useState<Detail|null>(null),[loading,setLoading]=React.useState(false),[reload,setReload]=React.useState(0),[success,setSuccess]=React.useState('');
 const [errorField,setErrorField]=React.useState('');
 const [rejectOpen,setRejectOpen]=React.useState(initialRejectOpen),[confirmOpen,setConfirmOpen]=React.useState(false);
 const reviewRef=React.useRef<HTMLDivElement>(null);
 const [selected,setSelected]=React.useState(''),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
 React.useEffect(()=>{let active=true;setTransfers([]);setDetail(null);setSelected('');setError('');setConfirmOpen(false);if(!open||!billingCycle?.id){setLoading(false);return;}setLoading(true);
 void billingDetailRequest<Detail>(billingCycle.id,path=>apiClient.get(path)).then(row=>{if(!active)return;setDetail(row);setTransfers(row.payments??[]);setSelected(selectedPaymentId??row.payments?.find(p=>p.status==='pending_verification')?.id??'');setLoading(false);}).catch(()=>{if(active){setError(t('โหลดรายการไม่สำเร็จ กรุณาลองอีกครั้ง','Unable to load transfers. Please retry.'));setLoading(false);}});return()=>{active=false;};},[open,billingCycle?.id,reload,locale,selectedPaymentId]);
 const payment=transfers.find(p=>p.id===selected);
 const reviewable=payment?.status==='pending_verification';
 React.useEffect(()=>{onBusyChange?.(busy);return()=>onBusyChange?.(false);},[busy,onBusyChange]);
 React.useEffect(()=>{setError('');setErrorField('');},[selected]);
 let balance:{approved:string;remaining:string}|null=null;try{if(detail?.amount!==undefined)balance=reviewBalance(detail.amount,transfers);}catch{}
 async function decide(status:'approved'|'rejected',rejectionReason=''){
  if(!billingCycle||!payment||!reviewable||busy||!canReview)return;setError('');setErrorField('');
  const invalid=(id:string,message:string)=>{setErrorField(id);setError(message);const input=reviewRef.current?.querySelector<HTMLElement>('#'+id);if(input)focusErrorElement(input);};
  if(status==='rejected'&&!rejectionReason.trim()){invalid('rejection-reason',t('กรุณาระบุเหตุผลเพื่อให้ผู้ส่งแก้ไขหลักฐานได้','Enter a rejection reason so the sender can correct the evidence.'));return;}
  setBusy(true);try{await apiClient.patch('/v1/billing-cycles/'+billingCycle.id+'/verify-payment',{status,paymentId:selected,rejectionReason:rejectionReason.trim()||undefined});setSuccess(status==='approved'?t('อนุมัติรายการโอนแล้ว','Transfer approved.'):t('ปฏิเสธรายการโอนแล้ว','Transfer rejected.'));onSuccess?.();if(inline)setReload(n=>n+1);else onOpenChange(false);setRejectOpen(false);setConfirmOpen(false);return true;}catch{setError(t('บันทึกผลตรวจสอบไม่สำเร็จ ข้อมูลที่กรอกยังอยู่ กรุณาตรวจสอบแล้วลองอีกครั้ง','Could not save the review. Your entries are retained; check them and try again.'));}finally{setBusy(false);}
 }
 const heading=t('ยืนยันอนุมัติหลักฐานการโอนเงิน','Confirm transfer approval');
 const description=t('คุณต้องการยืนยันอนุมัติหลักฐานการโอนเงินรายการนี้และออกใบเสร็จรับเงินใช่หรือไม่?','Are you sure you want to approve this transfer evidence and issue the receipt?');
 const rejection=<PaymentRejectionDialog key={selected} locale={locale} open={rejectOpen} onOpenChange={(value)=>{setRejectOpen(value);if(!value&&formOnly&&initialRejectOpen)onOpenChange(false);}} busy={busy} onConfirm={value=>decide('rejected',value)}/>;
 if(!inline){
  if(initialRejectOpen)return rejection;
  return <Dialog open={open} onOpenChange={(value:boolean)=>!busy&&onOpenChange(value)}><DialogContent className="sm:max-w-md">{rejection}<DialogHeader><DialogTitle>{heading}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{error&&<div className="text-destructive"><FormErrorSummary>{error}</FormErrorSummary></div>}<div className="flex justify-end gap-2 pt-2"><Button variant="outline" disabled={busy} onClick={()=>onOpenChange(false)}>{t('ยกเลิก','Cancel')}</Button><Button disabled={busy||loading||!payment||!reviewable||!canReview} onClick={()=>void decide('approved')}>{busy?t('กำลังบันทึก…','Saving…'):t('ยืนยันอนุมัติ','Confirm approval')}</Button></div></DialogContent></Dialog>;
 }
 const confirmation=<Dialog open={confirmOpen} onOpenChange={value=>!busy&&setConfirmOpen(value)}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{t('ยืนยันอนุมัติหลักฐานการโอนเงิน','Confirm transfer approval')}</DialogTitle><DialogDescription>{t('คุณต้องการยืนยันอนุมัติหลักฐานการโอนเงินรายการนี้และออกใบเสร็จรับเงินใช่หรือไม่?','Are you sure you want to approve this transfer evidence and issue the receipt?')}</DialogDescription></DialogHeader><div className="flex justify-end gap-2 pt-2"><Button variant="outline" disabled={busy} onClick={()=>setConfirmOpen(false)}>{t('ยกเลิก','Cancel')}</Button><Button disabled={busy} onClick={()=>void decide('approved')}>{busy?t('กำลังบันทึก…','Saving…'):t('ยืนยันอนุมัติ','Confirm approval')}</Button></div></DialogContent></Dialog>;
 const content=<div ref={reviewRef} className="space-y-4">{rejection}{confirmation}{success&&<p role="status" className="rounded-lg border p-3 text-sm">{success}</p>}

 {!formOnly&&<p>{detail?.customerName??billingCycle?.customerName} · {detail?.siteName??billingCycle?.siteName}</p>}
 {loading?<p role="status">{t('กำลังโหลดใบวางบิลและหลักฐาน…','Loading billing statement and evidence…')}</p>:<>{!formOnly&&<div className="grid grid-cols-3 gap-3 rounded-xl bg-muted p-4 text-sm"><p>{t('ยอดใบวางบิล','Bill amount')}<strong className="block">฿{formatTransferAmount(String(detail?.amount??billingCycle?.amount??'0'))}</strong></p><p>{t('ยอดอนุมัติแล้ว','Approved amount')}<strong className="block">฿{balance?formatTransferAmount(balance.approved):'—'}</strong></p><p>{t('ยอดคงเหลือ','Outstanding amount')}<strong className="block">฿{balance?formatTransferAmount(balance.remaining):'—'}</strong></p></div>}
 <div className={formOnly?'space-y-4':'grid grid-cols-1 md:grid-cols-2 gap-6'}>{!formOnly&&<div className="space-y-3">
 {payment?.slipUrl?(payment.slipUrl.startsWith('data:application/pdf')||/\.pdf($|\?)/i.test(payment.slipUrl)?<iframe title={t('หลักฐานการโอน PDF','Transfer evidence PDF')} src={payment.slipUrl} className="w-full h-[500px]"/>:<a href={payment.slipUrl} target="_blank" rel="noreferrer"><img src={payment.slipUrl} alt={t('หลักฐานโอน คลิกเพื่อซูม','Transfer evidence; click to zoom')} className="w-full object-contain"/></a>):<p>{t('ไม่มีไฟล์หลักฐาน','Evidence unavailable')}</p>}{payment&&<><p>{payment.note}</p><p className="text-sm text-muted-foreground">{t('ผู้ส่ง','Submitted by')}: {payment.submittedByName||t('ไม่ระบุชื่อ','Name unavailable')} · {payment.submittedAt?formatAppDateTime(payment.submittedAt,locale):'—'}</p></>}</div>}<div className="space-y-3"><div className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">{t('ใบวางบิล','Bill')}</p><p className="font-semibold">{detail?.invoiceNumber??billingCycle?.id}</p><p className="mt-3 text-sm text-muted-foreground">{t('ยอดคงเหลือเต็มจำนวน','Full outstanding amount')}</p><p className="text-lg font-bold">฿{formatTransferAmount(balance?.remaining??String(detail?.amount??billingCycle?.amount??'0'))}</p></div><div className="flex gap-2"><Button disabled={busy||!payment||!reviewable||!canReview} onClick={()=>setConfirmOpen(true)}>{t('ตรวจสอบและยืนยัน','Review and confirm')}</Button><Button variant="destructive" disabled={busy||!payment||!reviewable||!canReview} onClick={()=>setRejectOpen(true)}>{t('ปฏิเสธรายการนี้','Reject this transfer')}</Button></div>{(!payment||!reviewable)&&<p className="text-sm text-muted-foreground">{t('ไม่มีรายการรอตรวจสอบ','No pending transfers')}</p>}{!inline&&<PaymentHistory payments={transfers} locale={locale}/>}</div></div></>}{error&&<div className="text-destructive">{errorField?<p id="review-field-error">{error}</p>:<FormErrorSummary>{error}</FormErrorSummary>}{!loading&&!detail&&<Button variant="outline" onClick={()=>setReload(n=>n+1)}>{t('ลองโหลดอีกครั้ง','Retry loading')}</Button>}</div>}</div>;
 return inline?<section aria-label={heading} className="space-y-4 rounded-xl border bg-card p-4 sm:p-6"><header><h2 className="text-lg font-semibold">{heading}</h2><p className="text-sm text-muted-foreground">{description}</p></header>{content}</section>:<Dialog open={open} onOpenChange={(value:boolean)=>!busy&&onOpenChange(value)}><DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-y-auto"><DialogHeader><DialogTitle>{heading}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{content}</DialogContent></Dialog>;
}
