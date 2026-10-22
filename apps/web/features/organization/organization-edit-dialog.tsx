'use client';
import * as React from 'react';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { FieldError } from '../../components/ui/field';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter } from '../../components/ui/dialog';
import { apiClient } from '../../lib/api-client';
import type { OrganizationDraft,OrganizationRecord } from './organization-selection';

const fields=[
 ['name','ชื่อที่แสดง','Display name'],['code','รหัสองค์กร','Organization code'],
 ['legalName','ชื่อทางกฎหมาย','Legal name'],['taxId','เลขประจำตัวผู้เสียภาษี','Tax ID'],
 ['taxBranch','สาขาภาษี','Tax branch'],['documentEmail','อีเมลรับเอกสาร','Document email'],
 ['taxAddress','ที่อยู่สำหรับออกเอกสาร','Billing address'],
 ['contactName','ชื่อผู้ติดต่อ','Contact name'],['phone','โทรศัพท์','Phone'],
] as const;
const placeholders:Record<(typeof fields)[number][0],readonly [string,string]>={
 name:['เช่น บริษัท แสงอาทิตย์','e.g. Sunshine Solar'],
 code:['เช่น ORG-001','e.g. ORG-001'],
 legalName:['เช่น บริษัท แสงอาทิตย์ จำกัด','e.g. Sunshine Solar Co., Ltd.'],
 taxId:['เลขประจำตัวผู้เสียภาษี 13 หลัก','13-digit tax identification number'],
 taxBranch:['เช่น 00000 (สำนักงานใหญ่)','e.g. 00000 (head office)'],
 taxAddress:['เลขที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด รหัสไปรษณีย์','Street address, district, province and postal code'],
 contactName:['เช่น สมชาย ใจดี','e.g. Somchai Jaidee'],
 phone:['เช่น 0812345678','e.g. 0812345678'],
 documentEmail:['เช่น billing@example.com','e.g. billing@example.com'],
};
export function getOrganizationFieldError(
 key:(typeof fields)[number][0],
 value:OrganizationDraft,
 locale:'th'|'en',
 allowBlankCode=false
):string|null{
 const th=locale==='th';
 if(key==='name'&&!value.name?.trim()){
  return th?'กรุณาระบุชื่อองค์กร':'Please enter organization name';
 }
 if(key==='code'){
  const code=(value.code??'').trim();
  if((!allowBlankCode||code)&&!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(code)){
   return th?'ระบุรหัส 1–64 ตัวอักษร (A–Z, 0–9, _ หรือ -)':'Enter a 1–64 character code (letters, digits, _ or -)';
  }
 }
 if(key==='taxId'&&value.taxId?.trim()&&!/^[0-9]{13}$/.test(value.taxId.trim())){
  return th?'เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก':'Tax ID must contain 13 digits';
 }
 if(key==='documentEmail'&&value.documentEmail?.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.documentEmail.trim())){
  return th?'ระบุอีเมลที่ถูกต้อง':'Enter a valid document email';
 }
 return null;
}
export function OrganizationIdentityFields({value,onChange,locale,disabled=false,allowBlankCode=false,showErrors=false}:{value:OrganizationDraft;onChange:(value:OrganizationDraft)=>void;locale:'th'|'en';disabled?:boolean;allowBlankCode?:boolean;showErrors?:boolean}){
 const prefix=React.useId();
 return <div className="grid gap-4 sm:grid-cols-2">{fields.map(([key,th,en])=>{
  const fieldErr=showErrors?getOrganizationFieldError(key,value,locale,allowBlankCode):null;
  return <div key={key} data-slot="field" className={key==='taxAddress'?'flex flex-col gap-1 sm:col-span-2 [&_textarea]:mt-0':'flex flex-col gap-1 [&_input]:mt-0'}>
   <Label htmlFor={prefix+key} className="leading-snug" required={key==='name'||(key==='code'&&!allowBlankCode)}>{locale==='th'?th:en}</Label>
   {key==='taxAddress'?<Textarea id={prefix+key} placeholder={placeholders[key][locale==='th'?0:1]} value={value[key]??''} disabled={disabled} onChange={e=>onChange({...value,[key]:e.target.value})}/>:<Input id={prefix+key} placeholder={key==='code'&&allowBlankCode?(locale==='th'?'เว้นว่างเพื่อสุ่มรหัสอัตโนมัติ':'Leave blank to generate a code'):placeholders[key][locale==='th'?0:1]} value={value[key]??''} disabled={disabled} maxLength={key==='taxId'?13:key==='code'?64:undefined} inputMode={key==='taxId'?'numeric':undefined} type={key==='documentEmail'?'email':'text'} aria-invalid={Boolean(fieldErr)} onChange={e=>onChange({...value,[key]:e.target.value})}/>}
   {fieldErr?<FieldError>{fieldErr}</FieldError>:null}
  </div>;
 })}</div>;
}
export function OrganizationEditDialog({open,onOpenChange,organization,onSave,locale}:{open:boolean;onOpenChange:(open:boolean)=>void;organization:OrganizationRecord|OrganizationDraft;onSave:(organization:OrganizationRecord|OrganizationDraft)=>void;locale:'th'|'en'}){
 const [draft,setDraft]=React.useState<OrganizationDraft>(organization);
 const [confirmed,setConfirmed]=React.useState(false),[saving,setSaving]=React.useState(false),[error,setError]=React.useState(''),[showErrors,setShowErrors]=React.useState(false);
 const existing='id' in organization;
 React.useEffect(()=>{if(open){setDraft(organization);setConfirmed(false);setError('');setShowErrors(false);}},[open,organization]);
 const save=async()=>{
  setShowErrors(true);
  setError('');
  if(!draft.name.trim()||((existing||draft.code.trim())&&!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(draft.code.trim()))){setError(locale==='th'?'ระบุชื่อองค์กรและรหัส 1–64 ตัวอักษร (A–Z, 0–9, _ หรือ -)':'Enter an organization name and a 1–64 character code (letters, digits, _ or -)');return;}
  if(draft.taxId&&!/^[0-9]{13}$/.test(draft.taxId.trim())){setError(locale==='th'?'เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก':'Tax ID must contain 13 digits');return;}
  if(draft.documentEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.documentEmail)){setError(locale==='th'?'ระบุอีเมลที่ถูกต้อง':'Enter a valid document email');return;}
  if(existing&&!confirmed){setError(locale==='th'?'กรุณายืนยันการแก้ไขข้อมูลที่ใช้ร่วมกันทุกไซต์':'Please confirm changes to the shared organization record');return;}
  setSaving(true);
  try {
   const result=existing?await apiClient.patch<OrganizationRecord>(`/v1/customers/${organization.id}`,{...draft,impactConfirmed:true,expectedUpdatedAt:organization.updatedAt}):{...draft,name:draft.name.trim(),code:draft.code.trim()};
   onSave(result);onOpenChange(false);
  }catch(e){setError(e instanceof Error?e.message:(locale==='th'?'บันทึกไม่สำเร็จ':'Unable to save'));}
  finally{setSaving(false);}
 };
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90dvh] sm:max-w-2xl"><DialogHeader>
  <DialogTitle>{locale==='th'?'ข้อมูลหลักขององค์กร':'Organization master'}</DialogTitle>
  <DialogDescription>{existing?(locale==='th'?'การแก้ไขมีผลกับทุกไซต์ขององค์กรและค่าเริ่มต้นของสัญญาใหม่ สัญญาและเอกสารเดิมคงข้อมูลที่บันทึกไว้':'Changes affect all organization sites and defaults for new contracts. Existing contract and document snapshots stay unchanged.'):(locale==='th'?'องค์กรใหม่จะถูกสร้างพร้อมกับการบันทึกไซต์งานเท่านั้น':'The new organization is created when the site is saved.')}</DialogDescription>
 </DialogHeader><div data-slot="dialog-body" className="min-h-0 flex-1 overflow-y-auto p-1 space-y-4"><OrganizationIdentityFields value={draft} onChange={setDraft} locale={locale} disabled={saving} allowBlankCode={!existing} showErrors={showErrors}/>
 {existing&&<div className="space-y-1"><Label className="flex items-start gap-2"><Input type="checkbox" className="size-4 shrink-0" checked={confirmed} aria-invalid={showErrors&&!confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{locale==='th'?'ยืนยันการแก้ไขข้อมูลที่ใช้ร่วมกันทุกไซต์':'I confirm changes to the shared organization record for all sites'}</Label>{showErrors&&!confirmed?<FieldError>{locale==='th'?'กรุณายืนยันการแก้ไขข้อมูลที่ใช้ร่วมกันทุกไซต์':'Please confirm changes to the shared organization record'}</FieldError>:null}</div>}
 {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}</div>
 <DialogFooter><Button type="button" variant="outline" onClick={()=>onOpenChange(false)} disabled={saving}>{locale==='th'?'ยกเลิก':'Cancel'}</Button><Button type="button" disabled={saving} onClick={()=>void save()}>{locale==='th'?'บันทึกข้อมูลองค์กร':'Save organization'}</Button></DialogFooter>
 </DialogContent></Dialog>;
}

