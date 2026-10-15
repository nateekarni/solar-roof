'use client';
import * as React from 'react';
import type {IssuanceApprovalBatch,IssuanceApprovalResult,IssuancePreviewResponse,OperationRow} from '@solar/api-contracts';
import {Download, FileCheck} from 'lucide-react';
import {Button} from '../../components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '../../components/ui/dialog';
import {apiClient} from '../../lib/api-client';
import {eligibleBillingRows} from './billing-selection';
import {BillingIssuanceApprover,BillingIssuanceBill,BillingIssuanceReview,issuanceBillFromRow,type IssuanceApprover} from './billing-issuance-review';

export function exportSelectedRowsAsCsv(rows: readonly OperationRow[], locale: 'th' | 'en' = 'th') {
  if (!rows || rows.length === 0) return;
  const th = locale === 'th';
  const headers = th
    ? ['รอบบิล', 'ลูกค้า', 'สถานที่', 'พลังงาน (kWh)', 'อัตราค่าไฟ (บาท/kWh)', 'ยอดเงินรวม (บาท)', 'สถานะ']
    : ['Billing Period', 'Customer', 'Site', 'Energy (kWh)', 'Rate (THB/kWh)', 'Total Amount (THB)', 'Status'];

  const escapeCsv = (val: unknown) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const csvRows = rows.map(row => {
    const period = row.period ?? row.billingPeriod ?? '';
    const customer = row.customerName ?? row.customer ?? '';
    const site = row.siteName ?? row.site ?? '';
    const energy = row.consumedKwh ?? row.energy ?? '';
    const rate = row.rate !== undefined && row.rate !== null && typeof row.rate === 'number'
      ? row.rate.toFixed(2)
      : (row.rate ?? '');
    const amount = row.amount !== undefined && row.amount !== null && typeof row.amount === 'number'
      ? row.amount.toFixed(2)
      : (row.amount ?? '');
    const status = row.billingStatusView ?? row.status ?? '';

    return [
      escapeCsv(period),
      escapeCsv(customer),
      escapeCsv(site),
      escapeCsv(energy),
      escapeCsv(rate),
      escapeCsv(amount),
      escapeCsv(status),
    ].join(',');
  });

  const csvContent = '\uFEFF' + [headers.map(escapeCsv).join(','), ...csvRows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const timestamp = new Date().toISOString().slice(0, 10);
  a.download = `billing-selected-${timestamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type ApprovalMode='single'|'bulk';
type ApprovalPost=(path:string,body:unknown)=>Promise<unknown>;

export async function submitBillingApproval(rows:readonly OperationRow[],mode:ApprovalMode,password?:string,post:ApprovalPost=apiClient.post):Promise<IssuanceApprovalResult[]>{
 if(!password||!password.trim())throw new Error('Password required for issuance');
 if(rows.length===0||rows.length>100||eligibleBillingRows(rows).length!==rows.length||(mode==='single'&&rows.length!==1))throw new Error('Select 1 to 100 pending bills');
 if(rows.some(row=>typeof row.reviewToken!=='string'||! /^[0-9a-f]{64}$/.test(row.reviewToken)))throw new Error('Review each bill before approval');
 if(mode==='single')return [await post(`/v1/billing-cycles/${encodeURIComponent(rows[0]!.id)}/approve-issuance`,{reviewToken:rows[0]!.reviewToken,password}) as IssuanceApprovalResult];
 return (await post('/v1/billing-cycles/approve-issuance',{billingCycleIds:[...new Set(rows.map(row=>row.id))],reviewTokens:Object.fromEntries(rows.map(row=>[row.id,row.reviewToken])),password}) as IssuanceApprovalBatch).results;
}

const englishMessages:Record<string,string>={
 'ข้อมูลตรวจอนุมัติเปลี่ยนแล้ว กรุณาเปิดตรวจสอบใหม่ก่อนอนุมัติ':'Review facts changed. Open the review again before approval.',
 'ออกใบวางบิลแล้ว':'Billing statement issued',
 'ออกใบวางบิลแล้วก่อนหน้านี้':'Already issued',
 'ไม่สามารถออกเอกสารได้':'Unable to issue this document',
 'กรุณากำหนดตำแหน่งผู้อนุมัติในหน้าพนักงานและสิทธิ์':'Ask an administrator to assign the approver’s company position in Staff and permissions.',
 'กรุณาเตรียมใบวางบิลให้พร้อมตรวจอนุมัติก่อนออกเอกสาร':'Prepare the billing statement for approval before issuance.',
 'กรุณาคำนวณใบวางบิลใหม่ตามการตั้งค่าปัจจุบันก่อนอนุมัติ':'Recalculate the billing statement with the current settings before approval.',
 'กรุณาให้เจ้าของยืนยันความพร้อมด้านบัญชีก่อนอนุมัติออกเอกสาร':'Ask the owner to confirm accounting readiness before issuance.',
 'กรุณาตรวจสอบการตั้งค่าการออกเอกสารและความพร้อมด้านบัญชี':'Check document issuance settings and accounting readiness.',
};

export function BillingApprovalResults({results,locale}:{results:readonly IssuanceApprovalResult[];locale:'th'|'en'}){
 const th=locale==='th',issued=results.filter(row=>row.status!=='failed').length,failed=results.length-issued;
 return <section aria-label={th?'ผลการอนุมัติออกเอกสาร':'Issuance approval results'} className="space-y-3 rounded-xl border bg-card p-4">
  <div role="status"><h3 className="font-medium">{th?`ออกเอกสารสำเร็จ ${issued} รายการ`:`${issued} ${issued===1?'document':'documents'} issued`}</h3><p>{th?`ยังรออนุมัติ ${failed} รายการ`:`${failed} still awaiting approval`}</p></div>
  <ul className="space-y-3">{results.map((row,index)=><li key={index} className="space-y-1 border-t pt-3 text-sm">
   <p className="font-medium">{row.label.period} · {row.label.customer==='รายการที่ไม่สามารถเข้าถึงได้'&&!th?'Unavailable record':row.label.customer} · {row.label.site}</p>
   <p>{row.status==='failed'?(th?'ยังรออนุมัติ':'Still awaiting approval'):row.status==='already_issued'?(th?'ออกเอกสารแล้วก่อนหน้านี้':'Already issued'):(th?'ออกเอกสารแล้ว':'Issued')}{row.documentNumber?` · ${row.documentNumber}`:''}</p>
   <p>{th?row.message:(englishMessages[row.message]??'Unable to issue this document')}</p>
  </li>)}</ul>
 </section>;
}

export function BillingApprovalConfirmation({rows,approver,locale,busy,onApprove,disabled=false,password,onPasswordChange,passwordError}:{rows:readonly OperationRow[];approver:IssuanceApprover;locale:'th'|'en';busy:boolean;onApprove:()=>void;disabled?:boolean;password?:string;onPasswordChange?:(value:string)=>void;passwordError?:string}){
 const th=locale==='th';
 return <div className="space-y-3">
  <div className="space-y-2">{rows.map(row=><BillingIssuanceBill key={row.id} bill={issuanceBillFromRow(row)} locale={locale}/>)}</div>
  <BillingIssuanceApprover approver={approver} locale={locale}/>
  <div className="space-y-1.5 rounded-lg border p-3 bg-muted/20">
   <label htmlFor="bulk-issuance-password" className="text-sm font-medium">
    {th?'รหัสผ่านเพื่อยืนยันการลงนามและออกเอกสาร':'Password to confirm signing and issuance'}
   </label>
   <input
    id="bulk-issuance-password"
    type="password"
    value={password??''}
    onChange={e=>onPasswordChange?.(e.target.value)}
    placeholder={th?'กรอกรหัสผ่านของคุณ':'Enter your password'}
    disabled={busy||disabled}
    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    autoComplete="current-password"
   />
   <p className="text-xs text-muted-foreground">
    {th?'การระบุรหัสผ่านถือเป็นการยืนยันความถูกต้องและยินยอมให้นำชื่อ ตำแหน่ง และลายเซ็นไปประทับลงในเอกสารฉบับจริงเพื่อจัดส่งให้ลูกค้า':'Entering your password confirms document accuracy and authorizes affixing your name, position, and signature to the official statement sent to the customer.'}
   </p>
   {passwordError&&<p role="alert" className="text-sm font-medium text-destructive">{passwordError}</p>}
  </div>
  <Button disabled={disabled||busy||!approver.position?.trim()||rows.length===0||rows.length>100||!(password??'').trim()} onClick={onApprove}>
   {busy?(th?'กำลังออกเอกสาร…':'Issuing…'):(th?'อนุมัติและออกเอกสาร':'Approve and issue')}
  </Button>
 </div>;
}

export function BillingBulkApproval({rows,approver,locale,canApprove,onCompleted,mode='bulk',open:controlledOpen,onOpenChange,onClearSelection}:{rows:readonly OperationRow[];approver:IssuanceApprover;locale:'th'|'en';canApprove:boolean;onCompleted:()=>void;mode?:ApprovalMode;open?:boolean;onOpenChange?:(open:boolean)=>void;onClearSelection?:()=>void}){
 const th=locale==='th';
 const [localOpen,setLocalOpen]=React.useState(false),[busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
 const [password,setPassword]=React.useState(''),[passwordError,setPasswordError]=React.useState('');
 const [results,setResults]=React.useState<IssuanceApprovalResult[]>([]);
 const [previews,setPreviews]=React.useState<IssuancePreviewResponse[]>([]),[previewLoading,setPreviewLoading]=React.useState(false);
 const submitting=React.useRef(false);
 const open=controlledOpen??localOpen;
 const setOpen=(value:boolean)=>{if(submitting.current)return;setLocalOpen(value);onOpenChange?.(value);};
 const pendingRows=mode==='single'?(eligibleBillingRows(rows).length>0?rows:[]):eligibleBillingRows(rows);
 const eligible=pendingRows.length>0&&pendingRows.length<=100;
 const reviewIds=pendingRows.map(row=>row.id).join(',');
 React.useEffect(()=>{
  setPreviews([]);
  if(!open||!canApprove||!reviewIds)return;
  let active=true;setPreviewLoading(true);setError('');setPassword('');setPasswordError('');
  Promise.all(reviewIds.split(',').map(id=>apiClient.get<IssuancePreviewResponse>(`/v1/billing-cycles/${encodeURIComponent(id)}/issuance-preview`,{cache:'no-store'})))
   .then(values=>{if(active)setPreviews(values);})
   .catch(()=>{if(active)setError(th?'ไม่สามารถโหลดข้อมูลตรวจอนุมัติ กรุณาปิดและเปิดตรวจสอบใหม่':'Unable to load approval facts. Close and reopen the review.');})
   .finally(()=>{if(active)setPreviewLoading(false);});
  return()=>{active=false;};
 },[open,canApprove,reviewIds,approver.displayName,approver.position,approver.hasSignature,th]);
 const reviewed=previews.length===pendingRows.length&&previews.length>0;
 const reviewRows=reviewed?pendingRows.flatMap((row,index)=>{const preview=previews[index]!;return 'failure' in preview?[]:[{...row,...preview,pendingReplacement:null}];}):pendingRows;
 const previewFailures=previews.flatMap(preview=>'failure' in preview?[preview.failure]:[]);
 const readyPreview=previews.find(preview=>!('failure' in preview));
 const reviewApprover=readyPreview&&'approver' in readyPreview?readyPreview.approver:approver;
 const approve=async()=>{
  if(submitting.current||!canApprove||!eligible||!reviewed||!reviewRows.length||!reviewApprover.position?.trim()||!password.trim())return;
  submitting.current=true;setBusy(true);setError('');setPasswordError('');
  try{
   const next=await submitBillingApproval(reviewRows,mode,password);
   let issuedIndex=0;
   setResults(previews.map(preview=>'failure' in preview?preview.failure:next[issuedIndex++]!));
   setPassword('');setPasswordError('');
   setLocalOpen(false);onOpenChange?.(false);
   onClearSelection?.();
   onCompleted();
  }catch(err:any){
   const msg=err?.response?.message||err?.message||'';
   if(msg.includes('รหัสผ่านไม่ถูกต้อง')||err?.status===401||err?.statusCode===401||err?.response?.statusCode===401){
    setPasswordError(th?'รหัสผ่านไม่ถูกต้อง กรุณาระบุรหัสผ่านใหม่อีกครั้ง':'Incorrect password. Please try again.');
    setPassword('');
   }else{
    setError(th?'ไม่สามารถออกเอกสารได้ กรุณาลองใหม่ ผลของรายการก่อนหน้าจะแสดงด้านล่าง':'Unable to issue documents. Please try again. Previous results remain below.');
   }
  }finally{submitting.current=false;setBusy(false);}
 };
 return <div className="space-y-3">
  {mode === 'single' && canApprove && rows.length > 0 && controlledOpen === undefined && (
   <div role="status" className="flex flex-wrap items-center gap-3">
    {pendingRows.length > 0 && (
     <Button disabled={busy || !eligible} onClick={() => { setError(''); setPassword(''); setPasswordError(''); setOpen(true); }}>
      {th ? 'อนุมัติและออกเอกสาร' : 'Approve and issue'}
     </Button>
    )}
   </div>
  )}
  {mode === 'bulk' && rows.length > 0 && controlledOpen === undefined && (
   <div
    role="status"
    aria-label={th ? 'แถบจัดการรายการที่เลือก' : 'Selection actions bar'}
    className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card/95 backdrop-blur-md px-5 py-3.5 shadow-2xl animate-in slide-in-from-bottom-4 max-w-4xl w-[92vw] sm:w-auto"
   >
    <div className="flex items-center gap-2">
     <span className="text-sm font-semibold text-foreground">
      {th ? `เลือกแล้ว ${rows.length} รายการ` : `${rows.length} selected`}
     </span>
     <span className="text-xs text-muted-foreground">
      {pendingRows.length > 0
       ? (th ? `(รออนุมัติ ${pendingRows.length} รายการ)` : `(${pendingRows.length} pending approval)`)
       : (th ? '(ไม่มีรายการรออนุมัติ)' : '(no pending approval)')}
     </span>
    </div>
    <div className="flex items-center gap-2">
     {canApprove && pendingRows.length > 0 && (
      <Button
       size="sm"
       disabled={busy || !eligible}
       onClick={() => {
        setError('');
        setPassword('');
        setPasswordError('');
        setOpen(true);
       }}
       className="gap-1.5 font-semibold"
      >
       <FileCheck className="size-4 shrink-0" />
       <span>{th ? `อนุมัติและออกเอกสาร (${pendingRows.length} รายการ)` : `Approve and issue (${pendingRows.length})`}</span>
      </Button>
     )}
     <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={() => exportSelectedRowsAsCsv(rows, locale)}
      className="gap-1.5"
     >
      <Download className="size-4 shrink-0" />
      <span>{th ? `นำออกข้อมูลที่เลือก (${rows.length})` : `Export selected (${rows.length})`}</span>
     </Button>
     {onClearSelection && (
      <Button
       variant="ghost"
       size="sm"
       disabled={busy}
       onClick={onClearSelection}
       className="text-muted-foreground hover:text-foreground"
      >
       {th ? 'ล้างการเลือก' : 'Clear selection'}
      </Button>
     )}
    </div>
   </div>
  )}
  {canApprove&&<Dialog open={open} onOpenChange={setOpen}><DialogContent showCloseButton={!busy} className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{th?'ยืนยันอนุมัติและออกเอกสาร':'Confirm approval and issuance'}</DialogTitle><DialogDescription>{th?'ตรวจสอบใบวางบิลและผู้อนุมัติก่อนออกเอกสาร แต่ละรายการดำเนินการแยกกัน':'Review the billing statements and approver before issuance. Each bill is processed independently.'}</DialogDescription></DialogHeader>
   {error&&<p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
   {previewLoading&&<p role="status">{th?'กำลังโหลดข้อมูลตรวจอนุมัติ…':'Loading approval facts…'}</p>}
   {previewFailures.length>0&&<div role="alert" className="space-y-2"><p>{th?'รายการต่อไปนี้ยังรออนุมัติและจะไม่ถูกส่งอนุมัติในครั้งนี้':'These bills remain pending and will not be submitted in this approval.'}</p>{previewFailures.map((failure,index)=><div key={index}><p>{failure.label.period} · {failure.label.customer==='รายการที่ไม่สามารถเข้าถึงได้'&&!th?'Unavailable record':failure.label.customer} · {failure.label.site}</p><p>{th?failure.message:(englishMessages[failure.message]??'Unable to issue this document')}</p></div>)}</div>}
   {mode==='single'&&reviewRows[0]?<BillingIssuanceReview bill={issuanceBillFromRow(reviewRows[0])} approver={reviewApprover} locale={locale} busy={busy} disabled={!eligible||!reviewed} password={password} onPasswordChange={val=>{setPassword(val);setPasswordError('');}} passwordError={passwordError} onApprove={()=>void approve()}/>:<BillingApprovalConfirmation rows={reviewRows} approver={reviewApprover} locale={locale} busy={busy} disabled={!eligible||!reviewed} password={password} onPasswordChange={val=>{setPassword(val);setPasswordError('');}} passwordError={passwordError} onApprove={()=>void approve()}/>}
   <Button variant="outline" disabled={busy} onClick={()=>setOpen(false)}>{th?'ยกเลิก':'Cancel'}</Button>
  </DialogContent></Dialog>}
  {results.length>0&&<BillingApprovalResults results={results} locale={locale}/>}
 </div>;
}
