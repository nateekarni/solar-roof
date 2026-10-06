"use client";
import {Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import type {Locale} from '@solar/i18n';

export function MeasuredChartRenderer({data, locale, revenue, title, unit}: {
  data: {date: string; value: number | null; quality?: string}[];
  locale: Locale;
  revenue: boolean;
  title: string;
  unit: string;
}) {
  const elements = <>
    <CartesianGrid vertical={false} strokeDasharray="3 3"/>
    <XAxis dataKey="date" tickFormatter={date => String(date).slice(5)} tick={{fontSize: 11}} minTickGap={20}/>
    <YAxis width={70} tick={{fontSize: 11}} tickFormatter={value => Number(value).toLocaleString(locale)}/>
    <Tooltip formatter={value => [`${Number(value).toLocaleString(locale, {maximumFractionDigits: 2})} ${unit}`, title]}/>
  </>;
  return <ResponsiveContainer width="100%" height="100%">
    {revenue
      ? <BarChart data={data}>{elements}<Bar dataKey="value" fill="var(--primary)" radius={[3, 3, 0, 0]}/></BarChart>
      : <AreaChart data={data}>{elements}<Area dataKey="value" type="linear" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.15} connectNulls={false}/></AreaChart>}
  </ResponsiveContainer>;
}
