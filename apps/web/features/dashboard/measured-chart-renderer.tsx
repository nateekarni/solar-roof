"use client";
import {Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import type {Locale} from '@solar/i18n';
import {ChartTooltipContent,chartTooltipBounds} from './chart-tooltip';
import {formatAppDate} from '../../lib/date-format';
import {useChartTooltipTrigger} from './use-chart-tooltip-trigger';

export function MeasuredChartRenderer({data, locale, revenue, title, unit}: {
  data: {date: string; value: number | null; quality?: string}[];
  locale: Locale;
  revenue: boolean;
  title: string;
  unit: string;
}) {
  const {trigger,handlers}=useChartTooltipTrigger();
  const elements = <>
    <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3"/>
    <XAxis dataKey="date" tickFormatter={date => formatAppDate(String(date),locale)} tick={{fontSize: 11,fill:'var(--muted-foreground)'}} minTickGap={20}/>
    <YAxis width={70} tick={{fontSize: 11,fill:'var(--muted-foreground)'}} tickFormatter={value => Number(value).toLocaleString(locale)}/>
    <Tooltip {...chartTooltipBounds} trigger={trigger} cursor={revenue?{fill:'var(--muted)',fillOpacity:0.6}:{stroke:'var(--muted-foreground)',strokeDasharray:'3 3'}} content={props=><ChartTooltipContent {...props} locale={locale} unit={unit} title={title} dateLabel/>}/>
  </>;
  return <div className="h-full min-w-0" {...handlers}><ResponsiveContainer width="100%" height="100%">
    {revenue
      ? <BarChart accessibilityLayer data={data}>{elements}<Bar dataKey="value" fill="var(--primary)" radius={[3, 3, 0, 0]}/></BarChart>
      : <AreaChart accessibilityLayer data={data}>{elements}<Area dataKey="value" type="linear" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.15} connectNulls={false}/></AreaChart>}
  </ResponsiveContainer></div>;
}
