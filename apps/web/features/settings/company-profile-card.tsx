"use client";

import * as React from 'react';
import {Edit2, Loader2, Save} from 'lucide-react';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '../../components/ui/card';
import {Label} from '../../components/ui/label';
import {Input} from '../../components/ui/input';
import {Textarea} from '../../components/ui/textarea';
import {Badge} from '../../components/ui/badge';
import {Button} from '../../components/ui/button';
import {CompanyLogoField} from './company-logo-field';

export interface CompanyProfile {
  id?: string;
  companyName: string;
  taxId: string;
  branch: string;
  address: string;
  phone: string;
  email: string;
  logoUrl?: string;
}

export function CompanyProfileCard({company, locale, editingCompany, canEdit, disabled, savingCompany, setCompany, onEdit, onCancel, onSave}: {
  company: CompanyProfile;
  locale: 'th'|'en';
  editingCompany: boolean;
  canEdit: boolean;
  disabled: boolean;
  savingCompany: boolean;
  setCompany: React.Dispatch<React.SetStateAction<CompanyProfile>>;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (event: React.FormEvent) => void;
}) {
  return (
    <Card className="panel border-border/80 shadow-xs">
      <CardHeader className="p-0 pb-2 flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <span>{locale === "th" ? "ข้อมูลบริษัท / นิติบุคคล" : "Company Billing Profile"}</span>
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">
            {locale === "th"
              ? "ใช้ในเอกสารที่ออกจากระบบ เช่น ใบวางบิล ใบเสร็จรับเงิน/ใบกำกับภาษี"
              : "Used on system-generated documents such as billing statements and receipts"}
          </CardDescription>
        </div>
        {!editingCompany && canEdit && <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onEdit} className="h-10 shrink-0 gap-1.5 text-xs"><Edit2 className="size-3.5" /><span>{locale === "th" ? "แก้ไข" : "Edit"}</span></Button>}
      </CardHeader>
      <CardContent className="p-0 pt-4">
        {!editingCompany && (
          <div className="mb-4">
            <CompanyLogoField
              id="company-logo-view"
              purpose="logo"
              value={company.logoUrl ?? ''}
              locale={locale}
              readOnly={true}
              canEdit={canEdit}
            />
          </div>
        )}
        {!editingCompany ? <div className="space-y-4"><dl className="grid grid-cols-1 gap-4 md:grid-cols-2">{([
            ['companyName', 'ชื่อบริษัท / นิติบุคคล', 'Company name'], ['taxId', 'เลขประจำตัวผู้เสียภาษี', 'Tax ID'], ['branch', 'สาขา', 'Branch'], ['phone', 'เบอร์โทรศัพท์', 'Phone'], ['email', 'อีเมลสำหรับการเงิน', 'Billing email'], ['address', 'ที่อยู่จดทะเบียนภาษี', 'Tax address']
          ] as const).map(([key, th, en]) => <div key={key} className={key === "address" ? "space-y-1 md:col-span-2" : "space-y-1"}><dt className="text-sm text-muted-foreground">{locale === 'th' ? th : en}</dt><dd className="text-sm font-medium whitespace-pre-wrap break-words">{company[key] || '—'}</dd></div>)}</dl></div> : <form onSubmit={onSave} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <CompanyLogoField id="company-logoUrl" purpose="logo" value={company.logoUrl ?? ''} locale={locale} disabled={savingCompany} onChange={value => setCompany(current => ({...current,logoUrl:value}))}/>
            <div className="space-y-2">
              <Label htmlFor="company-companyName" className="text-xs font-medium text-foreground">
                {locale === "th" ? "ชื่อบริษัท / นิติบุคคล *" : "Company Name *"}
              </Label>
              <Input id="company-companyName"
                value={company.companyName}
                onChange={(e) => setCompany({ ...company, companyName: e.target.value })}
                required
                className="h-10 text-xs"
                placeholder={locale === "th" ? "เช่น บริษัท โซลาร์ รูฟท็อป เอนเนอร์ยี่ จำกัด" : "e.g. Solar Rooftop Energy Co., Ltd."}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company-taxId" className="text-xs font-medium text-foreground">
                {locale === "th" ? "เลขประจำตัวผู้เสียภาษี 13 หลัก *" : "Tax ID (13 Digits) *"}
              </Label>
              <Input id="company-taxId"
                value={company.taxId}
                onChange={(e) => setCompany({ ...company, taxId: e.target.value })}
                required
                maxLength={13}
                className="h-10 text-xs font-mono"
                placeholder="0105562089412"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company-branch" className="text-xs font-medium text-foreground">
                {locale === "th" ? "สาขา" : "Branch"}
              </Label>
              <Input id="company-branch"
                value={company.branch}
                onChange={(e) => setCompany({ ...company, branch: e.target.value })}
                className="h-10 text-xs"
                placeholder={locale === "th" ? "สำนักงานใหญ่ (00000)" : "Head office (00000)"}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company-phone" className="text-xs font-medium text-foreground">
                {locale === "th" ? "เบอร์โทรศัพท์ติดต่อ" : "Phone Number"}
              </Label>
              <Input id="company-phone"
                value={company.phone}
                onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                className="h-10 text-xs"
                placeholder="02-555-9000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company-email" className="text-xs font-medium text-foreground">
                {locale === "th" ? "อีเมลสำหรับการเงินและใบวางบิล *" : "Billing Email *"}
              </Label>
              <Input id="company-email"
                type="email"
                value={company.email}
                onChange={(e) => setCompany({ ...company, email: e.target.value })}
                required
                className="h-10 text-xs"
                placeholder="billing@solarrooftop.co.th"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="company-address" className="text-xs font-medium text-foreground">
                {locale === "th" ? "ที่อยู่จดทะเบียนภาษี *" : "Tax Address *"}
              </Label>
              <Textarea id="company-address"
                value={company.address}
                onChange={(e) => setCompany({ ...company, address: e.target.value })}
                required
                className="text-xs min-h-[60px]"
                placeholder={locale === "th" ? "88 อาคารโซลาร์ทาวเวอร์ ชั้น 18 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110" : "88 Solar Tower, 18th floor, Sukhumvit Road, Bangkok 10110"}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" disabled={savingCompany} onClick={onCancel}>{locale === "th" ? "ยกเลิก" : "Cancel"}</Button>
            <Button
              type="submit"
              disabled={savingCompany}
              className="h-10 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
            >
              {savingCompany ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              <span>{locale === "th" ? "บันทึกข้อมูลบริษัท" : "Save Company Profile"}</span>
            </Button>
          </div>
        </form>}
      </CardContent>
    </Card>
  );
}
