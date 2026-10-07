"use client";
import { ChartNoAxesCombined } from "lucide-react";
import {formatAppDateRange} from "../../lib/date-format";
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
  return <Card className="panel p-4 min-w-0"><div className="flex flex-wrap justify-between gap-2"><h2 className="text-sm font-semibold">{title} ({unit})</h2><span className="text-xs text-muted-foreground">{startDate&&endDate?formatAppDateRange(startDate,endDate,locale):""}</span></div>
    {!hasMeasurements?<div className="measured-chart-plot flex h-52 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground"><ChartNoAxesCombined className="size-7 text-muted-foreground/50" />{th?'ยังไม่มีข้อมูลในช่วงเวลาที่เลือก':'No data in this date range'}</div>:<div className="measured-chart-plot mt-4 h-52"><Renderer data={initialData} locale={locale} revenue={revenue} title={title} unit={unit}/></div>}
  </Card>;
}
export type {Props as MeasuredChartProps};
