'use client';

import * as React from 'react';
import Link from 'next/link';
import type {FinancialReadinessItem, FinancialReadinessStatus} from '@solar/api-contracts';
import {Button} from '../../components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '../../components/ui/card';
import {formatAppDateTime} from '../../lib/date-format';

const labels: Record<string, readonly [string,string]> = {
  'company.logo':['โลโก้บริษัท','Company logo'],
  'company.name':['ชื่อบริษัท','Company name'],
  'company.tax_id':['เลขประจำตัวผู้เสียภาษี','Tax ID'],
  'company.branch':['สาขา','Branch'],
  'company.address':['ที่อยู่บริษัท','Company address'],
  'company.phone':['โทรศัพท์บริษัท','Company phone'],
  'company.email':['อีเมลบริษัท','Company email'],
  'company.signatory':['ชื่อและตำแหน่งผู้ลงนาม','Signatory name and title'],
  'company.signature':['ภาพลายเซ็น','Signatory image'],
  'company.default_bank':['บัญชีธนาคารหลัก','Default bank account'],
  'approval.confirmation':['การยืนยันโดยเจ้าของ','Owner confirmation'],
  'environment.financial_writes':['เปิดใช้งานธุรกรรมการเงิน','Financial writes activation'],
  'environment.smtp':['การส่งเอกสารทางอีเมล','Email delivery'],
  'environment.scheduler':['การวางบิลอัตโนมัติ','Automatic billing'],
  'site.customer':['ข้อมูลลูกค้าสำหรับเอกสาร','Customer document information'],
  'site.service':['วันเริ่มบริการและกำหนดชำระ','Service start and payment terms'],
  'site.tax':['การยืนยันภาษี','Confirmed tax settings'],
  'site.recipient':['ผู้รับเอกสารที่ยืนยันแล้ว','Verified document recipients'],
  'site.rate':['อัตราค่าไฟ','Tariffs'],
  'site.meter':['มิเตอร์สำหรับวางบิล','Billing meter'],
  'site.binding':['การเชื่อมข้อมูลมิเตอร์','Meter data binding'],
  'site.boundary_readings':['ค่ามิเตอร์ ณ ขอบเขตรอบบิล','Billing boundary readings'],
};
const anchors: Record<string,string> = {
  'company.logo':'company-logoUrl','company.name':'company-companyName','company.tax_id':'company-taxId',
  'company.branch':'company-branch','company.address':'company-address','company.phone':'company-phone',
  'company.email':'company-email','company.signatory':'company-signatoryName','company.signature':'company-signatureDataUri',
  'company.default_bank':'company-bank-accounts',
};

