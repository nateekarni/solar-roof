"use client";
import {useEffect,useState} from 'react';
import {apiClient} from '../../lib/api-client';

export function EmailVerification() {
 const [verified,setVerified]=useState<boolean|null>(null),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{let active=true;apiClient.get<{verified:boolean}>('/v1/me/email-verification').then(value=>{if(active)setVerified(value.verified===true);}).catch(error=>{if(active)setMessage(error.message);});return()=>{active=false;};},[]);
 async function submit(action:'request'|'confirm') {
  setBusy(true);setMessage('');
  try {await apiClient.post(`/v1/me/email-verification/${action}`,action==='confirm'?{code}:{});if(action==='confirm'){setVerified(true);setCode('');setMessage('ยืนยันอีเมลแล้ว');}else setMessage('ระบบส่งรหัสไปยังอีเมลบัญชีแล้ว รหัสมีอายุ 15 นาที');}
  catch(error){setMessage(error instanceof Error?error.message:'ดำเนินการไม่สำเร็จ');}finally{setBusy(false);}
 }
 return <section className="space-y-3 rounded-lg border p-4" aria-label="ยืนยันอีเมล"><h2 className="font-semibold">อีเมลรับเอกสาร</h2><p>{verified===null?'ยังไม่ทราบสถานะ':verified?'ยืนยันอีเมลแล้ว':'ยังไม่ยืนยันอีเมล'}</p>{verified===false&&<><button type="button" className="rounded border px-3 py-2" disabled={busy} onClick={()=>void submit('request')}>ส่งรหัสยืนยัน</button><label className="block">รหัส 8 หลัก<input className="ml-2 rounded border p-2" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,''))}/></label><button type="button" className="rounded border px-3 py-2" disabled={busy||code.length!==8} onClick={()=>void submit('confirm')}>ยืนยันรหัส</button></>}<p role="status" className="text-sm">{message}</p></section>;
}
