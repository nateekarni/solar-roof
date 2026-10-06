"use client";
import dynamic from 'next/dynamic';
import { Card } from '../../components/ui/card';
import { useLocale } from '../../providers/locale-provider';
type Props={initialData?:{date:string;value:number|null;quality?:string}[]|undefined;hasCustomRange?:boolean|undefined;startDate?:string|undefined;endDate?:string|undefined};
const Renderer = dynamic(() => import('./measured-chart-renderer').then(module => module.MeasuredChartRenderer), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse rounded-lg bg-muted" aria-busy="true" />,
});
export function MeasuredChart({initialData=[],startDate,endDate,revenue=false}:Props & {revenue?:boolean}) {
  const locale=useLocale();const th=locale==='th';const unit=revenue?'THB':'kWh';
  const title=revenue?(th?'ยอดเรียกเก็บ':'Billed revenue'):(th?'พลังงานจากมิเตอร์':'Metered energy');
  const hasMeasurements=initialData.some(point=>Number.isFinite(point.value));
  return <Card className="panel p-4 min-w-0"><div className="flex flex-wrap justify-between gap-2"><h2 className="text-sm font-semibold">{title} ({unit})</h2><span className="text-xs text-muted-foreground">{startDate} – {endDate}</span></div>
    {!hasMeasurements?<div className="grid h-52 place-items-center text-sm text-muted-foreground">{th?'ยังไม่มีข้อมูลในช่วงเวลาที่เลือก':'No data in this date range'}</div>:<div className="mt-4 h-52"><Renderer data={initialData} locale={locale} revenue={revenue} title={title} unit={unit}/></div>}
    {!revenue&&hasMeasurements&&<p className="mt-2 text-xs text-muted-foreground">{th?'ผลต่างค่ามิเตอร์สะสมจากช่วงที่มีข้อมูล • วันที่ข้อมูลขาดอาจไม่ครบ':'Cumulative meter deltas for observed intervals • Gaps may make totals partial'}</p>}
  </Card>;
}
export type {Props as MeasuredChartProps};
