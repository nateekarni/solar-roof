'use client';
import {useEffect,useRef,useState} from 'react';
import {safeReturnTo} from '@/lib/session-navigation';
import {AppLoading} from '@/components/feedback/app-loading';

async function sessionPost(path:string):Promise<Response> {
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),10000);
 try {return await fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}',signal:controller.signal});}
 finally {clearTimeout(timeout);}
}
export default function SessionRefreshPage() {
 const started=useRef(false);
 const [uncertain,setUncertain]=useState(false);
 useEffect(()=>{
  if(started.current)return;
  started.current=true;
  const returnTo=safeReturnTo(new URLSearchParams(window.location.search).get('returnTo'));
  void(async()=>{
   try {
    const response=await sessionPost('/v1/auth/refresh');
    if(response.ok){window.location.replace(returnTo);return;}
   } catch {
    // The server may already have rotated the one-use token. Never retry this POST.
    setUncertain(true);return;
   }
   try {await sessionPost('/v1/auth/logout');}
   catch {setUncertain(true);return;}
   window.location.replace('/login?sessionExpired=1');
  })();
 },[]);
 return <main className="flex min-h-svh items-center justify-center px-4">{uncertain?<div className="flex max-w-md flex-col items-center gap-4 text-center"><p role="alert">ไม่สามารถยืนยันผลการต่ออายุหรือออกจากเซสชันได้ กรุณาเข้าสู่ระบบใหม่เพื่อดำเนินการต่อ</p><a className="text-primary underline underline-offset-4" href="/login?sessionExpired=1">เข้าสู่ระบบใหม่</a></div>:<AppLoading fullPage={false} message="กำลังต่ออายุเซสชัน / Restoring your session…"/>}</main>;
}
