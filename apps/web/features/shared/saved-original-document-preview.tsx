"use client";
import * as React from 'react';
import {useEffect,useState} from 'react';
import type {Capabilities} from '@solar/api-contracts';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '../../components/ui/dialog';
import {apiClient} from '../../lib/api-client';
import {useLocale} from '../../providers/locale-provider';
import {useSessionUser} from '../../providers/session-user-provider';
import {originalDocumentReference,type OriginalDocumentReference,type OriginalDocumentSource} from './original-document-loader';
import {OriginalDocumentPreview} from './original-document-preview';
export function SavedOriginalDocumentPreview({open,onOpenChange,source}:{open:boolean;onOpenChange:(value:boolean)=>void;source:OriginalDocumentSource}) {
 const th=useLocale()==='th';const user=useSessionUser();
 const [reference,setReference]=useState<OriginalDocumentReference|null>(null);
 const [error,setError]=useState('');const [canSend,setCanSend]=useState(false);
 useEffect(()=>{
  if(!open)return;let active=true;setReference(null);setError('');setCanSend(false);
  originalDocumentReference(source,apiClient.get).then(value=>{if(active)setReference(value);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Could not load original document');});
  if(source.type==='contract'&&['owner','admin'].includes(user.role))apiClient.get<Capabilities>('/v1/auth/capabilities').then(c=>{if(active)setCanSend(c.financialScope==='TEST'&&c.actions.includes('send'));}).catch(()=>{});
  return()=>{active=false;};
 },[open,source.type,source.id,source.documentId,user.role]);
 if(reference)return <OriginalDocumentPreview key={`${reference.id}:${reference.hash}`} open={open} onOpenChange={onOpenChange} id={reference.id} hash={reference.hash} number={reference.number} onSend={canSend&&reference.deliveryAvailable?()=>apiClient.post(`/v1/contracts/${source.id}/send-email`,{}):undefined} deliveryUnavailable={canSend&&!reference.deliveryAvailable}/>;
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="w-[calc(100%-2rem)] sm:max-w-5xl max-h-[94dvh] overflow-y-auto"><DialogHeader><DialogTitle>{source.documentNumber||(th?'เอกสารต้นฉบับ':'Original document')}</DialogTitle></DialogHeader>{error?<p role="alert">{error}</p>:<p role="status">{th?'กำลังโหลดเอกสารต้นฉบับ…':'Loading original document…'}</p>}</DialogContent></Dialog>;
}
