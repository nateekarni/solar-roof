"use client";
import {FormErrorSummary} from "../../components/feedback/form-feedback";
import {useState,type FormEvent} from 'react';
import Link from 'next/link';
import {useLocale} from '../../providers/locale-provider';
import {authStore} from '../../stores/auth-store';
import {submitOwnPasswordChange,validateOrganizationPassword} from './organization-settings-model';
import {apiClient} from '../../lib/api-client';
import {Button} from '../../components/ui/button';
import {Input} from '../../components/ui/input';
import {Label} from '../../components/ui/label';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '../../components/ui/dialog';
export function OwnPassword(){
 const locale=useLocale(),th=locale==='th';const [open,setOpen]=useState(false),[current,setCurrent]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 function close(){if(busy)return;setOpen(false);setCurrent('');setPassword('');setConfirm('');setError('');}
 async function submit(event:FormEvent){event.preventDefault();setError('');const invalid=validateOrganizationPassword(password,confirm,locale);if(invalid){setError(invalid);return;}setBusy(true);try{
  await submitOwnPasswordChange(current,password,confirm,locale,{update:body=>apiClient.put('/v1/auth/password',body),clear:()=>authStore.clear(),redirect:path=>window.location.assign(path)});
 }catch(e){setError(e instanceof Error?e.message:(th?'เปลี่ยนรหัสผ่านไม่สำเร็จ':'Unable to change password'));}finally{setBusy(false);}}
 return <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-t py-4"><div><p>{th?'รหัสผ่าน':'Password'}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>setOpen(true)}>{th?'เปลี่ยนรหัสผ่าน':'Change password'}</Button><Button variant="ghost" asChild><Link href="/forgot-password">{th?'ลืมรหัสผ่าน':'Forgot password'}</Link></Button></div>
  <Dialog open={open} onOpenChange={next=>{if(!next)close();}}><DialogContent showCloseButton={!busy} onEscapeKeyDown={event=>{if(busy)event.preventDefault();}} onInteractOutside={event=>{if(busy)event.preventDefault();}}><DialogHeader><DialogTitle>{th?'เปลี่ยนรหัสผ่าน':'Change password'}</DialogTitle><DialogDescription>{th?'ใช้รหัสผ่าน 12–128 ตัวอักษร หลังบันทึกจะออกจากระบบทุกอุปกรณ์':'Use 12–128 characters. Saving signs out all devices.'}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4">{[{id:'current-pw',label:th?'รหัสผ่านปัจจุบัน':'Current password',value:current,set:setCurrent,auto:'current-password'},{id:'new-pw',label:th?'รหัสผ่านใหม่':'New password',value:password,set:setPassword,auto:'new-password'},{id:'confirm-pw',label:th?'ยืนยันรหัสผ่านใหม่':'Confirm new password',value:confirm,set:setConfirm,auto:'new-password'}].map(field=><div key={field.id} className="space-y-2"><Label htmlFor={field.id}>{field.label}</Label><Input id={field.id} type="password" autoComplete={field.auto} value={field.value} onChange={event=>field.set(event.target.value)} disabled={busy} required maxLength={128}/></div>)}{error&&<FormErrorSummary>{error}</FormErrorSummary>}<DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={close}>{th?'ยกเลิก':'Cancel'}</Button><Button type="submit" disabled={busy}>{busy?(th?'กำลังบันทึก…':'Saving…'):(th?'บันทึกรหัสผ่านใหม่':'Update password')}</Button></DialogFooter></form></DialogContent></Dialog>
 </div>;
}
