'use client';
import {formatAppDateTime} from '../../lib/date-format';
import {TelemetryAgeLabel} from '../shared/telemetry-age-label';
import React,{useState} from 'react';
import {MoreHorizontal} from 'lucide-react';
import {DataTable} from '../../components/ui/data-table';
import type {ColumnDef} from '@tanstack/react-table';
import {Button} from '../../components/ui/button';
import {SearchInput} from '../../components/ui/search-input';
import {ChoiceSelect} from '../../components/ui/choice-select';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from '../../components/ui/dropdown-menu';
export interface GatewayRow{id:string;siteId:string;siteName:string;siteCode:string;name:string;externalGatewayId:string;status:string;deviceCount?:number;lastReceivedAt?:string|null;lastMeasuredAt?:string|null;currentProductionKw?:number|null;lastSeenAt?:string|null;pollingIntervalSeconds?:number;subscriptionTopic?:string;desiredVersion:number|null;publishedVersion:number|null;acknowledgedVersion:number|null;appliedVersion:number|null}
export function GatewayIndex({rows,locale,onSelect}:{rows:GatewayRow[];locale:string;onSelect:(row:GatewayRow)=>void}){
const th=locale==='th';const [search,setSearch]=useState(''),[status,setStatus]=useState('all');
const filtered=rows.filter(row=>(status==='all'||row.status===status)&&`${row.name} ${row.externalGatewayId} ${row.siteName} ${row.siteCode}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
const badge=(row:GatewayRow)=><span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${row.status==='online'?'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400':row.status==='offline'?'bg-red-500/10 text-red-700 dark:text-red-400':'bg-muted text-muted-foreground'}`}>{row.status==='online'?(th?'ออนไลน์':'Online'):row.status==='offline'?(th?'ออฟไลน์':'Offline'):row.status}</span>;
const received=(row:GatewayRow)=><span title={row.lastReceivedAt?formatAppDateTime(row.lastReceivedAt,th?'th':'en'):undefined}><TelemetryAgeLabel value={row.lastReceivedAt} locale={locale}/></span>;
const power=(row:GatewayRow)=>row.currentProductionKw==null?'—':`${Number(row.currentProductionKw).toLocaleString(th?'th-TH':'en-US',{maximumFractionDigits:2})} kW`;
const actions=(row:GatewayRow)=><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`${th?'การจัดการเกตเวย์':'Gateway actions'}: ${row.name}`}><MoreHorizontal className="size-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={()=>onSelect(row)}>{th?'ตั้งค่าเกตเวย์':'Configure gateway'}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
const columns:ColumnDef<GatewayRow>[]=[
 {accessorKey:'name',header:th?'เกตเวย์':'Gateway'},
 {accessorKey:'externalGatewayId',header:th?'รหัสเกตเวย์':'Gateway code',cell:({row})=><span className="whitespace-normal break-all">{row.original.externalGatewayId}</span>},
 {accessorKey:'siteName',header:th?'ไซต์งาน':'Site',cell:({row})=><span className="whitespace-normal">{row.original.siteName} · {row.original.siteCode}</span>},
 {accessorKey:'status',header:th?'สถานะ':'Status',cell:({row})=>badge(row.original)},
 {accessorKey:'deviceCount',header:th?'อุปกรณ์':'Devices',cell:({row})=>row.original.deviceCount??0},
 {accessorKey:'currentProductionKw',header:th?'กำลังผลิต':'Production power',cell:({row})=>power(row.original)},
 {accessorKey:'lastReceivedAt',header:th?'รับข้อมูลล่าสุด':'Last received',cell:({row})=>received(row.original)},
 {id:'actions',header:'',enableSorting:false,cell:({row})=>actions(row.original)}];
return <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><SearchInput className="w-full sm:max-w-xs" aria-label={th?'ค้นหาเกตเวย์':'Search gateways'} placeholder={th?'ค้นหาเกตเวย์':'Search gateways'} value={search} onChange={e=>setSearch(e.target.value)}/><div className="flex flex-wrap gap-2 sm:ml-auto"><ChoiceSelect className="w-[160px] max-w-full" aria-label={th?'สถานะเกตเวย์':'Gateway status'} value={status} onChange={e=>setStatus(e.target.value)}><option value="all">{th?'ทุกสถานะ':'All statuses'}</option>{[...new Set(rows.map(row=>row.status))].sort().map(value=><option key={value} value={value}>{value==='online'?(th?'ออนไลน์':'Online'):value==='offline'?(th?'ออฟไลน์':'Offline'):value}</option>)}</ChoiceSelect></div></div>
<div className="hidden md:block [&_table]:table-fixed [&_th]:whitespace-normal [&_td]:whitespace-normal [&_td]:break-words"><DataTable columns={columns} data={filtered} getRowId={row=>row.id} hideSearch/></div>
<div className="space-y-3 md:hidden">{filtered.map(row=><article key={row.id} className="rounded-xl border bg-card p-4 space-y-3"><div className="flex items-center justify-between gap-2"><h2 className="font-medium">{row.name}</h2>{actions(row)}</div><p className="text-sm">{row.externalGatewayId} · {row.siteName} · {row.siteCode}</p>{badge(row)}<dl className="grid grid-cols-2 gap-2 text-sm"><dt>{th?'อุปกรณ์':'Devices'}</dt><dd>{row.deviceCount??0}</dd><dt>{th?'กำลังผลิต':'Production power'}</dt><dd>{power(row)}</dd><dt>{th?'รับข้อมูลล่าสุด':'Last received'}</dt><dd>{received(row)}</dd></dl></article>)}{!filtered.length&&<p className="rounded-xl border p-4 text-sm">{th?'ไม่พบเกตเวย์':'No gateways found'}</p>}</div></section>;
}
