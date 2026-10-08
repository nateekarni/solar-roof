'use client';
import * as React from 'react';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter } from '../../components/ui/dialog';
import { apiClient } from '../../lib/api-client';
import type { OrganizationDraft,OrganizationRecord } from './organization-selection';

const fields=[
 ['name','ชื่อที่แสดง','Display name'],['code','รหัสองค์กร','Organization code'],['legalName','ชื่อทางกฎหมาย','Legal name'],
 ['taxId','เลขประจำตัวผู้เสียภาษี','Tax ID'],['taxBranch','สาขาภาษี','Tax branch'],['taxAddress','ที่อยู่สำหรับออกเอกสาร','Billing address'],
 ['contactName','ชื่อผู้ติดต่อ','Contact name'],['phone','โทรศัพท์','Phone'],['documentEmail','อีเมลรับเอกสาร','Document email'],
] as const;
export function OrganizationIdentityFields({value,onChange,locale,disabled=false}:{value:OrganizationDraft;onChange:(value:OrganizationDraft)=>void;locale:'th'|'en';disabled?:boolean}){
 const prefix=React.useId();
 return <div className="grid gap-3 sm:grid-cols-2">{fields.map(([key,th,en])=><div key={key} className={key==='taxAddress'?'space-y-2 sm:col-span-2':'space-y-2'}>
  <Label htmlFor={prefix+key} required={key==='name'||key==='code'}>{locale==='th'?th:en}</Label>
  {key==='taxAddress'?<Textarea id={prefix+key} value={value[key]??''} disabled={disabled} onChange={e=>onChange({...value,[key]:e.target.value})}/>:<Input id={prefix+key} value={value[key]??''} disabled={disabled} maxLength={key==='taxId'?13:key==='code'?64:undefined} inputMode={key==='taxId'?'numeric':undefined} type={key==='documentEmail'?'email':'text'} onChange={e=>onChange({...value,[key]:e.target.value})}/>}
 </div>)}</div>;
}
export function OrganizationEditDialog({open,onOpenChange,organization,onSave,locale}:{open:boolean;onOpenChange:(open:boolean)=>void;organization:OrganizationRecord|OrganizationDraft;onSave:(organization:OrganizationRecord|OrganizationDraft)=>void;locale:'th'|'en'}){
 const [draft,setDraft]=React.useState<OrganizationDraft>(organization);
 const [confirmed,setConfirmed]=React.useState(false),[saving,setSaving]=React.useState(false),[error,setError]=React.useState('');
 const existing='id' in organization;
 React.useEffect(()=>{if(open){setDraft(organization);setConfirmed(false);setError('');}},[open,organization]);
 const save=async()=>{
  setError('');
  if(!draft.name.trim()||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(draft.code.trim())){setError(locale==='th'?'ระบุชื่อองค์กรและรหัส 1–64 ตัวอักษร (A–Z, 0–9, _ หรือ -)':'Enter an organization name and a 1–64 character code (letters, digits, _ or -)');return;}
  if(draft.taxId&&!/^[0-9]{13}$/.test(draft.taxId.trim())){setError(locale==='th'?'เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก':'Tax ID must contain 13 digits');return;}
  if(draft.documentEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.documentEmail)){setError(locale==='th'?'ระบุอีเมลที่ถูกต้อง':'Enter a valid document email');return;}
  if(existing&&!confirmed)return;
  setSaving(true);
  try {
   const result=existing?await apiClient.patch<OrganizationRecord>(`/v1/schools/${organization.id}`,{...draft,impactConfirmed:true,expectedUpdatedAt:organization.updatedAt}):{...draft,name:draft.name.trim(),code:draft.code.trim().toUpperCase()};
   onSave(result);onOpenChange(false);
  }catch(e){setError(e instanceof Error?e.message:(locale==='th'?'บันทึกไม่สำเร็จ':'Unable to save'));}
  finally{setSaving(false);}
 };
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader>
  <DialogTitle>{locale==='th'?'ข้อมูลหลักขององค์กร':'Organization master'}</DialogTitle>
  <DialogDescription>{existing?(locale==='th'?'การแก้ไขมีผลกับทุกไซต์ขององค์กรและค่าเริ่มต้นของสัญญาใหม่ สัญญาและเอกสารเดิมคงข้อมูลที่บันทึกไว้':'Changes affect all organization sites and defaults for new contracts. Existing contract and document snapshots stay unchanged.'):(locale==='th'?'องค์กรใหม่จะถูกสร้างพร้อมกับการบันทึกไซต์งานเท่านั้น':'The new organization is created when the site is saved.')}</DialogDescription>
 </DialogHeader><OrganizationIdentityFields value={draft} onChange={setDraft} locale={locale} disabled={saving}/>
 {existing&&<Label className="flex items-start gap-2"><Input type="checkbox" className="size-4 shrink-0" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{locale==='th'?'ยืนยันการแก้ไขข้อมูลที่ใช้ร่วมกันทุกไซต์':'I confirm changes to the shared organization record for all sites'}</Label>}
 {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 <DialogFooter><Button type="button" variant="outline" onClick={()=>onOpenChange(false)} disabled={saving}>{locale==='th'?'ยกเลิก':'Cancel'}</Button><Button type="button" disabled={saving||(existing&&!confirmed)} onClick={()=>void save()}>{locale==='th'?'บันทึกข้อมูลองค์กร':'Save organization'}</Button></DialogFooter>
 </DialogContent></Dialog>;
}
