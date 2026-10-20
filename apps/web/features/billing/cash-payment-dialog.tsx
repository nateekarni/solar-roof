"use client";
import * as React from 'react';
import type {CashPaymentResult,CashPaymentSubmission} from '@solar/api-contracts';
import {Banknote,BellRing,CheckCircle2,FileText,Loader2} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '../../components/ui/dialog';
import {Button} from '../../components/ui/button';
import {DatePicker} from '../../components/ui/date-picker';
import {Input} from '../../components/ui/input';
import {Label} from '../../components/ui/label';
import {apiClient} from '../../lib/api-client';
import {useLocale} from '../../providers/locale-provider';
import {bangkokTransferWallTime,transferAmount} from './payment-input';

export interface CashPaymentDraft {amount:string;receivedAt:string;note:string;}
type CashCycle={id:string;outstandingAmount:string;invoiceNumber?:string|null;customerName?:string|null;};

function minor(value:string):bigint {const normalized=transferAmount(value);const [whole,fraction]=normalized.split('.');return BigInt(whole!)*100n+BigInt(fraction!);}
function validCalendarDate(value:string):boolean {if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const [year,month,day]=value.split('-').map(Number),date=new Date(Date.UTC(year!,month!-1,day!));return date.getUTCFullYear()===year&&date.getUTCMonth()===month!-1&&date.getUTCDate()===day;}
export function createCashPaymentDraft(outstanding:string,today=bangkokTransferWallTime().slice(0,10)):CashPaymentDraft {return {amount:transferAmount(outstanding),receivedAt:today,note:''};}
function createSafeCashPaymentDraft(outstanding:string|undefined,today:string):CashPaymentDraft {try{return createCashPaymentDraft(outstanding??'',today);}catch{return {amount:'',receivedAt:today,note:''};}}
export function cashPaymentPayload(draft:CashPaymentDraft,outstanding:string,today=bangkokTransferWallTime().slice(0,10)):CashPaymentSubmission {
 const amount=transferAmount(draft.amount.trim());
 if(minor(amount)>minor(outstanding))throw new Error('Cash amount cannot exceed the outstanding balance');
 if(!validCalendarDate(draft.receivedAt))throw new Error('Received date must be a valid calendar date');
 if(draft.receivedAt>today)throw new Error('Received date cannot be in the future');
 return {amount,receivedAt:draft.receivedAt,...(draft.note.trim()?{note:draft.note.trim()}:{})};
}

export function CashPaymentConfirmation({locale,amount,result,onClose}:{locale:'th'|'en';amount:string;result:CashPaymentResult;onClose:()=>void}){
 const text=(th:string,en:string)=>locale==='th'?th:en;
 return <div className="space-y-5" role="status" aria-live="polite">
  <div className="space-y-2 text-center"><CheckCircle2 className="mx-auto size-12 text-emerald-500"/><h3 className="font-semibold">{text('บันทึกรับเงินสดแล้ว','Cash payment recorded')}</h3></div>
  <dl className="grid gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-2">
   <div><dt className="text-sm text-muted-foreground">{text('จำนวนเงินที่รับ','Amount received')}</dt><dd className="font-semibold tabular-nums">{amount}</dd></div>
   <div><dt className="text-sm text-muted-foreground">{text('ยอดคงเหลือ','Outstanding')}</dt><dd className="font-semibold tabular-nums">{result.outstandingAmount}</dd></div>
   <div className="sm:col-span-2"><dt className="text-sm text-muted-foreground">{text('เลขที่ใบเสร็จ','Receipt')}</dt><dd className="font-semibold">{result.receipt.documentNumber}</dd></div>
  </dl>
  <p className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm"><BellRing className="mt-0.5 size-4 shrink-0 text-primary"/><span>{text('ระบบจัดคิวแจ้งเตือนลูกค้าแล้ว','The customer notification has been queued.')}</span></p>
  <div className="flex flex-wrap justify-end gap-3">
   <Button type="button" variant="outline" onClick={onClose}>{text('ปิด','Close')}</Button>
   <Button asChild><a href={`/records/receipts/${encodeURIComponent(result.receipt.id)}`}><FileText/>{text('ดูใบเสร็จ','Preview receipt')}</a></Button>
  </div>
 </div>;
}

