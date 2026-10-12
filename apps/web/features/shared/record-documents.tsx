"use client";
import Link from 'next/link';
import {useState} from 'react';
import {Button} from '../../components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '../../components/ui/dialog';
import {useLocale} from '../../providers/locale-provider';
import {InlineOriginalDocument} from './inline-original-document';
import {originalSourceFromRow} from './original-document-loader';
export function RecordDocuments({resource,row}:{resource:string;row:Record<string,unknown>}) {
 const locale=useLocale(),th=locale==='th';const [open,setOpen]=useState(false);
 const receipt=resource==='receipts';
 return <section className="space-y-3 border-t pt-5" aria-label={th?'เอกสารประกอบ':'Supporting documents'}>
  <h2 className="font-semibold">{th?'เอกสารประกอบ':'Supporting documents'}</h2>
  <div className="flex flex-wrap items-center gap-4"><Button variant="outline" onClick={()=>setOpen(true)}>{receipt?(th?'เปิดใบเสร็จรับเงิน PDF':'Open receipt PDF'):(th?'เปิดใบวางบิล PDF':'Open billing statement PDF')}</Button>
  {receipt&&row.billingCycleId?<Link className="text-primary underline" href={`/records/billing/${encodeURIComponent(String(row.billingCycleId))}`}>{th?'ใบวางบิลและข้อมูลการชำระเงินที่เกี่ยวข้อง':'Related billing statement and payments'}</Link>:null}
  {!receipt&&row.receiptId?<Link className="text-primary underline" href={`/records/receipts/${encodeURIComponent(String(row.receiptId))}`}>{th?'ใบเสร็จรับเงินที่เกี่ยวข้อง':'Related receipt'}</Link>:null}</div>
  <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-5xl max-h-[92dvh] overflow-y-auto"><DialogHeader><DialogTitle>{th?'เอกสารต้นฉบับ':'Original document'}</DialogTitle><DialogDescription>{th?'เปิด ดาวน์โหลด หรือพิมพ์เอกสารต้นฉบับที่บันทึกไว้':'View, download, or print the saved original document.'}</DialogDescription></DialogHeader>{open&&<InlineOriginalDocument source={originalSourceFromRow(receipt?'receipt':'invoice',row,resource)}/>}</DialogContent></Dialog>
 </section>;
}
