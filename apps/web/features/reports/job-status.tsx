"use client";
import * as React from "react";
import {useSearchParams} from "next/navigation";
import type {JobRecord} from "@solar/api-contracts";
import {Button} from "../../components/ui/button";
import {apiClient} from "../../lib/api-client";
import {useT,useLocale} from "../../providers/locale-provider";
import {useJobStatus} from "./use-job-status";
import {HistorySummary,jobDownloadFilename} from './history-summary';

export function JobStatus({jobId}:{jobId:string}) {
 const {job,error,retry}=useJobStatus(jobId),t=useT(),locale=useLocale();
 const [actionError,setActionError]=React.useState<string|null>(null),[busy,setBusy]=React.useState(false);
 const lock=React.useRef(false);
 const action=async(kind:'retry'|'cancel'|'download')=>{
  if(lock.current)return;lock.current=true;setBusy(true);setActionError(null);
  try {
   if(kind==='download'){
    const blob=await apiClient.getBlob(`/v1/jobs/${encodeURIComponent(jobId)}/download`);
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=jobDownloadFilename({id:jobId,kind:job?.kind??'report'});link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   }else{await apiClient.post(`/v1/jobs/${encodeURIComponent(jobId)}/${kind}`);retry();}
  }catch(err){setActionError(kind==='download'?t('jobs.expired'):err instanceof Error?err.message:t('jobs.requestFailed'));}
  finally{lock.current=false;setBusy(false);}
 };
 return <article data-job-id={jobId} id={`job-${jobId}`} className="rounded-xl border p-4 space-y-3 break-words">
  <a href={`/reports?job=${encodeURIComponent(jobId)}`} className="text-sm font-medium">{t('jobs.job')} {jobId}</a>
  <p role="status" aria-live="polite" aria-atomic="true">{job?t(`jobs.${job.status}`):t('jobs.loading')}</p>
  {job&&<>
   {job.history?<HistorySummary history={job.history} locale={locale}/>:<p className="text-sm">{job.report?`${job.report.type} · ${job.report.dateFrom} – ${job.report.dateTo} · ${t(`jobs.${job.report.dataKind}`)}`:t('jobs.unknownMetadata')}</p>}
   {job.progress!==null&&<progress max={100} value={job.progress} aria-label={t('jobs.progress')}/>}
   {job.status==='ready'&&<p className="text-sm">{t('jobs.rows')}: {job.rowCount??t('jobs.unknown')} · {t('jobs.snapshot')}: {job.snapshotAt?new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'medium',timeZone:'Asia/Bangkok'}).format(new Date(job.snapshotAt)):t('jobs.unknown')}</p>}
   {job.errorCode&&<p className="text-sm">{t('jobs.failureCode')}: {job.errorCode}</p>}
   {job.status==='queued'&&job.retryPolicy.availableAt&&job.attempt>1&&<p>{t('jobs.availableAt')}: {job.retryPolicy.availableAt}</p>}
   <div className="flex flex-wrap gap-2">
    {job.status==='ready'&&<Button disabled={busy} onClick={()=>void action('download')}>{t('jobs.download')}</Button>}
    {job.retryPolicy.canRetry&&<Button disabled={busy} onClick={()=>void action('retry')}>{t('jobs.retry')}</Button>}
    {job.retryPolicy.canCancel&&<Button variant="outline" disabled={busy} onClick={()=>void action('cancel')}>{t('jobs.cancel')}</Button>}
   </div>
  </>}
  {(error||actionError)&&<div role="alert"><p>{error==='offline'?t('jobs.offline'):error||actionError}</p><Button variant="outline" onClick={retry}>{t('jobs.refresh')}</Button></div>}
 </article>;
}

export function ReportJobs() {
 const t=useT(),params=useSearchParams(),selected=params.get('job');
 const [items,setItems]=React.useState<JobRecord[]>([]),[cursor,setCursor]=React.useState<string|null>(null),[error,setError]=React.useState<string|null>(null),[loading,setLoading]=React.useState(false);
 const load=React.useCallback(async(after?:string)=>{
  setLoading(true);
  try{const result=await apiClient.get<{items:JobRecord[];nextCursor:string|null}>(`/v1/jobs?limit=25${after?`&cursor=${encodeURIComponent(after)}`:''}`);setItems(old=>after?[...old,...result.items]:result.items);setCursor(result.nextCursor);setError(null);}catch(err){setError(err instanceof Error?err.message:t('jobs.requestFailed'));}finally{setLoading(false);}
 },[t]);
 React.useEffect(()=>{void load();},[load,selected]);
 const ids=[...(selected?[selected]:[]),...items.map(item=>item.id).filter(id=>id!==selected)];
 return <section aria-label={t('jobs.title')} className="space-y-3"><h2 className="font-semibold">{t('jobs.title')}</h2>
  {error&&<p role="alert">{error}</p>}
  {!loading&&!ids.length&&!error&&<p>{t('jobs.empty')}</p>}
  {ids.map(id=><JobStatus key={id} jobId={id}/>)}
  <Button variant="outline" disabled={loading} onClick={()=>void load()}>{t('jobs.refresh')}</Button>
  {cursor&&<Button disabled={loading} onClick={()=>void load(cursor)}>{t('jobs.more')}</Button>}
 </section>;
}
