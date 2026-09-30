"use client";
import {MissingReadingEvidenceForm} from './missing-reading-evidence-form';
import {useEffect,useState} from 'react';
import {useAuth} from '../../stores/auth-store';
import {apiClient} from '../../lib/api-client';

type Work={jobs:Array<{id:string;site_id:string;site_name:string;school_name:string;period_start:string;state:string;last_error:string|null}>;deliveries:Array<{id:string;document_number:string;state:string;last_error:string|null}>;notices:Array<{id:string;kind:string;created_at:string}>};
const states:Record<string,string>={pending:'รอดำเนินการ',blocked:'รอแก้ไขข้อมูล',retry:'รอส่งซ้ำ',failed:'ส่งไม่สำเร็จ',paused:'พักการส่ง',uncertain:'ต้องตรวจผลการส่ง',cancelled:'ยกเลิก'};
export function FinancialWorkStatus(){
 const {user}=useAuth();const allowed=['owner','accountant','admin'].includes(user?.role??'');
 const [work,setWork]=useState<Work|null>(null),[error,setError]=useState('');
 useEffect(()=>{if(!allowed)return;let disposed=false;async function refresh(){if(document.hidden)return;try{const value=await apiClient.get<Work>('/v1/financial-work');if(!disposed){setWork(value);setError('');}}catch(error){if(!disposed)setError(error instanceof Error?error.message:'โหลดสถานะไม่สำเร็จ');}}void refresh();const timer=setInterval(()=>void refresh(),30_000);return()=>{disposed=true;clearInterval(timer);};},[allowed]);
 if(!allowed)return null;
 return <section className="mx-4 mt-4 space-y-3 rounded-lg border p-4" aria-label="สถานะการออกและส่งเอกสารอัตโนมัติ"><h2 className="font-semibold">สถานะการออกและส่งเอกสารอัตโนมัติ</h2><p className="text-sm text-muted-foreground">ปิดรอบสิ้นเดือน ดำเนินการวันที่ 1 เวลา 01:00 น. หากข้อมูลไม่ครบจะรอตรวจใหม่ทุกชั่วโมง</p>{error&&<p role="alert">{error}</p>}{!work&&!error&&<p>กำลังโหลดสถานะ</p>}{work&&<><p className="text-sm">รอบบิลที่ยังไม่เสร็จ {work.jobs.length} · งานส่งเอกสารที่ต้องติดตาม {work.deliveries.length}</p>{!work.jobs.length&&!work.deliveries.length&&<p>ไม่มีงานค้างในรายการที่โหลด</p>}{work.jobs.map(job=><article key={job.id} className="rounded border p-2 text-sm"><p className="font-medium">{job.school_name} · {job.site_name}</p><p>รอบ {job.period_start.slice(0,10)} · {states[job.state]??job.state}</p>{job.last_error&&<p>{job.last_error.includes('ACCOUNTING_NOT_CONFIRMED')?'รอยืนยันข้อกำหนดฝ่ายบัญชีก่อนออกเอกสาร':job.last_error}</p>}{user?.role==='admin'&&job.state==='blocked'&&<details className="mt-2"><summary className="cursor-pointer font-medium">เพิ่มหลักฐานมิเตอร์ที่ขาด</summary><MissingReadingEvidenceForm siteId={job.site_id}/></details>}</article>)}{work.deliveries.map(job=><article key={job.id} className="rounded border p-2 text-sm"><p>{job.document_number} · {states[job.state]??job.state}</p>{job.last_error&&<p>{job.last_error}</p>}</article>)}<p className="text-xs text-muted-foreground">ประวัติการแจ้งเจ้าหน้าที่ที่โหลด {work.notices.length} รายการ</p></>}</section>;
}
