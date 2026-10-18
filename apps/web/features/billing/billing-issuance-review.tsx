'use client';
import * as React from 'react';
import {Eye, EyeOff} from 'lucide-react';
import {Button} from '../../components/ui/button';
import {formatAppDate} from '../../lib/date-format';

export interface IssuanceApprover {displayName:string;position?:string|null|undefined;hasSignature?:boolean|undefined}
export interface IssuanceBill {period?:unknown;customerName?:unknown;siteName?:unknown;siteCode?:unknown;amount?:unknown;tax?:unknown;dueDate?:unknown;rate?:unknown;subtotal?:unknown;consumedKwh?:unknown;replacement?:boolean;recipients?:Array<{name:string;email:string}>}
export function issuanceBillFromRow(row:Record<string,unknown>):IssuanceBill {
 const proposal=row.pendingReplacement&&typeof row.pendingReplacement==='object'?row.pendingReplacement as Record<string,unknown>:undefined;
 return {...row,tax:row.tax??row.simulatedTax,...proposal,replacement:!!proposal||row.replacement===true,recipients:Array.isArray(row.recipients)?row.recipients:[]};
}
const text=(value:unknown)=>typeof value==='string'&&value.trim()?value:'—';
const money=(value:unknown,locale:'th'|'en',digits=2)=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?new Intl.NumberFormat(locale==='th'?'th-TH':'en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(Number(value)):'—';

export function BillingIssuanceBill({bill,locale}:{bill:IssuanceBill;locale:'th'|'en'}){
 const th=locale==='th';
 const siteName = text(bill.siteName);
 const siteCode = typeof bill.siteCode === 'string' && bill.siteCode && bill.siteCode !== '—' ? bill.siteCode : '';
 return (
  <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-xs">
   <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 pb-3">
    <div>
     <div className="text-muted-foreground text-[11px]">
      <span className="font-medium text-foreground">{text(bill.period)}</span> · <span>{text(bill.customerName)}</span>
     </div>
     <div className="flex items-center gap-1.5 font-semibold text-sm text-foreground pt-0.5">
      <span>{siteName}</span>
      {siteCode && !siteName.includes(siteCode) && (
       <span className="text-muted-foreground font-normal text-xs">({siteCode})</span>
      )}
     </div>
    </div>
    <div className="inline-flex items-center px-2.5 py-1 rounded-md bg-muted text-[11px] font-medium text-foreground">
      {th ? 'รอบบิล ' : 'Period '}{text(bill.period)}
    </div>
   </div>

   {bill.replacement && (
    <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-amber-600 dark:text-amber-400 font-medium text-[11px]">
     {th ? 'ฉบับแก้ไขรออนุมัติ ฉบับเดิมยังมีผลจนกว่าจะอนุมัติสำเร็จ' : 'Replacement awaiting approval. The original remains valid until approval succeeds.'}
    </div>
   )}

   <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
    <div className="space-y-0.5">
     <span className="text-muted-foreground block text-[11px]">{th ? 'พลังงาน' : 'Energy'}</span>
     <span className="font-medium text-foreground">
      {bill.consumedKwh ? `${bill.consumedKwh} kWh` : '—'}
     </span>
    </div>
    <div className="space-y-0.5">
     <span className="text-muted-foreground block text-[11px]">{th ? 'อัตราค่าไฟ' : 'Tariff rate'}</span>
     <span className="font-medium text-foreground">
      {bill.rate !== undefined && bill.rate !== null && bill.rate !== '' && Number.isFinite(Number(bill.rate))
        ? `฿${Number(bill.rate).toFixed(4)}/kWh`
        : '—'}
     </span>
    </div>
    <div className="space-y-0.5">
     <span className="text-muted-foreground block text-[11px]">{th ? 'ครบกำหนด' : 'Due date'}</span>
     <span className="font-medium text-foreground">
      {typeof bill.dueDate === 'string' && bill.dueDate ? formatAppDate(bill.dueDate, locale) : '—'}
     </span>
    </div>
    <div className="space-y-0.5">
     <span className="text-muted-foreground block text-[11px]">{th ? 'ยอดเงินรวม' : 'Total'}</span>
     <span className="font-bold text-foreground text-sm">
      ฿{money(bill.amount, locale)}
     </span>
    </div>
   </div>

   <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-border/50 text-[11px]">
    <div>
     <span className="text-muted-foreground block">{th ? 'ยอดก่อนภาษี' : 'Subtotal'}</span>
     <span className="font-medium">฿{money(bill.subtotal, locale)}</span>
    </div>
    <div>
     <span className="text-muted-foreground block">{th ? 'ภาษี' : 'Tax'}</span>
     <span className="font-medium">฿{money(bill.tax, locale)}</span>
    </div>
    {!!bill.recipients?.length && (
     <div className="col-span-2 sm:col-span-1">
      <span className="text-muted-foreground block">{th ? 'ผู้รับเอกสาร' : 'Recipients'}</span>
      <span className="truncate block" title={bill.recipients.map(r => `${r.name} (${r.email})`).join(', ')}>
       {bill.recipients.map(r => r.name).join(', ')}
      </span>
     </div>
    )}
   </div>
  </div>
 );
}

export function BillingIssuanceApprover({approver,locale}:{approver:IssuanceApprover;locale:'th'|'en'}){
 const th=locale==='th';
 return <div className="space-y-1.5 rounded-xl border border-border bg-card p-3.5 text-sm">
  <div className="flex flex-wrap items-center justify-between gap-1">
   <span className="text-muted-foreground">{th?'ผู้อนุมัติ':'Approver'}:</span>
   <span className="font-semibold text-foreground">{approver.displayName}</span>
  </div>
  <div className="flex flex-wrap items-center justify-between gap-1">
   <span className="text-muted-foreground">{th?'ตำแหน่งในบริษัท':'Company position'}:</span>
   <span className="font-medium text-foreground">{approver.position?.trim()||(th?'ยังไม่ได้กำหนดตำแหน่ง':'Position not assigned')}</span>
  </div>
  <div className="pt-1.5 border-t border-border/60 text-xs text-muted-foreground">
   {approver.hasSignature?(th?'✓ มีลายเซ็นส่วนตัวพร้อมประทับบนเอกสาร':'✓ Personal signature ready for statement'):(th?'ไม่มีลายเซ็นส่วนตัว (เอกสารจะแสดงชื่อและตำแหน่งผู้อนุมัติ)':'No signature image. Document will show approver’s name and position.')}
  </div>
  {!approver.position?.trim()&&<p role="alert" className="text-xs text-destructive font-medium pt-1">{th?'กรุณาตรวจสอบตำแหน่งในบัญชีของฉัน และติดต่อผู้ดูแลเพื่อกำหนดตำแหน่งก่อนอนุมัติ':'Check your company position in My Account and contact an administrator to assign it before approval.'} <a className="underline underline-offset-4" href="/settings/account">{th?'บัญชีของฉัน':'My Account'}</a></p>}
 </div>;
}

export function BillingIssuanceReview({bill,approver,locale,onApprove,onCancel,busy=false,disabled=false,password,onPasswordChange,passwordError}:{bill:IssuanceBill;approver:IssuanceApprover;locale:'th'|'en';onApprove:()=>void;onCancel?:()=>void;busy?:boolean;disabled?:boolean;password?:string;onPasswordChange?:(value:string)=>void;passwordError?:string}){
 const th=locale==='th';
 const [showPassword,setShowPassword]=React.useState(false);
 return <div className="space-y-3">
  <BillingIssuanceBill bill={bill} locale={locale}/>
  <BillingIssuanceApprover approver={approver} locale={locale}/>
  <div className="space-y-1.5 pt-1">
   <label htmlFor="issuance-password" className="text-xs font-medium text-foreground block">
    {th?'รหัสผ่านเพื่อยืนยันการลงนามและออกเอกสาร':'Password to confirm signing and issuance'}
   </label>
   <div className="relative">
     <input
      id="issuance-password"
      type={showPassword ? 'text' : 'password'}
      value={password??''}
      onChange={e=>onPasswordChange?.(e.target.value)}
      placeholder={th?'กรอกรหัสผ่านของคุณ':'Enter your password'}
      disabled={busy||disabled}
      className="flex h-9 w-full rounded-md border border-input bg-transparent pl-3 pr-10 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      autoComplete="current-password"
     />
     <Button
       type="button"
       variant="ghost"
       size="icon"
       className="absolute right-0 top-0 size-9 text-muted-foreground hover:text-foreground cursor-pointer"
       onClick={() => setShowPassword(!showPassword)}
       aria-label={showPassword ? (th ? 'ซ่อนรหัสผ่าน' : 'Hide password') : (th ? 'แสดงรหัสผ่าน' : 'Show password')}
     >
       {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
     </Button>
   </div>
   <p className="text-[11px] text-muted-foreground leading-relaxed">
    {th?'การระบุรหัสผ่านถือเป็นการยืนยันความถูกต้องและยินยอมให้นำชื่อ ตำแหน่ง และลายเซ็นไปประทับลงในเอกสารฉบับจริงเพื่อจัดส่งให้ลูกค้า':'Entering your password confirms document accuracy and authorizes affixing your name, position, and signature to the official statement sent to the customer.'}
   </p>
   {passwordError&&<p role="alert" className="text-xs font-medium text-destructive">{passwordError}</p>}
  </div>
  <div className="flex flex-row justify-end gap-2 pt-2">
   {onCancel&&<Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{th?'ยกเลิก':'Cancel'}</Button>}
   <Button disabled={disabled||busy||!approver.position?.trim()||!(password??'').trim()} onClick={onApprove}>
    {busy?(th?'กำลังออกเอกสาร…':'Issuing…'):(th?'อนุมัติเอกสาร':'Approve document')}
   </Button>
  </div>
 </div>;
}
