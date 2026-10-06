"use client";
import {Cell, Pie, PieChart, ResponsiveContainer, Tooltip} from 'recharts';
import type {Locale} from '@solar/i18n';

export function CollectionChartRenderer({data, locale}: {
  data: {name: string; value: number; color: string}[];
  locale: Locale;
}) {
  const money = (value: number) => `${value.toLocaleString(locale === 'th' ? 'th-TH' : 'en-US', {maximumFractionDigits: 2})} ${locale === 'th' ? 'บาท' : 'THB'}`;
  return <ResponsiveContainer width="100%" height="100%">
    <PieChart>
      <Pie data={data} dataKey="value" nameKey="name" innerRadius={38} outerRadius={58} strokeWidth={0}>
        {data.map(row => <Cell key={row.name} fill={row.color}/>)}
      </Pie>
      <Tooltip formatter={value => money(Number(value))}/>
    </PieChart>
  </ResponsiveContainer>;
}
