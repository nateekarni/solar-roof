'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useLocale} from '../../providers/locale-provider';
import {useFinancialCapabilities} from '../../lib/financial-capabilities';
import {apiClient} from '../../lib/api-client';
import {Button} from '../../components/ui/button';
import {renderRecordValue} from '../shared/record-value';
import {renderReceiptStatusBadge,renderBillingStatusBadge} from '../../lib/status-badge';
import {getOperationActions} from '../shared/operation-actions';
import {billingDetailRequest} from './billing-detail-request';
import {billingRecordTransfers} from './billing-record-panel';
import {BillingRecordActions} from './billing-record-actions';

import {PaymentVerificationDialog} from './payment-verification-dialog';
import {reviewBalance} from './payment-review-summary';
import {formatTransferAmount} from './payment-input';
import {FinancialDocumentList,financialDocuments,initialFinancialDocument} from './financial-document-list';

export function FinancialRecordDetails({resource,row}:{resource:string;row:Record<string,unknown>}) {
 const locale=useLocale(),th=locale==='th',router=useRouter(),capabilities=useFinancialCapabilities();
 const [related,setRelated]=useState<Record<string,unknown>|null>(null),[loadError,setLoadError]=useState(false),[retry,setRetry]=useState(0),[busy,setBusy]=useState(false);
 const [selection,setSelection]=useState<string|null|undefined>(undefined);
 useEffect(()=>{
  if(resource!=='receipts'||typeof row.billingCycleId!=='string')return;
  let active=true;setLoadError(false);
  void billingDetailRequest<Record<string,unknown>>(row.billingCycleId,path=>apiClient.get(path)).then(value=>{if(active)setRelated(value);}).catch(()=>{if(active)setLoadError(true);});
  return()=>{active=false;};
 },[resource,row,retry]);
 const billing=resource==='billing'?row:related;
 const documents=financialDocuments(resource,row,billing);
 const selected=selection===undefined?initialFinancialDocument(documents,resource):selection;
 const [review,setReview]=useState<{paymentId:string;action:'approved'|'rejected'}|null>(null);
 const payments=billingRecordTransfers(billing?.payments);
 const billingId=typeof billing?.id==='string'?billing.id:'';
 const canReview=!!billingId&&getOperationActions('billing',{...billing,id:billingId},capabilities).some(action=>action.id==='verify'&&action.enabled);
 let balance:ReturnType<typeof reviewBalance>|null=null;
 try{if(billing?.amount!==undefined)balance=reviewBalance(String(billing.amount),payments);}catch{}
 const money=(value:unknown)=>value===null||value===undefined?'—':'฿'+formatTransferAmount(String(value));
 const totals=[{label:th?'ยอดเรียกเก็บ':'Billed',value:billing?.amount??row.totalAmount??row.amount},{label:th?'ชำระแล้ว':'Paid',value:balance?.approved},{label:th?'คงเหลือ':'Outstanding',value:balance?.remaining}];
 const calculations=[['consumedKwh',th?'พลังงาน (kWh)':'Energy (kWh)'],['rate',th?'อัตรา (บาท/kWh)':'Rate (THB/kWh)'],['openingEnergy',th?'ค่ามิเตอร์เริ่มต้น':'Opening reading'],['closingEnergy',th?'ค่ามิเตอร์สิ้นสุด':'Closing reading'],['quality',th?'คุณภาพข้อมูล':'Data quality']];
 const fieldValue=(key:string)=>billing?.[key]??row[key];
 return <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)] lg:gap-6 lg:grid-rows-[auto_1fr]">
  <section aria-label={th?'สรุปใบเรียกเก็บเงิน':'Billing summary'} className="min-w-0 space-y-5 rounded-xl border bg-card p-4 sm:p-6 lg:col-start-2 lg:row-start-1">
   <header className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{resource==='receipts'?(th?'ข้อมูลใบเสร็จรับเงิน':'Receipt details'):(th?'ข้อมูลใบเรียกเก็บเงิน':'Billing details')}</h2>{resource==='receipts'?renderReceiptStatusBadge(String(row.status??''),locale):renderBillingStatusBadge(row,locale)}</header>
   <dl className="space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="shrink-0 text-muted-foreground">{th?'ลูกค้า':'Customer'}</dt><dd className="text-right font-medium">{String(row.customerName??billing?.customerName??'—')}</dd></div><div className="flex justify-between gap-4"><dt className="shrink-0 text-muted-foreground">{th?'เลขเอกสาร':'Document number'}</dt><dd className="break-all text-right font-medium">{String(row.documentNumber??row.receiptNumber??row.invoiceNumber??'—')}</dd></div></dl>
   <div className="grid grid-cols-3 gap-3 rounded-lg bg-muted/50 p-3">{totals.map(total=><div key={total.label} className="min-w-0"><p className="text-xs text-muted-foreground">{total.label}</p><p className="mt-1 break-words text-base font-semibold tabular-nums">{money(total.value)}</p></div>)}</div>
   {calculations.some(([key])=>fieldValue(key!)!==null&&fieldValue(key!)!==undefined)&&<section className="border-t pt-3"><h3 className="text-sm font-medium">{th?'รายละเอียดการใช้ไฟ':'Electricity usage details'}</h3><dl className="mt-3 space-y-3 text-sm">{calculations.filter(([key])=>fieldValue(key!)!==null&&fieldValue(key!)!==undefined).map(([key,label])=><div key={key} className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="text-right tabular-nums">{key==='quality'?renderRecordValue(fieldValue(key),key,locale):new Intl.NumberFormat(th?'th-TH':'en-US',{maximumFractionDigits:4}).format(Number(fieldValue(key!)))}</dd></div>)}</dl></section>}
   {billing&&<BillingRecordActions row={billing} showReview={false}/>}
   {loadError&&<div role="alert" className="space-y-2 text-sm"><p>{th?'โหลดข้อมูลการชำระเงินไม่สำเร็จ':'Unable to load payment details.'}</p><Button variant="outline" onClick={()=>setRetry(value=>value+1)}>{th?'ลองอีกครั้ง':'Retry'}</Button></div>}
   {resource==='receipts'&&!related&&!loadError&&row.billingCycleId?<p role="status" className="text-sm text-muted-foreground">{th?'กำลังโหลดข้อมูลการชำระเงิน…':'Loading payment details…'}</p>:null}
   {resource==='receipts'&&row.billingCycleId?<Link className="block text-sm text-primary underline" href={`/records/billing/${encodeURIComponent(String(row.billingCycleId))}`}>{th?'เปิดใบเรียกเก็บเงินที่เกี่ยวข้อง':'Open related billing statement'}</Link>:null}
  </section>
  <div className="min-w-0 lg:col-start-1 lg:row-start-1 lg:row-span-2"><FinancialDocumentList documents={documents} selected={selected} onSelect={setSelection} disabled={busy} locale={locale} canReview={canReview} onReview={(paymentId,action)=>setReview({paymentId,action})}/></div>
  {review&&canReview&&billingId&&<PaymentVerificationDialog key={review.paymentId+review.action} formOnly open selectedPaymentId={review.paymentId} initialRejectOpen={review.action==='rejected'} onBusyChange={setBusy} canReview={canReview} onOpenChange={open=>{if(!open)setReview(null);}} billingCycle={{...billing,id:billingId}} onSuccess={()=>{setSelection('payment:'+review.paymentId);setReview(null);router.refresh();setRetry(value=>value+1);}}/>}
 </div>;
}
