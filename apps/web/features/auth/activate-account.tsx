"use client";
import {useEffect,useState,useRef, type FormEvent} from 'react';
import Link from 'next/link';
import {Button} from '../../components/ui/button';
import {Input} from '../../components/ui/input';
import {Label} from '../../components/ui/label';
export function ActivateAccount() {
  const [token,setToken]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[complete,setComplete]=useState(false),[error,setError]=useState('');
  const captured=useRef(false);
  useEffect(()=>{
    if(captured.current)return;
    captured.current=true;
    setToken(new URL(window.location.href).searchParams.get('token') ?? '');setReady(true);
    History.prototype.replaceState.call(window.history,window.history.state,'','/activate');
  },[]);
  async function submit(event:FormEvent) {
    event.preventDefault();setError('');
    if(password!==confirm){setError('รหัสผ่านไม่ตรงกัน / Passwords do not match');return;}
    setBusy(true);
    try {
      const response=await fetch('/v1/auth/activate',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',referrerPolicy:'no-referrer',body:JSON.stringify({token,password})});
      if(!response.ok){setError(response.status===429?'กรุณาลองอีกครั้งใน 1 นาที / Try again in one minute':response.status===400?'รหัสผ่านต้องมี 12–128 ตัวอักษร / Use 12–128 characters':'คำเชิญหมดอายุหรือใช้แล้ว กรุณาติดต่อผู้ดูแลเพื่อส่งใหม่ / Invitation unavailable. Ask your administrator to resend.');return;}
      setComplete(true);setToken('');setPassword('');setConfirm('');
    } catch {setError('เชื่อมต่อไม่ได้ กรุณาลองใหม่ / Unable to connect. Try again.');}
    finally {setBusy(false);}
  }
  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
    <h1 className="text-2xl font-semibold">เปิดใช้งานบัญชี / Activate account</h1>
    {complete?<div className="mt-6 space-y-4"><p role="status">บัญชีพร้อมใช้งานแล้ว / Your account is ready.</p><Link href="/login" className="text-primary underline">เข้าสู่ระบบ / Sign in</Link></div>:
      ready&&!token?<p className="mt-6" role="alert">กรุณาเปิดลิงก์จากอีเมลคำเชิญ / Open the link in your invitation email.</p>:
      <form onSubmit={submit} className="mt-6 space-y-4">
        <p className="text-sm text-muted-foreground">ตั้งรหัสผ่านใหม่อย่างน้อย 12 ตัวอักษร / Choose a password with at least 12 characters.</p>
        <div className="space-y-2"><Label htmlFor="activate-password">รหัสผ่าน / Password</Label><Input id="activate-password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={event=>setPassword(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="activate-confirm">ยืนยันรหัสผ่าน / Confirm password</Label><Input id="activate-confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirm} onChange={event=>setConfirm(event.target.value)} /></div>
        {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={!ready||!token||busy} className="w-full">{busy?'กำลังดำเนินการ / Activating…':'เปิดใช้งานบัญชี / Activate account'}</Button>
      </form>}
  </main>;
}
