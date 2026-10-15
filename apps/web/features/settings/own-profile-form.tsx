"use client";
import React, {useEffect,useState} from 'react';
import {FormErrorSummary} from "../../components/feedback/form-feedback";
import {useAuth,authStore} from '../../stores/auth-store';
import {useLocale} from '../../providers/locale-provider';
import {apiClient} from '../../lib/api-client';
import {Button} from '../../components/ui/button';
import {Input} from '../../components/ui/input';
import {Field,FieldLabel} from '../../components/ui/field';

export function OwnProfileForm({user: propUser}: {user?: import('../../stores/auth-store').AuthUser} = {}){
 const auth=useAuth();const user=propUser??auth.user;const locale=useLocale(),th=locale==='th';
 const [name,setName]=useState(user?.displayName??''),[position,setPosition]=useState(user?.companyPosition??''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 useEffect(()=>{
  setName(user?.displayName??'');
  setPosition(user?.companyPosition??'');
 },[user?.id,user?.displayName,user?.companyPosition]);

 const isDirty=(name.trim()!==(user?.displayName??''))||((position.trim()||null)!==(user?.companyPosition??null));

 return <form className="space-y-3" onSubmit={async event=>{
  event.preventDefault();if(busy||!user)return;setBusy(true);setError('');setSaved(false);
  try{
   const result=await apiClient.put<{displayName:string;companyPosition?:string|null}>('/v1/me/profile',{
    displayName:name.trim(),
    companyPosition:position.trim()||null,
   });
   const current=authStore.getState();
   if(current.user?.id===user.id){
    const nextPosition=result.companyPosition??null;
    authStore.setAuth({...current.user,displayName:result.displayName,companyPosition:nextPosition},current.accessToken??undefined);
    authStore.updateDocumentIdentity(user.id,{companyPosition:nextPosition,hasSignature:user.hasSignature??false});
    setName(result.displayName);
    setPosition(nextPosition??'');
    setSaved(true);
   }
  }catch(e){setError(e instanceof Error?e.message:(th?'บันทึกโปรไฟล์ไม่สำเร็จ':'Unable to save profile'));}finally{setBusy(false);}
 }}>
  <Field><FieldLabel htmlFor="own-display-name">{th?'ชื่อที่แสดง':'Display name'}</FieldLabel><Input id="own-display-name" required maxLength={120} placeholder={th?'ระบุชื่อที่ต้องการแสดง':'Enter your display name'} value={name} disabled={busy} onChange={e=>{setName(e.target.value);setSaved(false);}}/></Field>
  <Field><FieldLabel htmlFor="own-company-position">{th?'ตำแหน่ง':'Position'}</FieldLabel><Input id="own-company-position" maxLength={120} placeholder={th?'ระบุตำแหน่งในบริษัท เช่น กรรมการผู้จัดการ':'Enter company position, e.g. Managing Director'} value={position} disabled={busy} onChange={e=>{setPosition(e.target.value);setSaved(false);}}/></Field>
  {error&&<FormErrorSummary>{error}</FormErrorSummary>}{saved&&<p role="status" className="text-sm">{th?'บันทึกโปรไฟล์แล้ว':'Profile saved'}</p>}
  <Button type="submit" disabled={busy||!user||!name.trim()||!isDirty}>{busy?(th?'กำลังบันทึก…':'Saving…'):(th?'บันทึกโปรไฟล์':'Save profile')}</Button>
 </form>;
}
