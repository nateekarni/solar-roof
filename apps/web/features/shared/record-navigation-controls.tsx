'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter,useSearchParams} from 'next/navigation';
import {ArrowLeft,ChevronLeft,ChevronRight} from 'lucide-react';
import {Button} from '../../components/ui/button';
import {apiClient} from '../../lib/api-client';
import {dashboardReturnHref} from './dashboard-record-link';
import {collectRecordIds,financialListHref,readRecordNavigation,recordDetailHref,recordNeighbors,saveRecordNavigation,type FinancialResource,type RecordNavigation} from './record-navigation';

export function RecordNavigationControls({resource,id,locale,siteName,period}:{siteName?:string;period?:string;resource:FinancialResource;id:string;locale:'th'|'en'}) {
 const router=useRouter(),search=useSearchParams(),token=search.get('navigation')??'',th=locale==='th';
 const dashboardHref=dashboardReturnHref(search.get('dashboard'));
 const [context,setContext]=useState<RecordNavigation|null>(null),[activeToken,setToken]=useState(token),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{
  if(dashboardHref)return;
  let current=true;setError(false);setContext(null);
  const saved=token?readRecordNavigation(token,resource):null;
  if(saved){setContext(saved);setToken(token);return;}
  const query='';
  collectRecordIds(resource,query,url=>apiClient.get(url,{cache:'no-store'})).then(ids=>{
   if(!current)return;
   const value={resource,ids,query};
   const nextToken=saveRecordNavigation(value);
   setContext(value);setToken(nextToken);
   // Direct links gain a stable sequence before the user reviews the record.
   router.replace(recordDetailHref(resource,id,nextToken),{scroll:false});
  }).catch(()=>{if(current)setError(true);});
  return()=>{current=false;};
 },[resource,token,retry,router,id,dashboardHref]);
 const neighbors=recordNeighbors(context?.ids??[],id);
 const title=<div className="min-w-0 flex-1"><h1 className="truncate text-xl font-semibold">{siteName||(th?'รายละเอียดเอกสาร':'Document details')}</h1>{period&&<p className="mt-1 whitespace-nowrap text-sm text-muted-foreground">{th?'รอบบิล':'Billing period'} · {period}</p>}</div>;
 if(dashboardHref)return <div className="flex items-center gap-4"><Link className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50" href={dashboardHref}><ArrowLeft className="size-4 shrink-0"/>{th?'กลับไปหน้าแรกตามช่วงและไซต์ที่เลือก':'Back to dashboard with selected period and site'}</Link>{title}</div>;
 return <div className="flex flex-wrap items-center justify-between gap-3">
  <Link aria-label={th?'กลับไปหน้ารายการ':'Back to list'} className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-muted/50" href={financialListHref(resource,context?.query??'')}><ArrowLeft className="size-5"/></Link>{title}
  <div className="ml-auto flex flex-wrap items-center justify-end gap-2 max-sm:w-full" aria-label={th?'เปลี่ยนรายการ':'Record navigation'}>
   {error?<><span role="alert" className="text-sm text-destructive">{th?'โหลดลำดับรายการไม่สำเร็จ':'Unable to load record order'}</span><Button variant="ghost" onClick={()=>setRetry(v=>v+1)}>{th?'ลองอีกครั้ง':'Retry'}</Button></>:<span role="status" className="text-sm text-muted-foreground">{!context?(th?'กำลังโหลดลำดับ…':'Loading order…'):neighbors.index>=0?`${neighbors.index+1} / ${neighbors.total}`:(th?'รายการนี้อยู่นอกผลการค้นหา':'Outside these results')}</span>}
   <Button variant="outline" disabled={!neighbors.previous} onClick={()=>neighbors.previous&&router.push(recordDetailHref(resource,neighbors.previous,activeToken))}><ChevronLeft className="size-4"/>{th?'ก่อนหน้า':'Previous'}</Button>
   <Button variant="outline" disabled={!neighbors.next} onClick={()=>neighbors.next&&router.push(recordDetailHref(resource,neighbors.next,activeToken))}>{th?'ถัดไป':'Next'}<ChevronRight className="size-4"/></Button>
  </div>
 </div>;
}
