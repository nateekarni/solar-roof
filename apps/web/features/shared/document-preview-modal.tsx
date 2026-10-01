"use client";

import * as React from "react";
import type {PersistedDocumentRow} from "@solar/api-contracts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { apiClient } from "../../lib/api-client";
import { useLocale } from "../../providers/locale-provider";
import { Printer, Download } from "lucide-react";

export type DocumentType = "contract" | "invoice" | "receipt" | "settlement" | "handover";
export interface RateScheduleItem { startDate: string; endDate?: string; rate: number; }
export interface DocumentPreviewData {
  type: DocumentType; id?: string; documentId?: string; siteId?: string; billingCycleId?: string;
  title?: string; documentNumber?: string; schoolName?: string; siteName?: string; period?: string;
  issueDate?: string; dueDate?: string; consumedKwh?: number | string; rate?: number | string;
  amount?: number | string; status?: string; signers?: string; version?: string; capacityMwp?: number | string;
  taxId?: string; taxBranch?: string; taxAddress?: string; taxEmail?: string; taxPhone?: string;
  rates?: RateScheduleItem[]; termYears?: number; paymentMethod?: string; paidAt?: string; slipRef?: string;
  solarProducedKwh?: number; gridReplacedPercent?: number; co2SavedKg?: number; treesEquivalent?: number;
  gridSavingsThb?: number; peakPowerKw?: number; codDate?: string; gatewaySerial?: string;
  meterSerial?: string; inverterModel?: string; inverterSerial?: string; panelModel?: string;
}
interface PersistedDocument { id:string; documentNumber:string; documentType:string; status:string; issueDate:string|null; amount:string; snapshot?: {cycle:any;company:any;customer:any;banks:any[];payment?:any}; }
interface Period { id:string; documentNumber:string; periodStart:string; periodEnd:string; }
const emptyCompany={companyName:"",taxId:"",branch:"",address:"",phone:"",email:""};
const printCss=`@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#172b39;margin:0;font-size:12px}article{width:100%;max-width:182mm;margin:auto}header{display:flex;justify-content:space-between;border-bottom:3px solid #14718a;padding-bottom:24px}h1{font-size:24px;color:#14718a}h2{font-size:17px}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{padding:12px 8px;border-bottom:1px solid #dce5e9;text-align:left}th{background:#edf4f6}.right{text-align:right}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:24px 0}.muted{color:#607481}.total{font-size:20px;text-align:right;border-top:2px solid #14718a;padding:20px 0}.signatures{display:flex;justify-content:space-between;margin-top:70px}.notice{padding:12px;background:#fff5dc}p{line-height:1.6;margin:4px 0}`;

