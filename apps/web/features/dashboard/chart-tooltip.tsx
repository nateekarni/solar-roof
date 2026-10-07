import type {Locale} from '@solar/i18n';
import {formatAppDate} from '../../lib/date-format';
type PayloadEntry={name?:string|number;value?:unknown;color?:string};
export const chartTooltipBounds={allowEscapeViewBox:{x:false,y:false},wrapperStyle:{zIndex:50,maxWidth:'100%'},isAnimationActive:false} as const;
/** One semantic surface for mouse, keyboard and touch tooltips in every dashboard chart. */
export function ChartTooltipContent({active,label,payload,locale,unit,title,dateLabel=false}:{active?:boolean;label?:unknown;payload?:readonly PayloadEntry[];locale:Locale;unit:string;title?:string;dateLabel?:boolean}) {
 if(!active||!payload?.length)return null;
 const rows=payload.filter(row=>typeof row.value==='number'&&Number.isFinite(row.value));
 if(!rows.length)return null;
 return <div role="tooltip" className="dashboard-chart-tooltip max-w-full rounded-xl border border-border bg-popover p-3 text-xs text-popover-foreground shadow-lg" style={{maxWidth:'min(18rem, calc(100vw - 2rem))',overflowWrap:'anywhere'}}>
  {label!=null&&<p className="mb-2 font-medium">{dateLabel?formatAppDate(String(label),locale):String(label)}</p>}
  <dl className="space-y-1.5">{rows.map((row,index)=><div key={index} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"><dt className="min-w-0">{title??row.name}</dt><dd className="font-semibold tabular-nums">{Number(row.value).toLocaleString(locale==='th'?'th-TH':'en-US',{maximumFractionDigits:2})} {unit}</dd></div>)}</dl>
 </div>;
}
