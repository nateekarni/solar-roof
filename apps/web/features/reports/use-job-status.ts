"use client";
import type {JobRecord} from "@solar/api-contracts";
import * as React from "react";
import {apiClient} from "../../lib/api-client";

const terminal = new Set(['ready','failed','cancelled']);
export function useJobStatus(jobId:string):{job:JobRecord|null;error:string|null;retry:()=>void} {
 const [job,setJob]=React.useState<JobRecord|null>(null);
 const [error,setError]=React.useState<string|null>(null);
 const [revision,setRevision]=React.useState(0);
 const retry=React.useCallback(()=>setRevision(v=>v+1),[]);
 React.useEffect(()=>{
  let disposed=false,inFlight=false,finished=false;
  setJob(null);setError(null);
  const fetchJob=async()=>{
   if(disposed||inFlight||finished||document.visibilityState!=='visible')return;
   if(!navigator.onLine){setError('offline');return;}
   inFlight=true;
   try {
    const result=await apiClient.get<JobRecord>(`/v1/jobs/${encodeURIComponent(jobId)}`);
    if(!disposed){setJob(result);setError(null);finished=terminal.has(result.status);}
   }catch(err){if(!disposed){setError(err instanceof Error?err.message:'Request failed');if((err as {status?:number}).status===403||(err as {status?:number}).status===404){setJob(null);finished=true;}}}
   finally{inFlight=false;}
  };
  const offline=()=>setError(previous=>previous??'offline');
  const online=()=>{setError(previous=>previous==='offline'?null:previous);void fetchJob();};
  void fetchJob();const timer=window.setInterval(()=>void fetchJob(),3000);
  document.addEventListener('visibilitychange',fetchJob);window.addEventListener('online',online);window.addEventListener('offline',offline);
  return()=>{disposed=true;clearInterval(timer);document.removeEventListener('visibilitychange',fetchJob);window.removeEventListener('online',online);window.removeEventListener('offline',offline);};
 },[jobId,revision]);
 return {job,error,retry};
}