export function DocumentPreviewModal({open,onOpenChange,data}:{open:boolean;onOpenChange:(open:boolean)=>void;data:DocumentPreviewData|null}) {
 const locale=useLocale();
 const [company,setCompany]=React.useState(emptyCompany);
 const [banks,setBanks]=React.useState<any[]>([]);
 const [document,setDocument]=React.useState<PersistedDocument|null>(null);
 const [periods,setPeriods]=React.useState<Period[]>([]);
 const [selectedId,setSelectedId]=React.useState("");
 const [error,setError]=React.useState("");
 const [loading,setLoading]=React.useState(false);
 const paper=React.useRef<HTMLElement>(null);
 const isFinancial=data?.type==='invoice'||data?.type==='receipt'||data?.type==='settlement';
 React.useEffect(()=>{
  if(!open||!data) return;
  let active=true;
  setDocument(null);setPeriods([]);setError("");setCompany(emptyCompany);setBanks([]);
  setSelectedId(data.documentId||"");
  if(!isFinancial){
   Promise.all([apiClient.get<typeof emptyCompany>('/v1/settings/company'),apiClient.get<any[]>('/v1/settings/bank-accounts')]).then(([c,b])=>{if(active){setCompany(c);setBanks(b);}}).catch(e=>{if(active)setError(e.message);});
  } else if(!data.documentId) setError(locale==='th'?'ยังไม่มีเอกสารที่ออกและบันทึกไว้สำหรับรายการนี้':'No issued document is available for this record.');
  return()=>{active=false;};
 },[open,data,isFinancial,locale]);
 React.useEffect(()=>{
  if(!open||!selectedId) return;
  let active=true;setLoading(true);setError("");setDocument(null);
  apiClient.get<PersistedDocumentRow>('/v1/operations/documents/'+encodeURIComponent(selectedId)).then(doc=>{
   if(!active)return;
   setDocument(doc);
   setPeriods([]);
   setError(doc.previewUnavailableReason);
  }).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[open,selectedId]);
 if(!data)return null;
 const snapshot=document?.snapshot;
 const cycle=snapshot?.cycle;
 const customer=snapshot?.customer;
 const details= isFinancial ? {number:document?.documentNumber,issue:document?.issueDate,site:customer?.site_name,school:customer?.company_name||customer?.school_name,tax:customer?.tax_id,address:customer?.tax_address,period:cycle?`${String(cycle.period_start).slice(0,10)} – ${String(cycle.period_end).slice(0,10)}`:undefined,kwh:cycle?.consumed_kwh,rate:cycle?.rate,amount:document?.amount,paidAt:snapshot?.payment?.paid_at} : {number:data.documentNumber,issue:data.issueDate,site:data.siteName,school:data.schoolName,tax:data.taxId,address:data.taxAddress,period:data.period,kwh:data.consumedKwh,rate:data.rate,amount:data.amount,paidAt:data.paidAt};
 const number=(v:unknown)=>v===null||v===undefined||v===''?'—':Number.isFinite(Number(v))?Number(v).toLocaleString(locale==='th'?'th-TH':'en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
 const title=data.type==='receipt'?'ใบเสร็จรับเงิน / RECEIPT':data.type==='invoice'?'ใบแจ้งหนี้ / INVOICE':data.type==='settlement'?'ใบวางบิล / BILLING STATEMENT':data.type==='contract'?'สัญญาซื้อขายไฟฟ้า / CONTRACT':'เอกสารส่งมอบ / HANDOVER';
 const eligible=!loading&&!error&&(!isFinancial||!!document?.snapshot)&&!!company.companyName;
 const html=()=>`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${title}</title><style>${printCss}</style></head><body>${paper.current?.outerHTML||''}</body></html>`;
 const print=()=>{const w=window.open('','_blank');if(!w)return;w.document.write(html());w.document.close();w.focus();w.print();};
 const download=()=>{const url=URL.createObjectURL(new Blob([html()],{type:'text/html;charset=utf-8'}));const a=window.document.createElement('a');a.href=url;a.download=`${details.number||data.type}.html`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-5xl max-h-[94vh] overflow-y-auto p-0"><DialogHeader className="sticky top-0 z-10 border-b bg-background p-4"><DialogTitle>{title}</DialogTitle><div className="flex flex-wrap items-center gap-2">
 {isFinancial&&<select aria-label="Issued document period" className="rounded border bg-background p-2 text-sm" value={selectedId} onChange={e=>setSelectedId(e.target.value)} disabled={!periods.length}>{!periods.length&&<option value="">{locale==='th'?'ไม่มีรอบเอกสารที่ออกแล้ว':'No issued periods'}</option>}{periods.map(p=><option key={p.id} value={p.id}>{p.periodStart} – {p.periodEnd} · {p.documentNumber}</option>)}</select>}
 <Button variant="outline" onClick={print} disabled={!eligible}><Printer className="size-4"/> {locale==='th'?'พิมพ์ / บันทึก PDF':'Print / Save PDF'}</Button><Button variant="outline" onClick={download} disabled={!eligible}><Download className="size-4"/> {locale==='th'?'ดาวน์โหลดเอกสาร HTML':'Download HTML'}</Button></div></DialogHeader>
 {loading&&<p className="p-6" role="status">Loading document…</p>}{error&&<p role="alert" className="m-6 rounded border border-destructive p-4 text-destructive">{error}</p>}
 {!loading&&!error&&<div className="overflow-x-auto bg-muted/40 p-4 sm:p-8"><article ref={paper} className="mx-auto min-h-[260mm] w-full max-w-[210mm] bg-white p-6 text-slate-900 shadow sm:p-12" style={{fontSize:12}}>
 <header className="flex justify-between gap-8 border-b-4 border-cyan-700 pb-6"><div><h2 className="text-lg font-bold">{company.companyName||'ยังไม่ได้ตั้งค่าข้อมูลบริษัท'}</h2><p>{company.address||'—'}</p><p>เลขประจำตัวผู้เสียภาษี {company.taxId||'—'} {company.branch}</p><p>{company.phone} {company.email}</p></div><div className="text-right"><h1 className="text-xl font-bold text-cyan-800">{title}</h1><p>{details.number||'ยังไม่ออกเลขเอกสาร / Draft'}</p><p>{details.issue?.slice(0,10)||'—'}</p></div></header>
 <div className="grid my-6 grid-cols-2 gap-6"><div><p className="font-bold">ลูกค้า / Customer</p><p>{details.school||'—'}</p><p>{details.address||'—'}</p><p>Tax ID: {details.tax||'—'}</p></div><div><p>ไซต์ / Site: {details.site||'—'}</p><p>รอบบิล / Period: {details.period||'—'}</p>{data.type==='receipt'&&<p>วันที่ชำระ / Paid: {details.paidAt||'—'}</p>}</div></div>
 {data.type==='contract'?<><p>ผู้ลงนาม: {data.signers||'—'}</p><table className="my-6 w-full"><thead><tr><th>วันเริ่มต้น</th><th>วันสิ้นสุด (ไม่รวม)</th><th>THB/kWh</th></tr></thead><tbody>{(data.rates||[]).map((r,i)=><tr key={i}><td>{r.startDate}</td><td>{r.endDate||'ไม่กำหนด'}</td><td>{number(r.rate)}</td></tr>)}</tbody></table>{!data.rates?.length&&<p>ไม่มีตารางอัตราที่บันทึกไว้</p>}</>:data.type==='handover'?<><p>Gateway: {data.gatewaySerial||'—'}</p><p>Meter: {data.meterSerial||'—'}</p><p>COD: {data.codDate||'—'}</p></>:<><table className="my-6 w-full border-collapse"><thead className="bg-cyan-50"><tr><th className="p-3 text-left">รายการ / Description</th><th className="p-3 text-right">kWh</th><th className="p-3 text-right">THB/kWh</th><th className="p-3 text-right">THB</th></tr></thead><tbody><tr className="border-b"><td className="p-3">ค่าไฟฟ้าพลังงานแสงอาทิตย์<br/>{details.period}</td><td className="p-3 text-right">{number(details.kwh)}</td><td className="p-3 text-right">{number(details.rate)}</td><td className="p-3 text-right">{number(details.amount)}</td></tr></tbody></table><p className="total border-t-2 border-cyan-700 py-5 text-right text-xl font-bold">ยอดรวม / Total THB {number(details.amount)}</p><p className="muted text-slate-500">อัตราค่าไฟเป็นอัตราเฉลี่ยถ่วงน้ำหนักตามช่วงสัญญา / Rate reflects the recorded effective schedule.</p></>}
 {isFinancial&&data.type!=='receipt'&&<div className="my-8"><h2 className="font-bold">บัญชีรับชำระ / Payment accounts</h2>{banks.length?banks.map(b=><p key={b.id}>{b.bank_name||b.bankName} · {b.account_number||b.accountNumber} · {b.account_name||b.accountName}</p>):<p>ยังไม่ได้ตั้งค่าบัญชีรับชำระ</p>}</div>}
 <div className="signatures mt-20 flex justify-between gap-8"><p>________________________<br/>ผู้จัดทำ / Prepared by</p><p>________________________<br/>{data.type==='receipt'?'ผู้รับเงิน / Received by':'ผู้รับเอกสาร / Received by'}</p></div>
 </article></div>}</DialogContent></Dialog>;
}
