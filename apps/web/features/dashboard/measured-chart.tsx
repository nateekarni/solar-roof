"use client";
import { Area,AreaChart,Bar,BarChart,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis } from 'recharts';
import { Card } from '../../components/ui/card';
import { useLocale } from '../../providers/locale-provider';
type Props={initialData?:{date:string;value:number;quality?:string}[]|undefined;hasCustomRange?:boolean|undefined;startDate?:string|undefined;endDate?:string|undefined};
export function MeasuredChart({initialData=[],startDate,endDate,revenue=false}:Props & {revenue?:boolean}) {
  const locale=useLocale();const th=locale==='th';const unit=revenue?'THB':'kWh';
  const title=revenue?(th?'ยอดเรียกเก็บ':'Billed revenue'):(th?'พลังงานจากมิเตอร์':'Metered energy');
  const elements=<><CartesianGrid vertical={false} strokeDasharray="3 3"/><XAxis dataKey="date" tickFormatter={date=>String(date).slice(5)} tick={{fontSize:11}} minTickGap={20}/><YAxis width={70} tick={{fontSize:11}} tickFormatter={v=>Number(v).toLocaleString(locale)}/><Tooltip formatter={value=>[`${Number(value).toLocaleString(locale,{maximumFractionDigits:2})} ${unit}`,title]}/></>;
  return <Card className="panel p-4 min-w-0"><div className="flex flex-wrap justify-between gap-2"><h2 className="text-sm font-semibold">{title} ({unit})</h2><span className="text-xs text-muted-foreground">{startDate} – {endDate}</span></div>
    {initialData.length===0?<div className="grid h-52 place-items-center text-sm text-muted-foreground">{th?'ยังไม่มีข้อมูลในช่วงเวลาที่เลือก':'No data in this date range'}</div>:<div className="mt-4 h-52"><ResponsiveContainer width="100%" height="100%">{revenue?<BarChart data={initialData}>{elements}<Bar dataKey="value" fill="var(--primary)" radius={[3,3,0,0]}/></BarChart>:<AreaChart data={initialData}>{elements}<Area dataKey="value" type="linear" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.15} connectNulls={false}/></AreaChart>}</ResponsiveContainer></div>}
    {!revenue&&initialData.length>0&&<p className="mt-2 text-xs text-muted-foreground">{th?'ผลต่างค่ามิเตอร์สะสมจากช่วงที่มีข้อมูล • วันที่ข้อมูลขาดอาจไม่ครบ':'Cumulative meter deltas for observed intervals • Gaps may make totals partial'}</p>}
  </Card>;
}
export type {Props as MeasuredChartProps};
