"use client";
import { useEffect,useState } from 'react';
import { Button } from '../../components/ui/button';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogTrigger,DialogDescription } from '../../components/ui/dialog';
import { apiClient } from '../../lib/api-client';
import { formatPower } from '../../lib/power-format';
import { useLocale } from '../../providers/locale-provider';
function formatPowerValue(megawatts:number,locale:'th'|'en'){const power=formatPower(megawatts*1_000_000,locale);return `${power.value} ${power.unit}`;}
type Site={id:string;name:string};type Result={siteId:string;site:string;value:number|null};
export function CompareModal({sites=[],startDate,endDate}:{sites?:Site[];startDate?:string;endDate?:string}={}) {
  const locale=useLocale();const th=locale==='th';const [open,setOpen]=useState(false);const [selected,setSelected]=useState<string[]>([]);const [metric,setMetric]=useState('periodKwh');const [rows,setRows]=useState<Result[]>([]);const [error,setError]=useState(false);const [loading,setLoading]=useState(false);
  useEffect(()=>{
    if(!open)return;let active=true;setLoading(true);setError(false);
    const params=new URLSearchParams({metric,site_ids:selected.join(',')});if(startDate)params.set('start_date',startDate);if(endDate)params.set('end_date',endDate);
    apiClient.get<Result[]>(`/v1/dashboard/compare?${params}`).then(data=>{if(active)setRows(data);}).catch(()=>{if(active){setRows([]);setError(true);}}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};
  },[open,metric,selected,startDate,endDate]);
  const metrics=[['periodKwh',th?'พลังงาน (kWh)':'Energy (kWh)'],['periodAmount',th?'ยอดบิล (บาท)':'Billed amount (THB)'],['currentMw',th?'กำลังไฟฟ้าสด':'Live power'],['installedMwp',th?'กำลังติดตั้ง (MWp)':'Installed capacity (MWp)']];
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline" size="sm">{th?'เปรียบเทียบไซต์':'Compare sites'}</Button></DialogTrigger>
    <DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{th?'เปรียบเทียบไซต์':'Compare sites'}</DialogTitle><DialogDescription>{startDate} – {endDate} • {th?'ช่วงเวลาเดียวกับหน้าแรก (สูงสุด 10 ไซต์)':'Home date range (up to 10 sites)'}</DialogDescription></DialogHeader>
      <label className="text-sm">{th?'ตัวชี้วัด':'Metric'}<select className="ml-2 rounded border bg-background p-2" value={metric} onChange={e=>setMetric(e.target.value)}>{metrics.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <div className="max-h-40 overflow-auto grid gap-2 sm:grid-cols-2">{sites.map(site=><label className="text-sm flex items-center gap-2" key={site.id}><input type="checkbox" checked={selected.includes(site.id)} disabled={selected.length>=10&&!selected.includes(site.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,site.id]:old.filter(id=>id!==site.id))}/>{site.name}</label>)}</div>
      {loading?<p>{th?'กำลังโหลด…':'Loading…'}</p>:error?<p role="alert" className="text-destructive">{th?'ไม่สามารถโหลดข้อมูล':'Unable to load comparison'}</p>:rows.length===0?<p>{th?'ไม่มีข้อมูลไซต์':'No site data'}</p>:<div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="border-b"><th className="p-2 text-left">{th?'ไซต์':'Site'}</th><th className="p-2 text-right">{metrics.find(([key])=>key===metric)?.[1]}</th></tr></thead><tbody>{rows.map(row=><tr className="border-b" key={row.siteId}><td className="p-2">{row.site}</td><td className="p-2 text-right tabular-nums">{row.value===null?(th?'ไม่มีข้อมูล':'No data'):metric==='currentMw'?formatPowerValue(row.value,locale):row.value.toLocaleString(locale,{maximumFractionDigits:2})}</td></tr>)}</tbody></table></div>}
    </DialogContent></Dialog>;
}
