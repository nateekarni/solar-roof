"use client";
import * as React from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '../../components/ui/dialog';
import {Button} from '../../components/ui/button';
import {apiClient} from '../../lib/api-client';
import {useLocale} from '../../providers/locale-provider';
import {verifiedOriginalPdf} from './original-document-loader';
interface ContentProps {url:string;error:boolean;number:string;th:boolean;onSend?:(()=>void)|undefined;deliveryUnavailable?:boolean|undefined;sending?:boolean;sent?:boolean;sendError?:string;}
export function OriginalPdfContent({url,error,number,th,onSend,deliveryUnavailable,sending,sent,sendError}:ContentProps) {
 if(error)return <p role="alert">{th?'ไม่สามารถเปิดเอกสารต้นฉบับที่ตรวจสอบแล้วได้':'Could not load the verified original document.'}</p>;
 if(!url)return <p role="status">{th?'กำลังโหลดเอกสารต้นฉบับ…':'Loading original document…'}</p>;
 return <><div className="flex flex-wrap gap-2">
  <Button asChild variant="outline"><a href={url} download={`${number}.pdf`}>{th?'ดาวน์โหลด PDF':'Download PDF'}</a></Button>
  <Button asChild variant="outline"><a href={url} target="_blank" rel="noopener noreferrer">{th?'เปิด / พิมพ์เอกสารต้นฉบับ':'Open / print original'}</a></Button>
  {onSend&&<Button variant="outline" onClick={onSend} disabled={sending||sent}>{sending?(th?'กำลังส่ง…':'Sending…'):sent?(th?'ส่งแล้ว':'Sent'):(th?'ส่งเอกสารต้นฉบับ':'Send original')}</Button>}
 </div>{deliveryUnavailable&&<p role="status">{th?'ไม่มีบัญชีผู้รับที่ยืนยันไว้ กรุณาติดต่อผู้ดูแลเพื่อออกสัญญาที่เลือกบัญชีผู้รับ':'No frozen verified recipient. Ask an administrator to issue a contract with selected recipient accounts.'}</p>}
 {sendError&&<p role="alert">{sendError}</p>}{sent&&<p role="status">{th?'ส่งเอกสารต้นฉบับที่บันทึกไว้แล้ว':'Saved original sent.'}</p>}
 <iframe src={url} title={th?'เอกสารต้นฉบับ':'Original document'} className="h-[65dvh] w-full border rounded"/></>;
}
export function OriginalDocumentPreview({open,onOpenChange,id,hash,number,onSend,deliveryUnavailable}:{open:boolean;onOpenChange:(value:boolean)=>void;id:string;hash:string;number:string;onSend?:(()=>Promise<unknown>)|undefined;deliveryUnavailable?:boolean|undefined}) {
 const th=useLocale()==='th';const [url,setUrl]=React.useState('');const [error,setError]=React.useState(false);
 const [sending,setSending]=React.useState(false);const [sent,setSent]=React.useState(false);const [sendError,setSendError]=React.useState('');
 React.useEffect(()=>{
  if(!open)return;let active=true,objectUrl='';setUrl('');setError(false);setSent(false);setSendError('');
  verifiedOriginalPdf(id,hash,apiClient.getBlob).then(blob=>{if(active){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}}).catch(()=>{if(active)setError(true);});
  return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[open,id,hash]);
 const send=async()=>{
  if(!onSend||sending||sent||!url)return;setSending(true);setSendError('');
  try{const result=await onSend() as {pending?:boolean};if(result?.pending)setSendError(th?'การส่งยังดำเนินอยู่ กรุณาลองอีกครั้ง':'Delivery is still in progress. Try again.');else setSent(true);}catch(e){setSendError(e instanceof Error?e.message:(th?'ส่งเอกสารไม่สำเร็จ':'Could not send document'));}finally{setSending(false);}
 };
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="w-[calc(100%-2rem)] sm:max-w-5xl max-h-[94dvh] overflow-y-auto [&_button]:min-h-11"><DialogHeader><DialogTitle>{number}</DialogTitle></DialogHeader><OriginalPdfContent url={url} error={error} number={number} th={th} onSend={onSend?send:undefined} deliveryUnavailable={deliveryUnavailable} sending={sending} sent={sent} sendError={sendError}/></DialogContent></Dialog>;
}
