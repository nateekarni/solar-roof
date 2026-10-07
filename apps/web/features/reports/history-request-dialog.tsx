"use client";
import { ChoiceSelect } from '../../components/ui/choice-select';
import * as React from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '../../components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '../../components/ui/dialog';
import {Label} from '../../components/ui/label';
import {DatePicker} from '../../components/ui/date-picker';
import {apiClient} from '../../lib/api-client';
import {useLocale} from '../../providers/locale-provider';
export function HistoryRequestDialog(){
 const locale=useLocale(),router=useRouter(),th=locale==='th';
 const [open,setOpen]=React.useState(false),[sites,setSites]=React.useState<{id:string;name:string}[]>([]),[siteId,setSite]=React.useState(''),[from,setFrom]=React.useState(''),[to,setTo]=React.useState(''),[error,setError]=React.useState<string|null>(null),[loading,setLoading]=React.useState(false),[sitesLoading,setSitesLoading]=React.useState(false);
 const lock=React.useRef(false),identity=React.useRef<{payload:string;key:string}|null>(null);
 const [options,setOptions]=React.useState<{available:boolean;maxDays:number}|null>(null);
 React.useEffect(()=>{if(!open)return;let disposed=false;setSitesLoading(true);setOptions(null);void Promise.all([apiClient.get<{id:string;name:string}[]>('/v1/sites'),apiClient.get<{available:boolean;maxDays:number}>('/v1/history/options')]).then(([rows,current])=>{if(!disposed){setSites(rows);setOptions(current);setError(null);}}).catch(err=>{if(!disposed)setError(err instanceof Error?err.message:'Request failed');}).finally(()=>{if(!disposed)setSitesLoading(false);});return()=>{disposed=true;};},[open]);
 const submit=async(event:React.FormEvent)=>{
  event.preventDefault();if(lock.current)return;lock.current=true;setLoading(true);setError(null);
  const body={siteId,from,to},payload=JSON.stringify(body);if(identity.current?.payload!==payload)identity.current={payload,key:crypto.randomUUID()};
  try{const result=await apiClient.post<{jobId:string}>('/v1/history/restore',body,{headers:{'Idempotency-Key':identity.current.key}});identity.current=null;setOpen(false);router.push(`/reports?job=${encodeURIComponent(result.jobId)}`,{scroll:false});router.refresh();}
  catch(err){setError(err instanceof Error?err.message:(th?'ส่งคำขอไม่สำเร็จ ข้อมูลที่กรอกยังคงอยู่':'Request failed. Entered values are preserved.'));}
  finally{lock.current=false;setLoading(false);}
 };
 return <><Button variant="outline" onClick={()=>setOpen(true)}>{th?'ขอข้อมูลย้อนหลัง':'Request archived detail'}</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{th?'ขอข้อมูลย้อนหลัง':'Request archived detail'}</DialogTitle><DialogDescription>{th?'กู้ข้อมูลที่เก็บใน archive เป็นไฟล์ JSONL บีบอัด ไม่ใส่กลับในข้อมูลสด วันที่สิ้นสุดไม่รวมในคำขอ ยังไม่ยืนยันเวลาเสร็จ':'Restore archived detail as compressed JSONL. End date is exclusive. Completion time has not been verified.'}</DialogDescription></DialogHeader>
 <form onSubmit={event=>void submit(event)} className="space-y-4">{error&&<p role="alert" className="text-destructive">{error}</p>}{options&&!options.available&&<p role="status">{th?'บริการกู้ข้อมูลย้อนหลังยังไม่พร้อมใช้งาน ข้อมูลที่กรอกยังคงอยู่':'History restoration is currently unavailable. Entered values are preserved.'}</p>}{options?.available&&<p className="text-sm">{th?`เลือกช่วงไม่เกิน ${options.maxDays} วัน หากมากกว่านี้ให้แบ่งคำขอ`:`Select at most ${options.maxDays} days. Split larger requests.`}</p>}
 <div className="space-y-2"><Label htmlFor="history-site">{th?'สถานที่':'Site'}</Label><ChoiceSelect id="history-site" value={siteId} onChange={event=>setSite(event.target.value)} required disabled={sitesLoading||loading} className="w-full rounded-md border bg-card p-2"><option value="">{th?'เลือกสถานที่':'Select a site'}</option>{sites.map(site=><option key={site.id} value={site.id}>{site.name}</option>)}</ChoiceSelect></div>
 <div className="space-y-2"><Label htmlFor="history-from">{th?'วันที่เริ่มต้น':'From date'}</Label><DatePicker id="history-from" required value={from} onValueChange={setFrom} className="w-full"/></div>
 <div className="space-y-2"><Label htmlFor="history-to">{th?'วันที่สิ้นสุด (ไม่รวม)':'To date (exclusive)'}</Label><DatePicker id="history-to" required value={to} min={from||undefined} onValueChange={setTo} className="w-full"/></div>
 <DialogFooter><Button type="button" variant="outline" onClick={()=>setOpen(false)}>{th?'ปิด':'Close'}</Button><Button type="submit" disabled={loading||sitesLoading||!options?.available||!siteId||!from||!to}>{loading?(th?'กำลังส่งคำขอ':'Submitting'):(th?'ส่งคำขอ':'Submit request')}</Button></DialogFooter></form>
 </DialogContent></Dialog></>;
}
