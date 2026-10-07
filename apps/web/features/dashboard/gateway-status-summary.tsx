import Link from 'next/link';
import {CheckCircle2,ChevronRight,Radio} from 'lucide-react';
import {CardTitle} from '../../components/ui/card';
import type {DashboardSummarySite} from '@solar/api-contracts';
import {telemetryAge} from '../../lib/telemetry-age';

export function GatewayStatusSummary({sites,locale}:{sites:DashboardSummarySite[];locale:'th'|'en'}) {
 const th=locale==='th',now=Date.now();
 const rows=sites.map(site=>({...site,age:telemetryAge(site.lastUpdated,locale,now)}));
 const configured=rows.filter(site=>site.gatewayId).length;
 const fresh=rows.filter(site=>site.gatewayId&&site.age.fresh).length;
 const unconfigured=rows.length-configured,stale=configured-fresh;
 const percent=configured?Math.round(fresh/configured*100):null;
 const problems=rows.filter(site=>!site.gatewayId||!site.age.fresh);
 const counters=[{label:th?'ข้อมูลสด':'Fresh',count:fresh,color:'bg-success'},{label:th?'ข้อมูลไม่สด':'Stale',count:stale,color:'bg-warning'},{label:th?'ยังไม่ตั้งค่า':'Unconfigured',count:unconfigured,color:'bg-muted-foreground'}];
 return <section aria-label={th?'สรุปสถานะ Gateway':'Gateway status summary'} className="panel flex h-full min-w-0 flex-col p-4">
  <div className="flex items-center justify-between gap-3"><CardTitle className="text-sm font-semibold">{th?'สรุปสถานะ Gateway':'Gateway status summary'}</CardTitle><Link href="/sites" className="shrink-0 text-xs font-medium text-primary hover:underline">{th?'ทั้งหมด':'All'}</Link></div>
  {sites.length===0?<div className="flex min-h-56 flex-1 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground"><Radio className="size-8 opacity-50"/><p>{th?'ยังไม่มีไซต์ เพิ่มไซต์เพื่อเริ่มติดตาม Gateway':'No sites yet. Add a site to start monitoring gateways.'}</p></div>:<>
   <div className="my-4 flex flex-wrap items-center gap-4 rounded-xl border border-success/20 bg-success/5 p-4">
    <div className="relative grid size-20 shrink-0 place-items-center rounded-full" style={{background:percent===null?'var(--muted)':`conic-gradient(var(--success) ${percent}%, var(--muted) 0)`}}>
     <div className="grid size-16 place-items-center rounded-full bg-card text-xl font-semibold tabular-nums">{percent===null?'—':`${percent}%`}</div>
    </div>
    <div className="min-w-0 flex-1"><strong className="text-3xl font-semibold tabular-nums">{fresh}</strong><p className="mt-1 text-sm font-medium">{th?`${fresh} จาก ${configured} ไซต์ที่ตั้งค่า มีข้อมูลสด`:`${fresh} of ${configured} configured sites have fresh data`}</p><p className="mt-1 text-xs text-muted-foreground">{th?'Gateway ตัวแทน 1 เครื่องต่อไซต์ · ข้อมูลภายใน 2 นาที':'One representative gateway per site · Within 2 minutes'}</p></div>
   </div>
   <dl className="mb-4 grid grid-cols-3 gap-2">{counters.map(counter=><div key={counter.label} className="rounded-lg border border-border/60 px-2.5 py-2"><dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${counter.color}`}/>{counter.label}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{counter.count}</dd></div>)}</dl>
   {problems.length===0?<p className="flex min-h-24 flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground"><CheckCircle2 className="size-7 text-success"/>{th?'ทุกไซต์มีข้อมูลสด':'All sites have fresh data'}</p>:<ul className="divide-y divide-border">{problems.slice(0,5).map(site=><li key={site.id}>
    <Link href={`/records/sites/${encodeURIComponent(site.id)}`} className="flex min-w-0 items-center gap-3 rounded-md px-1 py-3 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring">
     <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${site.gatewayId?'bg-warning':'bg-muted-foreground'}`}/><div className="min-w-0 flex-1"><strong className="block truncate text-sm font-medium">{site.name}</strong><span className="block truncate text-xs text-muted-foreground">{site.gatewayName||(th?'ยังไม่ได้ตั้งค่า Gateway':'No gateway configured')}</span></div><span className="max-w-[45%] text-right text-xs text-muted-foreground">{site.gatewayId?site.age.text:(th?'ตั้งค่า Gateway':'Configure gateway')}</span><ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground"/>
    </Link>
   </li>)}</ul>}
   {problems.length>5&&<p className="mt-3 text-xs text-muted-foreground">{th?`อีก ${problems.length-5} ไซต์ต้องตรวจสอบ`:`${problems.length-5} more sites need attention`}</p>}
  </>}
 </section>;
}