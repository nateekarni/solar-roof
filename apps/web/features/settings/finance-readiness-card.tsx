'use client';

import * as React from 'react';
import Link from 'next/link';
import type {FinancialReadinessStatus} from '@solar/api-contracts';
import {Button} from '../../components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '../../components/ui/card';
import {formatAppDateTime} from '../../lib/date-format';
import {groupMissingReadiness, type ReadinessStep} from './readiness-steps';

function ReadinessStepCard({step,current,locale,isOwner,onEditCompany}:{step:ReadinessStep;current:boolean;locale:'th'|'en';isOwner:boolean;onEditCompany?: (()=>void)|undefined}) {
  const th=locale==='th';
  const [expandedOverride,setExpanded]=React.useState<boolean|null>(null);
  const expanded=expandedOverride??current;
  const contentId=React.useId();
  return <li aria-current={current?'step':undefined} className={`rounded-lg border ${current?'border-primary/40 bg-primary/5':'border-border'} p-3`}>
    <button type="button" aria-expanded={expanded} aria-controls={contentId} onClick={()=>setExpanded(!expanded)} className="flex w-full items-start justify-between gap-3 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="min-w-0 font-medium">{step.title}<span className="ml-2 text-xs font-normal text-muted-foreground">{th?`${step.items.length} รายการ`:`${step.items.length} pending`}</span></span>
      <span aria-hidden="true" className="text-muted-foreground">{expanded?'−':'+'}</span>
    </button>
    <div id={contentId} hidden={!expanded}>
      {expanded&&<><p className="mt-2 text-sm text-muted-foreground">{step.description}</p><ul className="mt-3 space-y-2 text-sm">
        {step.items.map(item=><li key={item.id} className="flex flex-wrap items-start justify-between gap-2">
          <span>{item.label}</span>
          {item.id!=='approval.confirmation'&&(isOwner&&item.responsibility==='owner'&&item.destination?<Link className="text-primary underline underline-offset-4" href={item.destination} onClick={()=>{if(step.key==='company'&&item.id!=='company.default_bank')onEditCompany?.();}}>{th?'ตั้งค่า':'Set up'}</Link>:<span className="text-muted-foreground">{item.responsibility==='technical'?(th?'ให้ทีมเทคนิคตรวจสอบ':'Ask the technical team'):item.responsibility==='environment'?(th?'ให้ผู้ดูแลระบบที่ติดตั้งตรวจสอบ':'Ask the deployment administrator'):(th?'ให้เจ้าของตรวจสอบ':'Ask the Owner')}</span>)}
        </li>)}
      </ul></>}
    </div>
  </li>;
}

export function FinanceReadinessCard({status,locale,isOwner,confirming,onConfirm,onEditCompany,pendingChanges=false}:{
  status:FinancialReadinessStatus;locale:'th'|'en';isOwner:boolean;confirming:boolean;onConfirm:()=>void;
  onEditCompany?: (()=>void)|undefined;pendingChanges?:boolean;
}) {
  const th=locale==='th';
  const steps=groupMissingReadiness(status,locale);
  const total=status.items.length,completed=status.items.filter(item=>item.ready).length;
  const percent=total?Math.round(completed/total*100):100;
  const progress=th?`ครบแล้ว ${completed} จาก ${total} รายการ`:`${completed} of ${total} complete`;
  const globalOwnerComplete=status.items.some(item=>item.id.startsWith('company.'))&&status.items.some(item=>item.id==='approval.confirmation')&&!status.items.some(item=>item.responsibility==='owner'&&!item.siteId&&item.id!=='approval.confirmation'&&!item.ready);
  const approved=status.scope==='PRODUCTION'&&!!status.approval&&status.items.some(item=>item.id==='approval.confirmation'&&item.ready);
  const ready=approved&&steps.length===0;
  const title=ready?(th?'พร้อมใช้งานการเงินจริง':'Ready for production'):approved?(th?'ยืนยันข้อมูลสำหรับการเงินจริงแล้ว':'Production configuration confirmed'):globalOwnerComplete?(th?'รอการยืนยันจากเจ้าของ':'Awaiting Owner confirmation'):(th?'ความพร้อมสำหรับการเงินจริง':'Production finance readiness');
  return <Card className="panel border-border/80 shadow-xs" aria-label={th?'ความพร้อมสำหรับการเงินจริง':'Production finance readiness'}>
    <CardHeader className="p-0 pb-3">
      <CardTitle className="text-sm">{title}</CardTitle>
      <p className="text-sm font-medium" role="status">{progress}</p>
      <div role="progressbar" aria-label={th?'ความคืบหน้าการตั้งค่าการเงิน':'Finance setup progress'} aria-valuemin={0} aria-valuemax={total||1} aria-valuenow={total?completed:1} aria-valuetext={progress} className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{width:`${percent}%`}}/></div>
      <CardDescription>{th?'ตรวจสอบข้อมูลบริษัทก่อนยืนยัน การเปลี่ยนข้อมูลบริษัทหรือบัญชีธนาคารจะต้องยืนยันใหม่':'Review company information before confirming. Changes to company information or bank accounts require confirmation again.'}</CardDescription>
      {approved&&status.approval&&<dl className="space-y-1 text-sm">
        <div className="flex flex-wrap gap-x-2"><dt className="text-muted-foreground">{th?'ยืนยันโดย':'Confirmed by'}</dt><dd>{th?'เจ้าของ':'Owner'}</dd></div>
        <div className="flex flex-wrap gap-x-2"><dt className="text-muted-foreground">{th?'ยืนยันเมื่อ':'Confirmed at'}</dt><dd><time dateTime={status.approval.approvedAt}>{formatAppDateTime(status.approval.approvedAt,locale)}</time></dd></div>
      </dl>}
      {status.scope==='TEST'&&<p className="text-sm font-semibold">{th?'TEST — โหมดทดสอบ ยังไม่ใช่การยืนยันสำหรับใช้งานจริง':'TEST — Test mode does not confirm production readiness.'}</p>}
    </CardHeader>
    <CardContent className="p-0 space-y-4">
      {steps.length>0&&<ol aria-label={th?'ขั้นตอนที่ยังต้องดำเนินการ':'Remaining setup steps'} className="space-y-2">{steps.map((step,index)=><ReadinessStepCard key={step.key} step={step} current={index===0} locale={locale} isOwner={isOwner} onEditCompany={onEditCompany}/>)}</ol>}
      {!approved&&isOwner&&<><Button type="button" className="h-auto min-h-10 whitespace-normal text-center" disabled={!globalOwnerComplete||confirming||pendingChanges} onClick={onConfirm}>{confirming?(th?'กำลังยืนยัน…':'Confirming…'):(th?'ยืนยันความพร้อมสำหรับการเงินจริง':'Confirm production readiness')}</Button>{pendingChanges&&<p className="text-sm text-muted-foreground">{th?'บันทึกหรือยกเลิกการแก้ไขก่อนยืนยัน':'Save or cancel your edits before confirming.'}</p>}</>}
      {approved&&steps.length>0&&<p className="text-sm text-muted-foreground">{th?'ข้อมูลบริษัทได้รับการยืนยันแล้ว แต่การดำเนินการบางอย่างยังรอรายการข้างต้น แต่ละไซต์งานจะตรวจสอบความพร้อมแยกกัน':'Company information is confirmed. Some actions still await the requirements above. Each site is checked separately.'}</p>}
    </CardContent>
  </Card>;
}
