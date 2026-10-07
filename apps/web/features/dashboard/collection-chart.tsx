"use client";
import { Receipt } from 'lucide-react';
import { formatAppDateRange } from '../../lib/date-format';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Card } from '../../components/ui/card';
import { useLocale } from '../../providers/locale-provider';
type Collection={total:number;paid:number;pending:number;paidPercent:number};
const Renderer = dynamic(() => import('./collection-chart-renderer').then(module => module.CollectionChartRenderer), {
 ssr: false,
 loading: () => <div className="h-full animate-pulse rounded-lg bg-muted" aria-busy="true" />,
});
export function CollectionChart({collection,startDate,endDate}:{collection?:Collection;startDate?:string;endDate?:string}) {
 const th=useLocale()==='th';const money=(value:number)=>`${value.toLocaleString(th?'th-TH':'en-US',{maximumFractionDigits:2})} ${th?'บาท':'THB'}`;
 const data=collection?[{name:th?'ชำระแล้ว':'Paid',value:collection.paid,color:'var(--success)'},{name:th?'ค้างชำระ':'Pending',value:collection.pending,color:'var(--warning)'}].filter(row=>row.value>0):[];
 return <Card className="panel w-full min-w-0 p-4"><div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2"><h2 className="text-sm font-semibold">{th?'การเก็บเงิน':'Collection'}</h2><span className="ml-auto max-w-full text-right text-xs text-muted-foreground">{startDate&&endDate?formatAppDateRange(startDate,endDate,th?'th':'en'):''}</span></div>
 {data.length===0?<div className="flex min-h-52 flex-1 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground"><Receipt className="size-7 text-muted-foreground/50" /><p>{th?'ไม่มียอดเรียกเก็บในช่วงเวลาที่เลือก':'No billed amounts in this date range'}</p><Link href="/billing" className="text-xs text-primary">{th?'ดูรายละเอียดบิล':'View bills'}</Link></div>:<><div className="relative mt-2 h-36"><Renderer data={data} locale={th?'th':'en'}/><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><strong className="text-lg">{collection&&collection.total>0?(collection.paid/collection.total*100).toLocaleString(th?'th':'en',{maximumFractionDigits:1}):'—'}%</strong><span className="text-xs text-muted-foreground">{th?'ชำระแล้ว':'Paid'}</span></div></div><div className="mb-3 text-center"><p className="text-xs text-muted-foreground">{th?'ยอดเรียกเก็บทั้งหมด':'Total billed'}</p><strong className="text-lg">{money(collection?.total??0)}</strong></div><dl className="space-y-2 text-sm">{data.map(row=><div key={row.name} className="flex justify-between gap-3"><dt>{row.name}</dt><dd className="font-semibold">{money(row.value)}</dd></div>)}</dl></>}
 {data.length>0&&<Link href="/billing" className="mt-4 block text-center text-xs text-primary">{th?'ดูรายละเอียดบิล':'View bills'}</Link>}</Card>;
}
