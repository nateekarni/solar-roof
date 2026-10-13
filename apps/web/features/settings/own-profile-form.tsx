"use client";
import {FormErrorSummary} from "../../components/feedback/form-feedback";
import {useEffect,useState} from 'react';
import {useAuth,authStore} from '../../stores/auth-store';
import {useLocale} from '../../providers/locale-provider';
import {apiClient} from '../../lib/api-client';
import {Button} from '../../components/ui/button';
import {Input} from '../../components/ui/input';
import {Field,FieldLabel} from '../../components/ui/field';

export function OwnProfileForm(){
 const {user}=useAuth();const locale=useLocale(),th=locale==='th';
 const [name,setName]=useState(user?.displayName??''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 useEffect(()=>{setName(user?.displayName??'');},[user?.id,user?.displayName]);
 return <form className="space-y-3" onSubmit={async event=>{
  event.preventDefault();if(busy||!user)return;setBusy(true);setError('');setSaved(false);
  try{const result=await apiClient.put<{displayName:string}>('/v1/me/profile',{displayName:name.trim()});
   const current=authStore.getState();if(current.user?.id===user.id){authStore.setAuth({...current.user,displayName:result.displayName},current.accessToken??undefined);setName(result.displayName);setSaved(true);}
  }catch(e){setError(e instanceof Error?e.message:(th?'บันทึกชื่อไม่สำเร็จ':'Unable to save display name'));}finally{setBusy(false);}
 }}>
  <Field><FieldLabel htmlFor="own-display-name">{th?'ชื่อที่แสดง':'Display name'}</FieldLabel><Input id="own-display-name" required maxLength={120} placeholder={th?'ระบุชื่อที่ต้องการแสดง':'Enter your display name'} value={name} disabled={busy} onChange={e=>{setName(e.target.value);setSaved(false);}}/></Field>
  {error&&<FormErrorSummary>{error}</FormErrorSummary>}{saved&&<p role="status" className="text-sm">{th?'บันทึกชื่อแล้ว':'Display name saved'}</p>}
  <Button type="submit" disabled={busy||!user||!name.trim()||name.trim()===user.displayName}>{busy?(th?'กำลังบันทึก…':'Saving…'):(th?'บันทึกชื่อ':'Save display name')}</Button>
 </form>;
}
