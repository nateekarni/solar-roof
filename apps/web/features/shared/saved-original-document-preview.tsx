"use client";
import * as React from 'react';
import {useEffect,useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '../../components/ui/dialog';
import {apiClient} from '../../lib/api-client';
import {useLocale} from '../../providers/locale-provider';
import {useSessionUser} from '../../providers/session-user-provider';
import {originalDocumentReference,type OriginalDocumentReference,type OriginalDocumentSource} from './original-document-loader';
import {OriginalDocumentPreview} from './original-document-preview';
import {Button} from '../../components/ui/button';
export function SavedOriginalDocumentPreview({open,onOpenChange,source}:{open:boolean;onOpenChange:(value:boolean)=>void;source:OriginalDocumentSource}) {
 const th=useLocale()==='th';const user=useSessionUser();
 const [reference,setReference]=useState<OriginalDocumentReference|null>(null);
 const [error,setError]=useState('');
 const [unissued,setUnissued]=useState(false);const [issuing,setIssuing]=useState(false);
 const canIssue=user.role==='owner'||user.role==='accountant'&&user.authorization?.permissions.includes('business.billing.edit');
 useEffect(()=>{
  if(!open)return;let active=true;setReference(null);setError('');setUnissued(false);
  originalDocumentReference(source,apiClient.get).then(value=>{if(active)setReference(value);}).catch(e=>{if(active){setError(e instanceof Error?e.message:'Could not load original document');setUnissued(source.type==='contract'&&e?.code==='CONTRACT_ORIGINAL_NOT_ISSUED');}});
  return()=>{active=false;};
 },[open,source.type,source.id,source.documentId,user.role]);
 const issue=async()=>{
  if(issuing)return;setIssuing(true);
  try{setReference(await originalDocumentReference(source,apiClient.get,apiClient.post));setError('');setUnissued(false);}
  catch(e){setError(e instanceof Error?e.message:'Could not issue original document');}finally{setIssuing(false);}
 };
 if(reference)return <OriginalDocumentPreview key={`${reference.id}:${reference.hash}`} open={open} onOpenChange={onOpenChange} id={reference.id} hash={reference.hash} number={reference.number} onSend={reference.deliveryEnabled&&reference.deliveryAvailable?()=>apiClient.post(`/v1/contracts/${source.id}/send-email`,{}):undefined} deliveryUnavailable={source.type==='contract'&&['owner','accountant'].includes(user.role)&&!reference.deliveryAvailable}/>;
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="w-[calc(100%-2rem)] sm:max-w-5xl max-h-[94dvh] overflow-y-auto"><DialogHeader><DialogTitle>{source.documentNumber||(th?'เอกสารต้นฉบับ':'Original document')}</DialogTitle></DialogHeader>{error?<p role="alert">{error}</p>:<p role="status">{th?'กำลังโหลดเอกสารต้นฉบับ…':'Loading original document…'}</p>}{unissued&&canIssue?<Button disabled={issuing} onClick={()=>void issue()}>{th?'ออกเอกสารต้นฉบับสัญญา':'Issue contract original'}</Button>:null}</DialogContent></Dialog>;
}
