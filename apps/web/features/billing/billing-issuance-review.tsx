'use client';
import {Button} from '../../components/ui/button';
import {formatAppDate} from '../../lib/date-format';

export interface IssuanceApprover {displayName:string;position?:string|null|undefined;hasSignature?:boolean|undefined}
export interface IssuanceBill {period?:unknown;customerName?:unknown;siteName?:unknown;amount?:unknown;tax?:unknown;dueDate?:unknown}
const text=(value:unknown)=>typeof value==='string'&&value.trim()?value:'—';
const money=(value:unknown,locale:'th'|'en')=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?new Intl.NumberFormat(locale==='th'?'th-TH':'en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value)):'—';

export function BillingIssuanceBill({bill,locale}:{bill:IssuanceBill;locale:'th'|'en'}){
 const th=locale==='th';
 return <article className="space-y-2 rounded-lg border p-3 text-sm">
  <p className="font-medium">{text(bill.period)} · {text(bill.customerName)} · {text(bill.siteName)}</p>
  <dl className="grid gap-2 sm:grid-cols-3">
   <div><dt className="text-muted-foreground">{th?'ยอดเงินรวม (บาท)':'Total (THB)'}</dt><dd>{money(bill.amount,locale)}</dd></div>
   <div><dt className="text-muted-foreground">{th?'ภาษี (บาท)':'Tax (THB)'}</dt><dd>{money(bill.tax,locale)}</dd></div>
   <div><dt className="text-muted-foreground">{th?'กำหนดชำระ':'Due date'}</dt><dd>{typeof bill.dueDate==='string'&&bill.dueDate?formatAppDate(bill.dueDate,locale):'—'}</dd></div>
  </dl>
 </article>;
}

export function BillingIssuanceApprover({approver,locale}:{approver:IssuanceApprover;locale:'th'|'en'}){
 const th=locale==='th';
 return <div className="space-y-2 rounded-lg bg-muted/30 p-3 text-sm">
  <p>{th?'ผู้อนุมัติ':'Approver'}: {approver.displayName}</p>
  <p>{th?'ตำแหน่งในบริษัท':'Company position'}: {approver.position?.trim()||(th?'ยังไม่ได้กำหนดตำแหน่ง':'Position not assigned')}</p>
  <p>{approver.hasSignature?(th?'มีลายเซ็นส่วนตัว':'Personal signature available'):(th?'ไม่มีลายเซ็นส่วนตัว เอกสารจะแสดงชื่อและตำแหน่งผู้อนุมัติ':'No signature. The document will show the approver’s name and position.')}</p>
  {!approver.position?.trim()&&<p role="alert">{th?'กรุณาตรวจสอบตำแหน่งในบัญชีของฉัน และติดต่อผู้ดูแลเพื่อกำหนดตำแหน่งก่อนอนุมัติ':'Check your company position in My Account and contact an administrator to assign it before approval.'} <a className="underline underline-offset-4" href="/settings/account">{th?'บัญชีของฉัน':'My Account'}</a></p>}
 </div>;
}

export function BillingIssuanceReview({bill,approver,locale,onApprove,busy=false}:{bill:IssuanceBill;approver:IssuanceApprover;locale:'th'|'en';onApprove:()=>void;busy?:boolean}){
 return <div className="space-y-3"><BillingIssuanceBill bill={bill} locale={locale}/><BillingIssuanceApprover approver={approver} locale={locale}/><Button disabled={busy||!approver.position?.trim()} onClick={onApprove}>{busy?(locale==='th'?'กำลังออกเอกสาร…':'Issuing…'):(locale==='th'?'อนุมัติและออกเอกสาร':'Approve and issue')}</Button></div>;
}
