"use client";
import {Cell, Pie, PieChart, ResponsiveContainer, Tooltip} from 'recharts';
import type {Locale} from '@solar/i18n';
import {ChartTooltipContent,chartTooltipBounds} from './chart-tooltip';
import {useChartTooltipTrigger} from './use-chart-tooltip-trigger';

export function CollectionChartRenderer({data, locale}: {
  data: {name: string; value: number; color: string}[];
  locale: Locale;
}) {
  const {trigger,handlers}=useChartTooltipTrigger();
  const money = (value: number) => `${value.toLocaleString(locale === 'th' ? 'th-TH' : 'en-US', {maximumFractionDigits: 2})} ${locale === 'th' ? 'บาท' : 'THB'}`;
  return <div className="h-full min-w-0" {...handlers}><ResponsiveContainer width="100%" height="100%">
    <PieChart accessibilityLayer>
      <Pie data={data} dataKey="value" nameKey="name" innerRadius={38} outerRadius={58} strokeWidth={0}>
        {data.map(row => <Cell key={row.name} fill={row.color}/>)}
      </Pie>
      <Tooltip {...chartTooltipBounds} trigger={trigger} content={props=><ChartTooltipContent {...props} locale={locale} unit={locale==='th'?'บาท':'THB'}/>}/>
    </PieChart>
  </ResponsiveContainer></div>;
}
