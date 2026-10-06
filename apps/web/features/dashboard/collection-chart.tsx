"use client";
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Card } from '../../components/ui/card';
import { useLocale } from '../../providers/locale-provider';
type Collection={total:number;paid:number;pending:number;paidPercent:number};
const Renderer = dynamic(() => import('./collection-chart-renderer').then(module => module.CollectionChartRenderer), {
 ssr: false,
 loading: () => <div className="h-full animate-pulse rounded-lg bg-muted" aria-busy="true" />,
});
export function CollectionChart({collection}:{collection?:Collection}) {
 const th=useLocale()==='th';const money=(value:number)=>`${value.toLocaleString(th?'th-TH':'en-US',{maximumFractionDigits:2})} ${th?'บาท':'THB'}`;
 const data=collection?[{name:th?'ชำระแล้ว':'Paid',value:collection.paid,color:'var(--success)'},{name:th?'ค้างชำระ':'Pending',value:collection.pending,color:'var(--warning)'}].filter(row=>row.value>0):[];
 return <Card className="panel p-4"><h2 className="text-sm font-semibold">{th?'การเก็บเงินในช่วงเวลาที่เลือก':'Collection for selected range'}</h2>
 {data.length===0?<p className="py-10 text-center text-sm text-muted-foreground">{th?'ไม่มียอดเรียกเก็บในช่วงเวลาที่เลือก':'No billed amounts in this date range'}</p>:<><div className="h-36"><Renderer data={data} locale={th?'th':'en'}/></div><dl className="space-y-2 text-sm">{data.map(row=><div key={row.name} className="flex justify-between gap-3"><dt>{row.name}</dt><dd className="font-semibold">{money(row.value)}</dd></div>)}</dl></>}
 <Link href="/billing" className="mt-4 block text-center text-xs text-primary">{th?'ดูรายละเอียดบิล':'View bills'}</Link></Card>;
}
