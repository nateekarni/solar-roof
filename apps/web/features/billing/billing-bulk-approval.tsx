'use client';
import * as React from 'react';
import type {IssuanceApprovalBatch,IssuanceApprovalResult,OperationRow} from '@solar/api-contracts';
import {Button} from '../../components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '../../components/ui/dialog';
import {apiClient} from '../../lib/api-client';
import {eligibleBillingRows} from './billing-selection';
import {BillingIssuanceApprover,BillingIssuanceBill,BillingIssuanceReview,type IssuanceApprover} from './billing-issuance-review';

type ApprovalMode='single'|'bulk';
type ApprovalPost=(path:string,body:unknown)=>Promise<unknown>;
export async function submitBillingApproval(rows:readonly OperationRow[],mode:ApprovalMode,post:ApprovalPost=apiClient.post):Promise<IssuanceApprovalResult[]>{
 if(rows.length===0||rows.length>100||eligibleBillingRows(rows).length!==rows.length||(mode==='single'&&rows.length!==1))throw new Error('Select 1 to 100 pending bills');
 if(mode==='single')return [await post(`/v1/billing-cycles/${encodeURIComponent(rows[0]!.id)}/approve-issuance`,{}) as IssuanceApprovalResult];
 return (await post('/v1/billing-cycles/approve-issuance',{billingCycleIds:[...new Set(rows.map(row=>row.id))]}) as IssuanceApprovalBatch).results;
}

const englishMessages:Record<string,string>={
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

export function BillingApprovalConfirmation({rows,approver,locale,busy,onApprove}:{rows:readonly OperationRow[];approver:IssuanceApprover;locale:'th'|'en';busy:boolean;onApprove:()=>void}){
 return <div className="space-y-3"><div className="space-y-2">{rows.map(row=><BillingIssuanceBill key={row.id} bill={{...row,tax:row.simulatedTax}} locale={locale}/>)}</div><BillingIssuanceApprover approver={approver} locale={locale}/><Button disabled={busy||!approver.position?.trim()||rows.length===0||rows.length>100} onClick={onApprove}>{busy?(locale==='th'?'กำลังออกเอกสาร…':'Issuing…'):(locale==='th'?'อนุมัติและออกเอกสาร':'Approve and issue')}</Button></div>;
}

export function BillingBulkApproval({rows,approver,locale,canApprove,onCompleted,mode='bulk',open:controlledOpen,onOpenChange}:{rows:readonly OperationRow[];approver:IssuanceApprover;locale:'th'|'en';canApprove:boolean;onCompleted:()=>void;mode?:ApprovalMode;open?:boolean;onOpenChange?:(open:boolean)=>void}){
 const th=locale==='th';
 const [localOpen,setLocalOpen]=React.useState(false),[busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
 const [results,setResults]=React.useState<IssuanceApprovalResult[]>([]);
 const submitting=React.useRef(false);
 const open=controlledOpen??localOpen;
 const setOpen=(value:boolean)=>{if(submitting.current)return;setLocalOpen(value);onOpenChange?.(value);};
 const eligible=rows.length>0&&rows.length<=100&&eligibleBillingRows(rows).length===rows.length;
 const approve=async()=>{
  if(submitting.current||!canApprove||!eligible||!approver.position?.trim())return;
  submitting.current=true;setBusy(true);setError('');
  try{
   const next=await submitBillingApproval(rows,mode);
   setResults(next);setLocalOpen(false);onOpenChange?.(false);
   onCompleted();
  }catch{setError(th?'ไม่สามารถออกเอกสารได้ กรุณาลองใหม่ ผลของรายการก่อนหน้าจะแสดงด้านล่าง':'Unable to issue documents. Please try again. Previous results remain below.');}
  finally{submitting.current=false;setBusy(false);}
 };
 return <div className="space-y-3">
  {canApprove&&rows.length>0&&controlledOpen===undefined&&<div role="status" className={mode==='bulk'?'sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-lg':'flex flex-wrap items-center gap-3'}>
   {mode==='bulk'&&<span>{th?`เลือกแล้ว ${rows.length} รายการ`:`${rows.length} selected`}</span>}
   <Button disabled={busy||!eligible} onClick={()=>{setError('');setOpen(true);}}>{th?'อนุมัติและออกเอกสาร':'Approve and issue'}</Button>
  </div>}
  {canApprove&&<Dialog open={open} onOpenChange={setOpen}><DialogContent showCloseButton={!busy} className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{th?'ยืนยันอนุมัติและออกเอกสาร':'Confirm approval and issuance'}</DialogTitle><DialogDescription>{th?'ตรวจสอบใบวางบิลและผู้อนุมัติก่อนออกเอกสาร แต่ละรายการดำเนินการแยกกัน':'Review the billing statements and approver before issuance. Each bill is processed independently.'}</DialogDescription></DialogHeader>
   {error&&<p role="alert">{error}</p>}
   {mode==='single'&&rows[0]?<BillingIssuanceReview bill={{...rows[0],tax:rows[0].simulatedTax}} approver={approver} locale={locale} busy={busy||!eligible} onApprove={()=>void approve()}/>:<BillingApprovalConfirmation rows={rows} approver={approver} locale={locale} busy={busy||!eligible} onApprove={()=>void approve()}/>}
   <Button variant="outline" disabled={busy} onClick={()=>setOpen(false)}>{th?'ยกเลิก':'Cancel'}</Button>
  </DialogContent></Dialog>}
  {results.length>0&&<BillingApprovalResults results={results} locale={locale}/>}
 </div>;
}