export function FinanceReadinessCard({status, locale, isOwner, confirming, onConfirm, onEditCompany, pendingChanges = false}: {
  status: FinancialReadinessStatus; locale: 'th'|'en'; isOwner: boolean; confirming: boolean; onConfirm: () => void;
  onEditCompany?: (() => void)|undefined;
  pendingChanges?: boolean;
}) {
  const th = locale === 'th';
  const incomplete = status.items.filter(item => !item.ready);
  const ownerItems = status.items.filter(item => item.responsibility === 'owner');
  const completedOwnerItems = ownerItems.filter(item => item.ready).length;
  const globalOwnerComplete = status.items.some(item => item.id.startsWith('company.')) && status.items.some(item => item.id === 'approval.confirmation') &&
    !status.items.some(item => item.responsibility === 'owner' && !item.siteId && item.id !== 'approval.confirmation' && !item.ready);
  const canConfirm = isOwner && globalOwnerComplete;
  const approved = status.scope === 'PRODUCTION' && !!status.approval && status.items.some(item => item.id === 'approval.confirmation' && item.ready);
  const ready = approved && incomplete.length === 0;
  const title = ready ? (th ? 'พร้อมใช้งานการเงินจริง' : 'Ready for production') : approved ? (th ? 'ยืนยันข้อมูลสำหรับการเงินจริงแล้ว' : 'Production configuration confirmed') : globalOwnerComplete ? (th ? 'รอการยืนยันจากเจ้าของ' : 'Awaiting Owner confirmation') : (th ? 'ความพร้อมสำหรับการเงินจริง' : 'Production finance readiness');
  const itemLabel = (item: FinancialReadinessItem) => (labels[item.id]?.[th ? 0 : 1] ?? (th ? 'รายการที่ต้องตรวจสอบ' : 'Readiness requirement')) + (item.siteId ? ` (${item.siteId})` : '');
  const destination = (item: FinancialReadinessItem) => item.siteId && item.destination === `/sites/${item.siteId}/settings`
    ? `/records/sites/${encodeURIComponent(item.siteId)}`
    : `${item.destination}${!item.siteId && anchors[item.id] ? `#${anchors[item.id]}` : ''}`;
  return <Card className="panel border-border/80 shadow-xs" aria-label={th ? 'ความพร้อมสำหรับการเงินจริง' : 'Production finance readiness'}>
    <CardHeader className="p-0 pb-3">
      <CardTitle className="text-sm">{title}</CardTitle>
      <p className="text-sm font-medium" role="status">{th ? `รายการของเจ้าของ: ครบแล้ว ${completedOwnerItems} จาก ${ownerItems.length} รายการ` : `Owner checklist: ${completedOwnerItems} of ${ownerItems.length} complete`}</p>
      <CardDescription>{th ? 'ตรวจสอบข้อมูลบริษัทก่อนยืนยัน การเปลี่ยนข้อมูลบริษัทหรือบัญชีธนาคารจะต้องยืนยันใหม่' : 'Review company information before confirming. Changes to company information or bank accounts require confirmation again.'}</CardDescription>
      {approved && status.approval && <dl className="space-y-1 text-sm">
        <div className="flex flex-wrap gap-x-2"><dt className="text-muted-foreground">{th ? 'ยืนยันโดย' : 'Confirmed by'}</dt><dd className="break-all">{status.approval.approvedBy}</dd></div>
        <div className="flex flex-wrap gap-x-2"><dt className="text-muted-foreground">{th ? 'ยืนยันเมื่อ' : 'Confirmed at'}</dt><dd><time dateTime={status.approval.approvedAt}>{formatAppDateTime(status.approval.approvedAt, locale)}</time></dd></div>
      </dl>}
      {status.scope === 'TEST' && <p className="text-sm font-semibold">{th ? 'TEST — โหมดทดสอบ ยังไม่ใช่การยืนยันสำหรับใช้งานจริง' : 'TEST — Test mode does not confirm production readiness.'}</p>}
    </CardHeader>
    <CardContent className="p-0 space-y-4">
      <ul className="space-y-2 text-sm">
        {status.items.map(item => <li key={`${item.id}:${item.siteId ?? ''}`} className="flex flex-wrap items-start justify-between gap-2">
          <span>{itemLabel(item)} — <span className={item.ready ? 'text-muted-foreground' : 'font-medium'}>{item.ready ? (th ? 'ครบแล้ว' : 'Complete') : (th ? 'รอดำเนินการ' : 'Pending')}</span></span>
          {!item.ready && item.id !== 'approval.confirmation' && (item.responsibility === 'owner' && item.destination && isOwner ? <Link
            className="text-primary underline underline-offset-4"
            href={destination(item)}
            onClick={() => { if (!item.siteId && item.id !== 'company.default_bank') onEditCompany?.(); }}
          >{th ? 'ตั้งค่า' : 'Set up'}</Link> : <span className="text-muted-foreground">{item.responsibility === 'technical' ? (th ? 'ให้ทีมเทคนิคตรวจสอบ' : 'Ask the technical team') : item.responsibility === 'environment' ? (th ? 'ให้ผู้ดูแลระบบที่ติดตั้งตรวจสอบ' : 'Ask the deployment administrator') : (th ? 'ให้เจ้าของตรวจสอบ' : 'Ask the Owner')}</span>)}
        </li>)}
      </ul>
      {!approved && isOwner && <><Button type="button" disabled={!canConfirm || confirming || pendingChanges} onClick={onConfirm}>{confirming ? (th ? 'กำลังยืนยัน…' : 'Confirming…') : (th ? 'ยืนยันความพร้อมสำหรับการเงินจริง' : 'Confirm production readiness')}</Button>{pendingChanges && <p className="text-sm text-muted-foreground">{th ? 'บันทึกหรือยกเลิกการแก้ไขก่อนยืนยัน' : 'Save or cancel your edits before confirming.'}</p>}</>}
      {approved && incomplete.length > 0 && <p className="text-sm text-muted-foreground">{th ? 'ข้อมูลบริษัทได้รับการยืนยันแล้ว แต่การดำเนินการบางอย่างยังรอรายการข้างต้น แต่ละไซต์งานจะตรวจสอบความพร้อมแยกกัน' : 'Company information is confirmed. Some actions still await the requirements above. Each site is checked separately.'}</p>}
    </CardContent>
  </Card>;
}
