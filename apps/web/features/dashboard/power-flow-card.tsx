"use client";
import { useEffect,useState } from 'react';
import { apiClient } from '../../lib/api-client';
import { Card } from '../../components/ui/card';
import { telemetryAge } from '../../lib/telemetry-age';
import { useLocale } from '../../providers/locale-provider';

type Reading={siteId:string;siteName:string;gatewayId:string|null;gatewayName:string|null;timestamp:string|null;serverReceivedAt:string|null;lastUpdated:string|null;solarKw:number|null};
export function PowerFlowCard({siteId}:{siteId?:string|undefined}={}) {
  const locale=useLocale();const th=locale==='th';
  const [data,setData]=useState<Reading[]|null>(null);const [error,setError]=useState(false);const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{
    let active=true;let loading=false;
    const load=async()=>{
      if(loading || document.visibilityState!=='visible' || !navigator.onLine)return;
      loading=true;
      try {const result=await apiClient.get<{sites:Reading[]}>(`/v1/dashboard/power-flow${siteId?`?site_id=${encodeURIComponent(siteId)}`:''}`);if(active){setData(result.sites);setError(false);setNow(Date.now());}}
      catch {if(active){setError(true);setData(null);}} finally {loading=false;}
    };
    setData(null);void load();const id=setInterval(()=>{setNow(Date.now());void load();},10000);
    document.addEventListener('visibilitychange',load);window.addEventListener('online',load);
    return()=>{active=false;clearInterval(id);document.removeEventListener('visibilitychange',load);window.removeEventListener('online',load);};
  },[siteId]);
  return <Card className="panel p-4">
    <h2 className="font-semibold">{th?'สถานะระบบ / Gateway':'System / Gateway status'}</h2>
    <p className="mt-1 text-xs text-muted-foreground">{th?'อัปเดตทุก 10 วินาที • ข้อมูลสดภายใน 2 นาที':'Refreshes every 10 seconds • Fresh within 2 minutes'}</p>
    {error?<p role="alert" className="py-5 text-destructive">{th?'ไม่สามารถโหลดข้อมูลระบบ':'Unable to load system data'}</p>:data===null?<p className="py-5">{th?'กำลังโหลด…':'Loading…'}</p>:data.length===0?<p className="py-5 text-muted-foreground">{th?'ยังไม่มีไซต์':'No sites available'}</p>:<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.map(site=>{
      const age=site.timestamp?Math.max(0,Math.floor((now-Date.parse(site.timestamp))/1000)):null;
      const fresh=age!==null && age<=120;
      const value=fresh&&site.solarKw!==null?`${site.solarKw.toLocaleString(locale,{maximumFractionDigits:3})} kW`:th?'ไม่มีข้อมูลสด':'No fresh readings';
      return <article className="rounded-lg border p-3" key={site.siteId}>
        <h3 className="font-medium">{site.siteName}</h3><p className="text-xs text-muted-foreground">{site.gatewayName|| (th?'ยังไม่มี Gateway':'No gateway configured')}</p>
        <div className="my-3 text-xl font-semibold text-primary">{value}</div>
        <p className="text-xs">{th?'กำลังไฟฟ้าที่วัดได้':'Measured active power'}</p>
        <p className="mt-2 text-xs text-muted-foreground">Gateway: {telemetryAge(site.lastUpdated,locale,now).text}</p>
        <p className="mt-2 text-xs text-muted-foreground">{age===null?(th?'ยังไม่มีข้อมูลจากมิเตอร์':'No meter data received'):(th?`อัปเดต ${age<60?`${age} วินาที`:`${Math.floor(age/60)} นาที`}ที่แล้ว`:`Updated ${age<60?`${age}s`:`${Math.floor(age/60)}m`} ago`)}</p>
        {site.serverReceivedAt&&<p className="text-xs text-muted-foreground">{th?'เซิร์ฟเวอร์รับ':'Server received'}: {new Date(site.serverReceivedAt).toLocaleString(locale,{timeZone:'Asia/Bangkok'})}</p>}
        <p className="mt-2 text-xs text-muted-foreground">{th?'โหลดอาคาร / นำเข้า / ส่งออก: ยังไม่มีค่าที่วัดได้':'Building load / import / export: no measurements available'}</p>
      </article>;
    })}</div>}
  </Card>;
}