export function CashPaymentDialog({open,onOpenChange,billingCycle,onSuccess,inline=false}:{open:boolean;onOpenChange:(open:boolean)=>void;billingCycle:CashCycle|null;onSuccess?:()=>void;inline?:boolean}){
 const locale=useLocale(),text=(th:string,en:string)=>locale==='th'?th:en;
 const today=React.useMemo(()=>bangkokTransferWallTime().slice(0,10),[]);
 const [draft,setDraft]=React.useState<CashPaymentDraft>(()=>createSafeCashPaymentDraft(billingCycle?.outstandingAmount,today));
 const [pending,setPending]=React.useState(false),[error,setError]=React.useState<string|null>(null),[result,setResult]=React.useState<CashPaymentResult|null>(null);
 const identity=React.useRef<{fingerprint:string;key:string}|null>(null);
 React.useEffect(()=>{if(open&&billingCycle){setDraft(createSafeCashPaymentDraft(billingCycle.outstandingAmount,today));setError(null);setResult(null);identity.current=null;}},[open,billingCycle?.id,billingCycle?.outstandingAmount,today]);
 const update=(patch:Partial<CashPaymentDraft>)=>{setDraft(previous=>({...previous,...patch}));setError(null);};
 const submit=async(event:React.FormEvent)=>{event.preventDefault();if(!billingCycle||pending)return;let body:CashPaymentSubmission;try{body=cashPaymentPayload(draft,billingCycle.outstandingAmount,today);}catch(reason){setError((reason as Error).message);return;}
  const fingerprint=JSON.stringify(body);if(identity.current?.fingerprint!==fingerprint)identity.current={fingerprint,key:crypto.randomUUID()};
  setPending(true);setError(null);
  try{const value=await apiClient.post<CashPaymentResult>(`/v1/billing-cycles/${encodeURIComponent(billingCycle.id)}/cash-payment`,body,{headers:{'Idempotency-Key':identity.current.key}});setResult(value);identity.current=null;onSuccess?.();}
  catch(reason){const status=(reason as {status?:number}).status;setError(status===409?text('ยอดคงเหลือหรือสถานะรายการเปลี่ยนแล้ว กรุณาตรวจสอบข้อมูลล่าสุด','The outstanding balance or record status changed. Review the latest details.'):text('บันทึกรับเงินสดไม่สำเร็จ ข้อมูลที่กรอกยังคงอยู่','Unable to record cash payment. Your entered details are preserved.'));if(status===409)onSuccess?.();}
  finally{setPending(false);}
 };
 const content=<>
  <DialogHeader><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-primary/15 text-primary"><Banknote className="size-5"/></span><div><DialogTitle>{text('รับชำระเงินสด','Record cash payment')}</DialogTitle><DialogDescription>{billingCycle?.invoiceNumber??'—'}{billingCycle?.customerName?` · ${billingCycle.customerName}`:''}</DialogDescription></div></div></DialogHeader>
  {result?<CashPaymentConfirmation locale={locale} amount={transferAmount(draft.amount)} result={result} onClose={()=>onOpenChange(false)}/>:
  <form onSubmit={submit} className="space-y-4">
   <div className="space-y-1.5"><Label htmlFor="cash-amount">{text('จำนวนเงินที่รับ','Amount received')}</Label><Input id="cash-amount" inputMode="decimal" value={draft.amount} onChange={event=>update({amount:event.target.value})}/><p className="text-xs text-muted-foreground">{text('ยอดคงเหลือ','Outstanding')} {billingCycle?.outstandingAmount??'—'}</p></div>
   <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="cash-received-at">{text('วันที่รับเงิน','Received date')}</Label><DatePicker id="cash-received-at" value={draft.receivedAt} max={today} onChange={receivedAt=>update({receivedAt})}/></div><div className="space-y-1.5"><Label htmlFor="cash-note">{text('หมายเหตุ','Note')}</Label><Input id="cash-note" value={draft.note} onChange={event=>update({note:event.target.value})}/></div></div>
   {error&&<p role="alert" className="rounded-xl border border-destructive p-3 text-sm text-destructive">{error}</p>}
   <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={()=>onOpenChange(false)}>{text('ยกเลิก','Cancel')}</Button><Button type="submit" disabled={pending}>{pending&&<Loader2 className="size-4 animate-spin"/>}{text('บันทึกรับเงินสด','Record cash payment')}</Button></DialogFooter>
  </form>}
 </>;
 if(inline)return <Dialog open><section className="w-full max-w-xl space-y-5 rounded-2xl p-5">{content}</section></Dialog>;
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92dvh] overflow-y-auto rounded-2xl sm:max-w-xl">{content}</DialogContent></Dialog>;
}
