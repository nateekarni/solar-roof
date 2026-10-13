"use client";
import {useEffect,useState,type ReactNode} from 'react';
import {documentPdfFilename} from '@solar/domain/document-number';
import {Button} from '../../components/ui/button';
import {apiClient} from '../../lib/api-client';
import {useLocale} from '../../providers/locale-provider';
import {originalDocumentReference,verifiedOriginalPdf,type OriginalDocumentSource} from './original-document-loader';
import {OriginalPdfContent} from './original-document-preview';
export function InlineOriginalDocument({source,children}:{source:OriginalDocumentSource;children?:(content:{download:ReactNode;preview:ReactNode})=>ReactNode}) {
 const th=useLocale()==='th';const [url,setUrl]=useState('');const [error,setError]=useState(false);const [number,setNumber]=useState('');
 useEffect(()=>{let active=true,objectUrl='';setUrl('');setError(false);
 originalDocumentReference(source,apiClient.get).then(async reference=>{const blob=await verifiedOriginalPdf(reference.id,reference.hash,apiClient.getBlob);if(active){objectUrl=URL.createObjectURL(blob);setNumber(reference.number);setUrl(objectUrl);}}).catch(()=>{if(active)setError(true);});
 return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[source.type,source.id,source.documentId]);
 const preview=<section className="space-y-3" aria-label={th?'เอกสารต้นฉบับ':'Original document'}>{error?<p role="status">{th?'ไม่มีเอกสารต้นฉบับที่บันทึกไว้สำหรับรายการนี้':'Saved original document unavailable for this record.'}</p>:<OriginalPdfContent url={url} error={false} number={number} th={th} inline={!!children}/>}</section>;
 const download=url?<OriginalDocumentDownload url={url} number={number} th={th}/>:null;
 return children?children({download,preview}):preview;
}
export function OriginalDocumentDownload({url,number,th}:{url:string;number:string;th:boolean}) {
 return <Button asChild variant="outline" size="sm"><a href={url} download={documentPdfFilename(number)} onClick={event=>event.stopPropagation()}>{th?'ดาวน์โหลด PDF':'Download PDF'}</a></Button>;
}
