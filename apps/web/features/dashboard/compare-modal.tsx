"use client";
import { AppLoading } from '../../components/feedback/app-loading';
import {loadComparisonResults,type ComparisonRow,type ComparisonResult} from './compare-results';
import { useEffect,useState } from 'react';
import { DataTable } from '../../components/ui/data-table';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogTrigger,DialogDescription } from '../../components/ui/dialog';
import { apiClient } from '../../lib/api-client';
import { formatPower } from '../../lib/power-format';
import { useLocale } from '../../providers/locale-provider';
import { Field, FieldLabel } from '../../components/ui/field';
import { formatAppDateRange } from '../../lib/date-format';
function formatPowerValue(megawatts:number,locale:'th'|'en'){const power=formatPower(megawatts*1_000_000,locale);return `${power.value} ${power.unit}`;}
type Site={id:string;name:string};
export function CompareModal({sites=[],startDate,endDate}:{sites?:Site[];startDate?:string;endDate?:string}={}) {
  const locale=useLocale();const th=locale==='th';const [open,setOpen]=useState(false);const [selected,setSelected]=useState<string[]>([]);const [metricColumns,setMetricColumns]=useState<string[]>(['periodKwh']);const [rows,setRows]=useState<ComparisonRow[]>([]);const [error,setError]=useState(false);const [loading,setLoading]=useState(false);
  useEffect(()=>{
    if(!open)return;let active=true;setLoading(true);setError(false);
    loadComparisonResults(metricColumns,metric=>{const params=new URLSearchParams({metric,site_ids:selected.join(',')});if(startDate)params.set('start_date',startDate);if(endDate)params.set('end_date',endDate);return apiClient.get<ComparisonResult[]>(`/v1/dashboard/compare?${params}`);}).then(data=>{if(active)setRows(data);}).catch(()=>{if(active){setRows([]);setError(true);}}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};
  },[open,metricColumns,selected,startDate,endDate]);
  const metrics=[['periodKwh',th?'พลังงาน (kWh)':'Energy (kWh)'],['periodAmount',th?'ยอดบิล (บาท)':'Billed amount (THB)'],['currentMw',th?'กำลังไฟฟ้าสด':'Live power'],['installedMwp',th?'กำลังติดตั้ง (MWp)':'Installed capacity (MWp)']];
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline">{th?'เปรียบเทียบไซต์':'Compare sites'}</Button></DialogTrigger>
    <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-none flex-col gap-5 sm:w-[80vw] sm:max-w-[80vw]"><DialogHeader className="shrink-0 pr-8"><DialogTitle>{th?'เปรียบเทียบไซต์':'Compare sites'}</DialogTitle><DialogDescription>{startDate && endDate ? formatAppDateRange(startDate,endDate,locale) : (th?'ช่วงเวลาเดียวกับหน้าแรก':'Home date range')} · {th?'เปรียบเทียบสูงสุด 10 ไซต์':'Compare up to 10 sites'}</DialogDescription></DialogHeader>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-1 pb-1">
      {sites.length > 0 && <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium">{th?'เลือกไซต์ที่ต้องการเปรียบเทียบ':'Select sites to compare'}</h3><span className="text-sm text-muted-foreground">{selected.length ? `${selected.length} / 10` : (th?'ไม่ได้เลือก: แสดงสูงสุด 10 ไซต์':'None selected: show up to 10 sites')}</span></div><div className="grid max-h-36 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">{sites.map(site=><label className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md bg-muted/40 px-3 py-2.5 text-sm" key={site.id}><Checkbox checked={selected.includes(site.id)} disabled={selected.length>=10&&!selected.includes(site.id)} onCheckedChange={checked=>setSelected(old=>checked===true?[...old,site.id]:old.filter(id=>id!==site.id))}/><span className="truncate" title={site.name}>{site.name}</span></label>)}</div></section>}
      <DataTable data={loading || error ? [] : rows} emptyContent={loading ? <AppLoading fullPage={false} /> : error ? <p role="alert" className="text-destructive">{th?"ไม่สามารถโหลดข้อมูล":"Unable to load comparison"}</p> : undefined} getRowId={row=>row.siteId} renderSearchToolbar={searchBox=><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><Field className="w-full sm:max-w-xs"><FieldLabel>{th?'ค้นหาไซต์':'Search sites'}</FieldLabel>{searchBox}</Field><fieldset className="space-y-2"><legend className="text-sm font-medium">{th?'คอลัมน์ตัวชี้วัด':'Metric columns'}</legend><div className="flex flex-wrap gap-3">{metrics.map(([metric,label])=><label key={metric} className="flex items-center gap-2 text-sm"><Checkbox checked={metricColumns.includes(metric!)} disabled={metricColumns.length===1&&metricColumns.includes(metric!)} onCheckedChange={checked=>setMetricColumns(old=>checked===true?[...old,metric!]:old.filter(value=>value!==metric))}/>{label}</label>)}</div></fieldset></div>} columns={[{accessorKey:'site',header:th?'ไซต์':'Site'},...metricColumns.map(metric=>({id:metric,accessorFn:(row:ComparisonRow)=>row.values[metric],header:metrics.find(([key])=>key===metric)?.[1] || metric,cell:({row}:{row:{original:ComparisonRow}})=>{const value=row.original.values[metric];return value==null?(th?'ไม่มีข้อมูล':'No data'):metric==='currentMw'?formatPowerValue(value,locale):value.toLocaleString(locale,{maximumFractionDigits:2});}}))]} />

      </div>

    </DialogContent></Dialog>;
}
