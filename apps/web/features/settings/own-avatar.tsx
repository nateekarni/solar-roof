"use client";
import {FormErrorSummary} from "../../components/feedback/form-feedback";
import {useEffect,useRef,useState} from 'react';
import {useAuth,authStore} from '../../stores/auth-store';
import {apiClient} from '../../lib/api-client';
import {useLocale} from '../../providers/locale-provider';
import {Button} from '../../components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '../../components/ui/dialog';
import {cropRectangle,validateAvatarFile} from './avatar-crop';
export function OwnAvatar(){
 const {user}=useAuth(),th=useLocale()==='th';const fileInput=useRef<HTMLInputElement>(null),canvas=useRef<HTMLCanvasElement>(null);
 const [source,setSource]=useState<HTMLImageElement|null>(null),[zoom,setZoom]=useState(1),[pan,setPan]=useState({x:0,y:0}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const drag=useRef<{x:number;y:number;panX:number;panY:number}|null>(null);
 useEffect(()=>{if(!source||!canvas.current)return;const crop=cropRectangle(source.naturalWidth,source.naturalHeight,zoom,pan.x,pan.y),ctx=canvas.current.getContext('2d');ctx?.clearRect(0,0,256,256);ctx?.drawImage(source,crop.x,crop.y,crop.width,crop.height,0,0,256,256);},[source,zoom,pan]);
 return <div className="space-y-3">
  <input ref={fileInput} className="sr-only" type="file" accept="image/png,image/jpeg" aria-label={th?'เลือกรูปโปรไฟล์':'Select profile image'} onChange={async event=>{
   const file=event.target.files?.[0];event.target.value='';if(!file)return;setError('');
   if(!validateAvatarFile(file)){setError(th?'เลือกรูป PNG หรือ JPEG ไม่เกิน 5 MB':'Select a PNG or JPEG up to 5 MB');return;}
   const url=URL.createObjectURL(file),image=new Image();
   image.onload=()=>{URL.revokeObjectURL(url);if(image.naturalWidth*image.naturalHeight>40_000_000){setError(th?'รูปมีขนาดใหญ่เกินไป':'Image dimensions are too large');return;}setSource(image);setZoom(1);setPan({x:0,y:0});};
   image.onerror=()=>{URL.revokeObjectURL(url);setError(th?'ไม่สามารถอ่านรูปได้':'Unable to read image');};image.src=url;
  }}/>
  <button type="button" onClick={()=>fileInput.current?.click()} className="block size-20 overflow-hidden rounded-full border bg-muted" aria-label={th?'เปลี่ยนรูปโปรไฟล์':'Change profile image'}>{user?.avatarData?<img src={user.avatarData} alt="" className="size-full object-cover"/>:<span className="text-2xl font-semibold">{user?.displayName?.slice(0,1)||'?'}</span>}</button>
  <Button variant="outline" onClick={()=>fileInput.current?.click()}>{th?'เปลี่ยนรูป':'Change image'}</Button>
  {error&&<FormErrorSummary>{error}</FormErrorSummary>}
  <Dialog open={!!source} onOpenChange={(open:boolean)=>{if(!open&&!busy)setSource(null);}}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>{th?'จัดตำแหน่งรูป':'Crop profile image'}</DialogTitle><DialogDescription>{th?'ลากรูปเพื่อจัดตำแหน่ง ปรับซูม แล้วบันทึก':'Drag to position, adjust zoom, then save.'}</DialogDescription></DialogHeader>
   <canvas ref={canvas} width={256} height={256} className="mx-auto aspect-square w-full max-w-64 touch-none cursor-move rounded-full border" aria-label={th?'ตัวอย่างรูปที่ครอบตัด':'Cropped image preview'} onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);drag.current={x:event.clientX,y:event.clientY,panX:pan.x,panY:pan.y};}} onPointerMove={event=>{if(!drag.current||!source)return;const start=drag.current,crop=cropRectangle(source.naturalWidth,source.naturalHeight,zoom,pan.x,pan.y),size=event.currentTarget.getBoundingClientRect().width;const ratio=crop.width/size;setPan({x:Math.max(-1,Math.min(1,start.panX-(event.clientX-start.x)*ratio*2/Math.max(1,source.naturalWidth-crop.width))),y:Math.max(-1,Math.min(1,start.panY-(event.clientY-start.y)*ratio*2/Math.max(1,source.naturalHeight-crop.height)))});}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}/>
   <label className="text-sm">{th?'ซูม':'Zoom'}<input className="mt-2 w-full" type="range" min="1" max="4" step="0.01" value={zoom} onChange={event=>setZoom(Number(event.target.value))}/></label>
   {(['x','y'] as const).map(axis=><label key={axis} className="text-sm">{axis==='x'?(th?'ตำแหน่งแนวนอน':'Horizontal position'):(th?'ตำแหน่งแนวตั้ง':'Vertical position')}<input className="mt-2 w-full" type="range" min="-1" max="1" step="0.01" value={pan[axis]} onChange={event=>setPan({...pan,[axis]:Number(event.target.value)})}/></label>)}
   {error&&<FormErrorSummary>{error}</FormErrorSummary>}
   <DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setSource(null)}>{th?'ยกเลิก':'Cancel'}</Button><Button disabled={busy} onClick={async()=>{if(!canvas.current||!user)return;setBusy(true);setError('');try{const image=canvas.current.toDataURL('image/jpeg',0.85),result=await apiClient.put<{avatarData:string}>('/v1/me/avatar',{image});const current=authStore.getState();if(current.user?.id===user.id)authStore.setAuth({...current.user,avatarData:result.avatarData},current.accessToken??undefined);setSource(null);}catch(e){setError(e instanceof Error?e.message:(th?'บันทึกไม่สำเร็จ':'Unable to save'));}finally{setBusy(false);}}}>{busy?(th?'กำลังบันทึก…':'Saving…'):(th?'บันทึกรูป':'Save image')}</Button></DialogFooter>
  </DialogContent></Dialog>
 </div>;
}
