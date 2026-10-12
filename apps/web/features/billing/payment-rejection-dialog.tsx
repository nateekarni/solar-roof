'use client';
import {useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '../../components/ui/dialog';
import {Button} from '../../components/ui/button';
import {Input} from '../../components/ui/input';

export const rejectionReasons = [
 ['ภาพไม่ชัด/ข้อมูลไม่ครบ','Unreadable or incomplete evidence'],
 ['บัญชีปลายทางไม่ถูกต้อง','Incorrect receiving account'],
 ['หลักฐานซ้ำ','Duplicate evidence'],
 ['หลักฐานไม่ตรงกับรายการนี้','Evidence does not match this transfer'],
] as const;

export function PaymentRejectionDialog({open,onOpenChange,onConfirm,locale,busy}:{
 open:boolean;onOpenChange:(open:boolean)=>void;onConfirm:(reason:string)=>Promise<boolean|undefined>;locale:'th'|'en';busy:boolean;
}) {
 const th=locale==='th';
 const [choice,setChoice]=useState(''),[custom,setCustom]=useState(''),[error,setError]=useState('');
 async function submit(event:React.FormEvent) {
  event.preventDefault();
  const reason=choice==='other'?custom.trim():choice;
  if(!reason){setError(th?'กรุณาเลือกหรือกรอกเหตุผล':'Choose or enter a reason.');return;}
  setError('');
  if(await onConfirm(reason))onOpenChange(false);
  else setError(th?'บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง':'Unable to save. Please try again.');
 }
 return <Dialog open={open} onOpenChange={(value:boolean)=>{if(!busy)onOpenChange(value);}}><DialogContent className="sm:max-w-lg"><DialogHeader>
  <DialogTitle>{th?'เหตุผลการปฏิเสธ':'Rejection reason'}</DialogTitle>
  <DialogDescription>{th?'ระบุเหตุผลเพื่อให้ผู้ส่งแก้ไขหลักฐานรายการนี้ได้':'Explain how the sender can correct this evidence.'}</DialogDescription>
 </DialogHeader><form onSubmit={submit} className="space-y-4"><fieldset disabled={busy} className="space-y-2"><legend className="sr-only">{th?'เลือกเหตุผล':'Choose a reason'}</legend>
  {[...rejectionReasons.map(labels=>({value:labels[th?0:1],label:labels[th?0:1]})),{value:'other',label:th?'อื่น ๆ':'Other'}].map(option=><label key={option.value} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border p-3"><input type="radio" name="rejection-choice" value={option.value} checked={choice===option.value} onChange={()=>{setChoice(option.value);setError('');}}/>{option.label}</label>)}
  {choice==='other'&&<Input id="rejection-reason" aria-label={th?'ระบุเหตุผลอื่น':'Enter another reason'} value={custom} maxLength={1000} onChange={event=>{setCustom(event.target.value);setError('');}} autoFocus required/>}
 </fieldset>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={()=>onOpenChange(false)}>{th?'ยกเลิก':'Cancel'}</Button><Button type="submit" variant="destructive" disabled={busy||!choice||(choice==='other'&&!custom.trim())}>{busy?(th?'กำลังบันทึก…':'Saving…'):(th?'ยืนยันปฏิเสธ':'Confirm rejection')}</Button></div></form></DialogContent></Dialog>;
}
