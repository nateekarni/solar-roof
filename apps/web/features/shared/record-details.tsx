"use client";
import {FinancialRecordDetails} from '../billing/financial-record-details';
import {RecordJobLink} from './record-job-link';
import {useRouter} from "next/navigation";
import {useAuth} from "../../stores/auth-store";
import {useState} from "react";
import {Button} from "../../components/ui/button";
import {apiClient} from "../../lib/api-client";
import {useLocale} from '../../providers/locale-provider';
import {recordDetailFields,recordDetailLabel} from './record-detail-fields';
import {renderRecordValue} from './record-value';

export function RecordDetails({resource,row,fields,columns}:{resource:string;row:Record<string,unknown>;fields:string[];columns:string[]}) {
 const locale=useLocale();
 const router=useRouter();
 const {user}=useAuth();
 const [downloading,setDownloading]=useState(false);
 const [error,setError]=useState("");
 const acknowledge=async()=>{setDownloading(true);setError("");try{await apiClient.put(`/v1/alerts/${encodeURIComponent(String(row.id))}/acknowledge`,{});router.refresh();}catch(e){setError(e instanceof Error?e.message:"Unable to acknowledge alert");}finally{setDownloading(false);}};
 const download=async()=>{setDownloading(true);setError("");try{const file=await apiClient.getBlob(`/v1/reports/${encodeURIComponent(String(row.id))}/download`);const url=URL.createObjectURL(file);const link=document.createElement("a");link.href=url;const format=String(row.format || "csv").toLowerCase();link.download=`report-${row.id}.${/^[a-z0-9]+$/.test(format)?format:"bin"}`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);}catch(e){setError(e instanceof Error?e.message:"Unable to download report");}finally{setDownloading(false);}};
 const detailFields=recordDetailFields(resource,fields);
 if(resource==='billing'||resource==='receipts')return <FinancialRecordDetails key={resource+':'+String(row.id)} resource={resource} row={row}/>;
 return <div className="space-y-5"><RecordJobLink resource={resource} jobId={row.jobId} locale={locale}/>{resource === "alerts" && row.status === "open" && ["owner","admin","operator"].includes(user?.role || "") && <Button disabled={downloading} onClick={acknowledge}>{locale === "th" ? "รับทราบการแจ้งเตือนนี้" : "Acknowledge this alert"}</Button>}{resource === "reports" && <Button disabled={downloading || !!row.jobId} onClick={download}>{locale === "th" ? "ดาวน์โหลดรายงาน" : "Download report"}</Button>}{error && <p role="alert">{error}</p>}<dl className={["sites","billing","receipts"].includes(resource) ? "grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 xl:grid-cols-3" : "space-y-5"}>{detailFields.map((key)=>{const value=row[key];return <div key={key} className="space-y-1"><dt className="text-sm text-muted-foreground">{recordDetailLabel(resource,key,locale,columns[fields.indexOf(key)]??'')}</dt><dd className="text-sm font-medium break-words whitespace-pre-wrap">{renderRecordValue(value,key,locale)}</dd></div>;})}</dl></div>;
}
