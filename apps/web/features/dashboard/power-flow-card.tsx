"use client";
import { ArrowRight, Gauge } from "lucide-react";
import { AppLoading } from "../../components/feedback/app-loading";
import { useState } from 'react';
import {useScopedPowerFlow} from './use-scoped-power-flow';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { telemetryAge } from '../../lib/telemetry-age';
import { formatPower } from '../../lib/power-format';
import { useLocale } from '../../providers/locale-provider';

type Reading={siteId:string;siteName:string;gatewayId:string|null;gatewayName:string|null;timestamp:string|null;serverReceivedAt:string|null;lastUpdated:string|null;meterPowerKw:number|null};
export function PowerFlowCard({siteId,summaryMw=null}:{siteId?:string|undefined;summaryMw?:number|null}={}) {
  const locale=useLocale();const th=locale==='th';
  const [expanded,setExpanded]=useState(false);
  const {sites:data,error,now}=useScopedPowerFlow<Reading>(siteId,expanded);
  const summary=formatPower(summaryMw===null?null:summaryMw*1_000_000,locale);
  return <Card className="panel p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1"><h2 className="text-sm font-semibold">{th?'กำลังไฟฟ้าจากมิเตอร์':'Metered active power'}</h2><strong className="text-lg font-semibold">{summary.value} <span className="text-sm font-normal">{summaryMw!==null?summary.unit:''}</span></strong></div>
      <Button type="button" variant="ghost" size="sm" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?(th?'ซ่อนรายละเอียด':'Hide details'):(th?'แสดงรายละเอียด':'Show details')}<ArrowRight className="size-4" /></Button>
    </div>
    <p className="mt-1 text-xs text-muted-foreground">{th?'รวมค่ามิเตอร์ที่มีข้อมูลล่าสุด • ไม่ใช่กำลังผลิตโซลาร์':'Available latest meter readings • Not solar generation'}</p>
    {expanded&&(error?<p role="alert" className="py-5 text-destructive">{th?'ไม่สามารถโหลดข้อมูลระบบ':'Unable to load system data'}</p>:data===null?<AppLoading fullPage={false} />:data.length===0?<p className="flex min-h-32 flex-col items-center justify-center gap-3 text-center text-muted-foreground"><Gauge className="size-7 text-muted-foreground/50"/>{th?'ยังไม่มีไซต์':'No sites available'}</p>:<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.map(site=>{
      const age=site.timestamp?Math.max(0,Math.floor((now-Date.parse(site.timestamp))/1000)):null;
      const fresh=telemetryAge(site.timestamp,locale,now).fresh&&telemetryAge(site.serverReceivedAt,locale,now).fresh;
      const power=formatPower(site.meterPowerKw===null?null:site.meterPowerKw*1000,locale);
      const value=fresh&&site.meterPowerKw!==null?`${power.value} ${power.unit}`:th?'ไม่มีข้อมูลสด':'No fresh readings';
      return <article className="rounded-lg border p-3" key={site.siteId}>
        <h3 className="font-medium">{site.siteName}</h3><p className="text-xs text-muted-foreground">{site.gatewayName|| (th?'ยังไม่มี Gateway':'No gateway configured')}</p>
        <div className="my-3 text-xl font-semibold text-foreground">{value}</div>
        <p className="text-xs">{th?'กำลังไฟฟ้าที่วัดได้':'Measured active power'}</p>
        <p className="mt-2 text-xs text-muted-foreground">Gateway: {telemetryAge(site.lastUpdated,locale,now).text}</p>
        <p className="mt-2 text-xs text-muted-foreground">{age===null?(th?'ยังไม่มีข้อมูลจากมิเตอร์':'No meter data received'):(th?`อัปเดต ${age<60?`${age} วินาที`:`${Math.floor(age/60)} นาที`}ที่แล้ว`:`Updated ${age<60?`${age}s`:`${Math.floor(age/60)}m`} ago`)}</p>
        {site.serverReceivedAt&&<p className="text-xs text-muted-foreground">{th?'เซิร์ฟเวอร์รับ':'Server received'}: {new Date(site.serverReceivedAt).toLocaleString(locale,{timeZone:'Asia/Bangkok'})}</p>}
        <p className="mt-2 text-xs text-muted-foreground">{th?'โหลดอาคาร / นำเข้า / ส่งออก: ยังไม่มีค่าที่วัดได้':'Building load / import / export: no measurements available'}</p>
      </article>;
    })}</div>)}
  </Card>;
}
