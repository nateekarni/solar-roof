"use client";
import {RecordJobLink} from './record-job-link';
import {useRouter} from "next/navigation";
import {useAuth} from "../../stores/auth-store";
import {useState} from "react";
import {Button} from "../../components/ui/button";
import {apiClient} from "../../lib/api-client";
import {useLocale} from '../../providers/locale-provider';
import {renderStatusBadge} from '../../lib/status-badge';
import {formatAppDateTime,isIsoDateLike} from '../../lib/date-format';
export function RecordDetails({resource,row,fields,columns}:{resource:string;row:Record<string,unknown>;fields:string[];columns:string[]}) {
 const locale=useLocale();
 const router=useRouter();
 const {user}=useAuth();
 const [downloading,setDownloading]=useState(false);
 const [error,setError]=useState("");
 const acknowledge=async()=>{setDownloading(true);setError("");try{await apiClient.put(`/v1/alerts/${encodeURIComponent(String(row.id))}/acknowledge`,{});router.refresh();}catch(e){setError(e instanceof Error?e.message:"Unable to acknowledge alert");}finally{setDownloading(false);}};
 const download=async()=>{setDownloading(true);setError("");try{const file=await apiClient.getBlob(`/v1/reports/${encodeURIComponent(String(row.id))}/download`);const url=URL.createObjectURL(file);const link=document.createElement("a");link.href=url;const format=String(row.format || "csv").toLowerCase();link.download=`report-${row.id}.${/^[a-z0-9]+$/.test(format)?format:"bin"}`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);}catch(e){setError(e instanceof Error?e.message:"Unable to download report");}finally{setDownloading(false);}};
 const extraFields:Record<string,string[]>={audit:["correlationId","beforeJson","afterJson"],contracts:["endDate","companyName","taxId","taxBranch","taxAddress","taxEmail","taxPhone","rates"],billing:["quality","openingEnergy","closingEnergy","paymentStatus","paidAt","rejectionReason"],users:["createdAt"]};
 const extraLabels:Record<string,string>={correlationId:"รหัสเชื่อมโยง",beforeJson:"ข้อมูลก่อนเปลี่ยนแปลง",afterJson:"ข้อมูลหลังเปลี่ยนแปลง",endDate:"วันสิ้นสุด",companyName:"ชื่อบริษัท",taxId:"เลขประจำตัวผู้เสียภาษี",taxBranch:"สาขาภาษี",taxAddress:"ที่อยู่ภาษี",taxEmail:"อีเมลการเงิน",taxPhone:"โทรศัพท์การเงิน",rates:"อัตราค่าไฟ",quality:"คุณภาพข้อมูล",openingEnergy:"พลังงานเริ่มต้น",closingEnergy:"พลังงานสิ้นสุด",paymentStatus:"สถานะการชำระ",paidAt:"วันที่ชำระ",rejectionReason:"เหตุผลที่ไม่อนุมัติ",createdAt:"วันที่สร้างบัญชี"};
 const detailFields=[...fields,...(extraFields[resource]||[])];
 return <div className="space-y-5"><RecordJobLink resource={resource} jobId={row.jobId} locale={locale}/>{resource === "alerts" && row.status === "open" && ["owner","admin","operator"].includes(user?.role || "") && <Button disabled={downloading} onClick={acknowledge}>{locale === "th" ? "รับทราบการแจ้งเตือนนี้" : "Acknowledge this alert"}</Button>}{resource === "reports" && <Button disabled={downloading || !!row.jobId} onClick={download}>{locale === "th" ? "ดาวน์โหลดรายงาน" : "Download report"}</Button>}{error && <p role="alert">{error}</p>}<dl className={resource === "sites" ? "grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 xl:grid-cols-3" : "space-y-5"}>{detailFields.map((key,index)=>{const value=row[key];return <div key={key} className="space-y-1"><dt className="text-sm text-muted-foreground">{columns[index]||(locale === "th" ? extraLabels[key] : key)||key}</dt><dd className="text-sm font-medium break-words whitespace-pre-wrap">{value===null||value===undefined?'—':key==='status'||key==='severity'?renderStatusBadge(String(value),locale):isIsoDateLike(String(value))?formatAppDateTime(String(value),locale):typeof value==='object'?JSON.stringify(value,null,2):String(value)}</dd></div>;})}</dl></div>;
}
