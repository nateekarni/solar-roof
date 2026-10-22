'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, FileText, Receipt, Settings2 } from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import { useLocale } from '../../providers/locale-provider';
import { notify } from '../../components/feedback/notifications';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { FieldError } from '../../components/ui/field';
import { ChoiceSelect } from '../../components/ui/choice-select';
import { DatePicker } from '../../components/ui/date-picker';
import { OrganizationIdentityFields } from '../organization/organization-edit-dialog';
import type { BillingSettingsData } from './site-billing-display-card';
import type { OrganizationDraft, OrganizationRecord } from '../organization/organization-selection';

interface SiteData {
  id: string;
  name: string;
  externalSiteId?: string | null;
  capacityMwp: number;
  latitude?: number | null;
  longitude?: number | null;
  customerId: string;
}

const emptyCustomer = (): OrganizationDraft => ({
  name: '',
  code: '',
  legalName: '',
  taxId: '',
  taxBranch: '',
  taxAddress: '',
  contactName: '',
  phone: '',
  documentEmail: '',
});

function useSafeRouter() {
  try {
    return useRouter();
  } catch {
    return null;
  }
}

export function SiteManageModal({
  open,
  onOpenChange,
  siteId,
  onSaved,
  inline = false,
  initialTab = 'site',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  onSaved?: () => void;
  inline?: boolean;
  initialTab?: 'site' | 'customer' | 'billing';
}) {
  const locale = useLocale();
  const th = locale === 'th';
  const router = useSafeRouter();

  const [activeTab, setActiveTab] = useState<'site' | 'customer' | 'billing'>(initialTab);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showSiteErrors, setShowSiteErrors] = useState(false);
  const [showCustomerErrors, setShowCustomerErrors] = useState(false);
  const [showBillingErrors, setShowBillingErrors] = useState(false);

  // Site state
  const [siteName, setSiteName] = useState('');
  const [siteCode, setSiteCode] = useState('');
  const [capacity, setCapacity] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');

  // Customer state
  const [customer, setCustomer] = useState<OrganizationDraft>(emptyCustomer());
  const [originalCustomer, setOriginalCustomer] = useState<OrganizationRecord | null>(null);

  // Billing state
  const [serviceStartDate, setServiceStartDate] = useState('');
  const [paymentTermDays, setPaymentTermDays] = useState(30);
  const [taxRate, setTaxRate] = useState('7.00');
  const [pricesIncludeTax, setPricesIncludeTax] = useState(false);
  const [taxConfirmed, setTaxConfirmed] = useState(false);
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [reminderStartDays, setReminderStartDays] = useState(7);
  const [reminderIntervalDays, setReminderIntervalDays] = useState(3);
  const [recipientUserIds, setRecipientUserIds] = useState<string[]>([]);
  const [users, setUsers] = useState<{ id: string; displayName: string; email: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setActiveTab(initialTab ?? 'site');
    setError('');
    setShowSiteErrors(false);
    setShowCustomerErrors(false);
    setShowBillingErrors(false);

    Promise.all([
      apiClient.get<SiteData>(`/v1/sites/${siteId}`),
      apiClient.get<BillingSettingsData & { recipientOptions?: { id: string; displayName: string; email: string }[] }>(
        `/v1/sites/${siteId}/billing-settings`
      ),
      apiClient.get<OrganizationRecord[]>('/v1/customers'),
    ])
      .then(([s, b, customers]) => {
        if (!active) return;
        // Populate Site
        setSiteName(s.name || '');
        setSiteCode(s.externalSiteId || '');
        setCapacity(s.capacityMwp ? String(s.capacityMwp) : '');
        setLatitude(s.latitude !== undefined && s.latitude !== null ? String(s.latitude) : '');
        setLongitude(s.longitude !== undefined && s.longitude !== null ? String(s.longitude) : '');

        // Populate Customer
        const matched = customers.find((c) => c.id === s.customerId);
        if (matched) {
          setOriginalCustomer(matched);
          setCustomer({
            name: matched.name || '',
            code: matched.code || '',
            legalName: matched.legalName || '',
            taxId: matched.taxId || '',
            taxBranch: matched.taxBranch || '',
            taxAddress: matched.taxAddress || '',
            contactName: matched.contactName || '',
            phone: matched.phone || '',
            documentEmail: matched.documentEmail || '',
          });
        }

        // Populate Billing
        setServiceStartDate(b.serviceStartDate || '');
        setPaymentTermDays(b.paymentTermDays ?? 30);
        setTaxRate(b.taxRate || '7.00');
        setPricesIncludeTax(Boolean(b.pricesIncludeTax));
        setTaxConfirmed(Boolean(b.taxConfirmed));
        setRemindersEnabled(Boolean(b.remindersEnabled));
        setReminderStartDays(b.reminderStartDays ?? 7);
        setReminderIntervalDays(b.reminderIntervalDays ?? 3);
        setRecipientUserIds(b.recipientUserIds ?? []);
        setUsers(b.recipientOptions ?? []);
      })
      .catch((e) => {
        if (!active) return;
        setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, siteId, initialTab]);

  const siteNameError = showSiteErrors && !siteName.trim()
    ? (th ? 'กรุณาระบุชื่อไซต์งาน' : 'Please provide site name')
    : null;
  const capacityError = showSiteErrors && (!capacity.trim() || Number(capacity) <= 0)
    ? (th ? 'กรุณาระบุกำลังติดตั้งที่มากกว่า 0' : 'Installed capacity must be greater than 0')
    : null;
  const latError = showSiteErrors && (
    (longitude.trim() && !latitude.trim())
      ? (th ? 'กรุณาระบุละติจูดคู่กับลองจิจูด' : 'Please provide latitude')
      : (latitude.trim() && (isNaN(Number(latitude)) || Number(latitude) < -90 || Number(latitude) > 90))
        ? (th ? 'ละติจูดต้องอยู่ระหว่าง -90 ถึง 90' : 'Latitude must be between -90 and 90')
        : null
  );
  const lngError = showSiteErrors && (
    (latitude.trim() && !longitude.trim())
      ? (th ? 'กรุณาระบุลองจิจูดคู่กับละติจูด' : 'Please provide longitude')
      : (longitude.trim() && (isNaN(Number(longitude)) || Number(longitude) < -180 || Number(longitude) > 180))
        ? (th ? 'ลองจิจูดต้องอยู่ระหว่าง -180 ถึง 180' : 'Longitude must be between -180 and 180')
        : null
  );
  const billingDateError = showBillingErrors && !serviceStartDate.trim()
    ? (th ? 'กรุณาเลือกวันที่เริ่มให้บริการ' : 'Please select service start date')
    : null;

  const validateSite = () => {
    if (!siteName.trim()) {
      setShowSiteErrors(true);
      setError(th ? 'กรุณาระบุชื่อไซต์งาน' : 'Please provide site name');
      return false;
    }
    if (!capacity.trim() || Number(capacity) <= 0) {
      setShowSiteErrors(true);
      setError(th ? 'กรุณาระบุกำลังติดตั้งที่มากกว่า 0' : 'Installed capacity must be greater than 0');
      return false;
    }
    if (latitude.trim() || longitude.trim()) {
      if (!latitude.trim() || !longitude.trim()) {
        setShowSiteErrors(true);
        setError(th ? 'กรุณาระบุทั้งละติจูดและลองจิจูด' : 'Both latitude and longitude must be provided');
        return false;
      }
      const latNum = Number(latitude);
      const lngNum = Number(longitude);
      if (isNaN(latNum) || latNum < -90 || latNum > 90) {
        setShowSiteErrors(true);
        setError(th ? 'ละติจูดต้องอยู่ระหว่าง -90 ถึง 90' : 'Latitude must be between -90 and 90');
        return false;
      }
      if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
        setShowSiteErrors(true);
        setError(th ? 'ลองจิจูดต้องอยู่ระหว่าง -180 ถึง 180' : 'Longitude must be between -180 and 180');
        return false;
      }
    }
    setShowSiteErrors(false);
    setError('');
    return true;
  };

  const validateCustomer = () => {
    if (!customer.name.trim()) {
      setShowCustomerErrors(true);
      setError(th ? 'กรุณาระบุชื่อลูกค้า/องค์กร' : 'Please provide customer name');
      return false;
    }
    if (!customer.code?.trim() || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(customer.code.trim())) {
      setShowCustomerErrors(true);
      setError(th ? 'ระบุรหัสองค์กร 1–64 ตัวอักษร (A–Z, 0–9, _ หรือ -)' : 'Enter a 1–64 character organization code');
      return false;
    }
    if (customer.taxId?.trim() && !/^[0-9]{13}$/.test(customer.taxId.trim())) {
      setShowCustomerErrors(true);
      setError(th ? 'เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก' : 'Tax ID must contain 13 digits');
      return false;
    }
    if (customer.documentEmail?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.documentEmail.trim())) {
      setShowCustomerErrors(true);
      setError(th ? 'รูปแบบอีเมลรับเอกสารไม่ถูกต้อง' : 'Invalid document email address');
      return false;
    }
    setShowCustomerErrors(false);
    setError('');
    return true;
  };

  const saveAll = async () => {
    if (!validateSite()) {
      setActiveTab('site');
      return;
    }
    if (!validateCustomer()) {
      setActiveTab('customer');
      return;
    }
    if (!serviceStartDate.trim()) {
      setShowBillingErrors(true);
      setActiveTab('billing');
      return;
    }

    setBusy(true);
    setError('');
    try {
      // 1. Update site details
      const sitePayload: {
        name: string;
        capacityMwp: number;
        latitude?: number;
        longitude?: number;
      } = {
        name: siteName.trim(),
        capacityMwp: Number(capacity),
      };
      if (latitude.trim() && longitude.trim()) {
        sitePayload.latitude = Number(latitude);
        sitePayload.longitude = Number(longitude);
      }
      await apiClient.patch(`/v1/sites/${siteId}`, sitePayload);

      // 2. Update customer details if customer exists
      if (originalCustomer) {
        await apiClient.patch(`/v1/customers/${originalCustomer.id}`, {
          ...customer,
          name: customer.name.trim(),
          code: customer.code?.trim() || originalCustomer.code,
          impactConfirmed: true,
          expectedUpdatedAt: originalCustomer.updatedAt,
        });
      }

      // 3. Update billing settings
      await apiClient.put(`/v1/sites/${siteId}/billing-settings`, {
        serviceStartDate: serviceStartDate || undefined,
        paymentTermDays: Number(paymentTermDays),
        taxRate: String(taxRate),
        taxConfirmed,
        pricesIncludeTax,
        recipientUserIds,
        remindersEnabled,
        reminderStartDays: Number(reminderStartDays),
        reminderIntervalDays: Number(reminderIntervalDays),
      });

      notify.success(th ? 'บันทึกการแก้ไขไซต์งานสำเร็จ' : 'Site details updated successfully');
      onOpenChange(false);
      if (onSaved) {
        onSaved();
      } else if (router) {
        router.refresh();
      } else if (typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const dialogHeader = (
    <DialogHeader>
      <DialogTitle>{th ? 'จัดการข้อมูลไซต์งาน' : 'Manage site details'}</DialogTitle>
      <DialogDescription>
        {th
          ? 'แก้ไขข้อมูลไซต์งาน ข้อมูลลูกค้า และตั้งค่าบริการเพื่ออัปเดตระบบทันที'
          : 'Edit site, customer, and billing service settings to update the system immediately.'}
      </DialogDescription>
    </DialogHeader>
  );

  const formBody = (
    <form noValidate onSubmit={(e) => e.preventDefault()} className="flex min-h-0 flex-1 flex-col gap-5">
      <div data-slot="dialog-body" className="min-h-0 flex-1 overflow-y-auto p-1 space-y-5">
        <fieldset disabled={busy} className="min-w-0">
          <Tabs
            className="w-full"
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as 'site' | 'customer' | 'billing')}
          >
            <TabsList
              aria-label={th ? 'เลือกแท็บจัดการข้อมูลไซต์งาน' : 'Manage site tabs'}
              className="h-auto w-full flex gap-2 !bg-transparent bg-transparent p-0 border-0 shadow-none mb-5"
            >
              <TabsTrigger
                value="site"
                className="flex-1 justify-center px-3.5 py-2 rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-neutral-950 data-[state=active]:font-bold data-active:border-primary data-active:bg-primary data-active:text-neutral-950 data-active:font-bold transition-colors shadow-none cursor-pointer flex items-center gap-2"
              >
                <Building2 className="size-4" />
                <span>{th ? 'ข้อมูลไซต์งาน' : 'Site Info'}</span>
              </TabsTrigger>
              <TabsTrigger
                value="customer"
                className="flex-1 justify-center px-3.5 py-2 rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-neutral-950 data-[state=active]:font-bold data-active:border-primary data-active:bg-primary data-active:text-neutral-950 data-active:font-bold transition-colors shadow-none cursor-pointer flex items-center gap-2"
              >
                <FileText className="size-4" />
                <span>{th ? 'ข้อมูลลูกค้า' : 'Customer Info'}</span>
              </TabsTrigger>
              <TabsTrigger
                value="billing"
                className="flex-1 justify-center px-3.5 py-2 rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-neutral-950 data-[state=active]:font-bold data-active:border-primary data-active:bg-primary data-active:text-neutral-950 data-active:font-bold transition-colors shadow-none cursor-pointer flex items-center gap-2"
              >
                <Receipt className="size-4" />
                <span>{th ? 'ตั้งค่าบริการ' : 'Service & Billing'}</span>
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: ข้อมูลไซต์งาน */}
            <TabsContent value="site" className="space-y-4">
              <fieldset disabled={busy} className="space-y-4">
                <div data-slot="field" className="flex flex-col gap-1 [&_input]:mt-0">
                  <Label htmlFor="manage-site-name" className="leading-snug" required>
                    {th ? 'ชื่อไซต์งาน' : 'Site name'}
                  </Label>
                  <Input
                    id="manage-site-name"
                    placeholder={th ? 'เช่น อาคารสำนักงาน A' : 'e.g. Office building A'}
                    required
                    minLength={2}
                    value={siteName}
                    aria-invalid={Boolean(siteNameError)}
                    onChange={(e) => setSiteName(e.target.value)}
                  />
                  {siteNameError ? <FieldError>{siteNameError}</FieldError> : null}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div data-slot="field" className="flex flex-col gap-1 [&_input]:mt-0">
                    <Label htmlFor="manage-site-code" className="leading-snug">{th ? 'รหัสไซต์งาน' : 'Site code'}</Label>
                    <Input
                      id="manage-site-code"
                      value={siteCode}
                      disabled
                      placeholder={th ? 'เช่น SITE-001' : 'e.g. SITE-001'}
                    />
                  </div>
                  <div data-slot="field" className="flex flex-col gap-1 [&_input]:mt-0">
                    <Label htmlFor="manage-site-capacity" className="leading-snug" required>
                      {th ? 'กำลังติดตั้ง (MWp)' : 'Installed capacity (MWp)'}
                    </Label>
                    <Input
                      id="manage-site-capacity"
                      placeholder={th ? 'เช่น 0.25' : 'e.g. 0.25'}
                      type="number"
                      required
                      min="0.0001"
                      step="0.0001"
                      value={capacity}
                      aria-invalid={Boolean(capacityError)}
                      onChange={(e) => setCapacity(e.target.value)}
                    />
                    {capacityError ? <FieldError>{capacityError}</FieldError> : null}
                  </div>
                  <div data-slot="field" className="flex flex-col gap-1 [&_input]:mt-0">
                    <Label htmlFor="manage-site-lat" className="leading-snug">{th ? 'ละติจูด' : 'Latitude'}</Label>
                    <Input
                      id="manage-site-lat"
                      placeholder={th ? 'เช่น 13.7563' : 'e.g. 13.7563'}
                      type="number"
                      min="-90"
                      max="90"
                      step="any"
                      required={Boolean(longitude.trim())}
                      value={latitude}
                      aria-invalid={Boolean(latError)}
                      onChange={(e) => setLatitude(e.target.value)}
                    />
                    {latError ? <FieldError>{latError}</FieldError> : null}
                  </div>
                  <div data-slot="field" className="flex flex-col gap-1 [&_input]:mt-0">
                    <Label htmlFor="manage-site-lng" className="leading-snug">{th ? 'ลองจิจูด' : 'Longitude'}</Label>
                    <Input
                      id="manage-site-lng"
                      placeholder={th ? 'เช่น 100.5018' : 'e.g. 100.5018'}
                      type="number"
                      min="-180"
                      max="180"
                      step="any"
                      required={Boolean(latitude.trim())}
                      value={longitude}
                      aria-invalid={Boolean(lngError)}
                      onChange={(e) => setLongitude(e.target.value)}
                    />
                    {lngError ? <FieldError>{lngError}</FieldError> : null}
                  </div>
                </div>
              </fieldset>
            </TabsContent>

            {/* Tab 2: ข้อมูลลูกค้า */}
            <TabsContent value="customer" className="space-y-4">
              <fieldset disabled={busy} className="space-y-4">
                <OrganizationIdentityFields
                  value={customer}
                  onChange={setCustomer}
                  locale={locale}
                  allowBlankCode={false}
                  disabled={busy}
                  showErrors={showCustomerErrors}
                />
              </fieldset>
            </TabsContent>

            {/* Tab 3: การตั้งค่าไซต์งานและการเรียกเก็บเงิน */}
            <TabsContent value="billing" className="space-y-4">
              <fieldset disabled={busy} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div data-slot="field" className="flex flex-col gap-1 [&_input]:mt-0">
                    <Label htmlFor="manage-bill-start" className="leading-snug" required>
                      {th ? 'วันที่เริ่มให้บริการ' : 'Service start date'}
                    </Label>
                    <DatePicker
                      id="manage-bill-start"
                      required
                      value={serviceStartDate}
                      aria-invalid={Boolean(billingDateError)}
                      onValueChange={(val) => setServiceStartDate(val)}
                      disabled={busy}
                    />
                    {billingDateError ? <FieldError>{billingDateError}</FieldError> : null}
                  </div>
                  <div data-slot="field" className="flex flex-col gap-1 [&_input]:mt-0">
                    <Label htmlFor="manage-bill-term" className="leading-snug">
                      {th ? 'ระยะเวลาชำระเงิน (วัน)' : 'Payment term (days)'}
                    </Label>
                    <Input
                      id="manage-bill-term"
                      type="number"
                      min="0"
                      step="1"
                      placeholder={th ? 'เช่น 30' : 'e.g. 30'}
                      value={paymentTermDays}
                      onChange={(e) => setPaymentTermDays(Number(e.target.value))}
                    />
                  </div>
                  <div data-slot="field" className="flex flex-col gap-1 [&_input]:mt-0">
                    <Label htmlFor="manage-bill-tax" className="leading-snug">
                      {th ? 'อัตราภาษี (%)' : 'Tax rate (%)'}
                    </Label>
                    <Input
                      id="manage-bill-tax"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={th ? 'เช่น 7.00' : 'e.g. 7.00'}
                      value={taxRate}
                      onChange={(e) => setTaxRate(e.target.value)}
                    />
                  </div>
                  <div data-slot="field" className="flex flex-col gap-1">
                    <Label htmlFor="manage-bill-price-mode" className="leading-snug">{th ? 'รูปแบบราคา' : 'Price mode'}</Label>
                    <ChoiceSelect
                      id="manage-bill-price-mode"
                      value={pricesIncludeTax ? 'included' : 'excluded'}
                      onChange={(e) => setPricesIncludeTax(e.target.value === 'included')}
                    >
                      <option value="excluded">{th ? 'ยังไม่รวมภาษี' : 'Tax excluded'}</option>
                      <option value="included">{th ? 'รวมภาษี' : 'Tax included'}</option>
                    </ChoiceSelect>
                  </div>
                  <div data-slot="field" className="flex flex-col gap-1">
                    <Label htmlFor="manage-bill-tax-confirm" className="leading-snug">
                      {th ? 'ยืนยันการตั้งค่าภาษี' : 'Tax confirmation'}
                    </Label>
                    <ChoiceSelect
                      id="manage-bill-tax-confirm"
                      value={taxConfirmed ? 'yes' : 'no'}
                      onChange={(e) => setTaxConfirmed(e.target.value === 'yes')}
                    >
                      <option value="no">{th ? 'ยังไม่ยืนยัน' : 'Not confirmed'}</option>
                      <option value="yes">{th ? 'ผู้รับผิดชอบบัญชียืนยันแล้ว' : 'Confirmed by accounting'}</option>
                    </ChoiceSelect>
                  </div>
                  <div data-slot="field" className="flex flex-col gap-1">
                    <Label htmlFor="manage-bill-reminders" className="leading-snug">{th ? 'การทวงชำระเงิน' : 'Payment reminders'}</Label>
                    <ChoiceSelect
                      id="manage-bill-reminders"
                      value={remindersEnabled ? 'yes' : 'no'}
                      onChange={(e) => setRemindersEnabled(e.target.value === 'yes')}
                    >
                      <option value="no">{th ? 'ปิด' : 'Off'}</option>
                      <option value="yes">{th ? 'เปิด' : 'On'}</option>
                    </ChoiceSelect>
                  </div>
                  {remindersEnabled ? (
                    <>
                      <div data-slot="field" className="flex flex-col gap-1 [&_input]:mt-0">
                        <Label htmlFor="manage-bill-reminder-start" className="leading-snug">
                          {th ? 'เริ่มทวงหลังครบกำหนด (วัน)' : 'Reminder start (days)'}
                        </Label>
                        <Input
                          id="manage-bill-reminder-start"
                          type="number"
                          min="0"
                          step="1"
                          placeholder={th ? 'เช่น 7' : 'e.g. 7'}
                          value={reminderStartDays}
                          onChange={(e) => setReminderStartDays(Number(e.target.value))}
                        />
                      </div>
                      <div data-slot="field" className="flex flex-col gap-1 [&_input]:mt-0">
                        <Label htmlFor="manage-bill-reminder-interval" className="leading-snug">
                          {th ? 'ทวงซ้ำทุก (วัน)' : 'Reminder interval (days)'}
                        </Label>
                        <Input
                          id="manage-bill-reminder-interval"
                          type="number"
                          min="1"
                          step="1"
                          placeholder={th ? 'เช่น 3' : 'e.g. 3'}
                          value={reminderIntervalDays}
                          onChange={(e) => setReminderIntervalDays(Number(e.target.value))}
                        />
                      </div>
                    </>
                  ) : null}
                  <div data-slot="field" className="sm:col-span-2 flex flex-col gap-1">
                    <Label className="leading-snug">{th ? 'ผู้รับเอกสาร' : 'Document recipients'}</Label>
                    <div className="flex flex-wrap gap-2">
                      {users.length === 0 ? (
                        <span className="text-sm text-muted-foreground">
                          {th ? 'ไม่มีรายชื่อผู้ใช้งานให้เลือก' : 'No users available for selection'}
                        </span>
                      ) : (
                        users.map((u) => {
                          const selected = recipientUserIds.includes(u.id);
                          return (
                            <Button
                              key={u.id}
                              type="button"
                              variant={selected ? 'default' : 'outline'}
                              aria-pressed={selected}
                              onClick={() => {
                                setRecipientUserIds(
                                  selected
                                    ? recipientUserIds.filter((id) => id !== u.id)
                                    : [...recipientUserIds, u.id]
                                );
                              }}
                            >
                              {u.displayName} · {u.email}
                            </Button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </fieldset>
            </TabsContent>
          </Tabs>
        </fieldset>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      {/* Stepper Footer Buttons */}
      <DialogFooter className="flex flex-row justify-between sm:justify-between items-center gap-2">
        <div>
          {activeTab === 'site' ? (
            <Button
              key="manage-cancel"
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              {th ? 'ยกเลิก' : 'Cancel'}
            </Button>
          ) : (
            <Button
              key="manage-back"
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setError('');
                setActiveTab(activeTab === 'billing' ? 'customer' : 'site');
              }}
            >
              {th ? 'ย้อนกลับ' : 'Back'}
            </Button>
          )}
        </div>

        <div className="flex gap-2">
          {activeTab === 'site' ? (
            <Button
              key="manage-next-site"
              type="button"
              disabled={busy}
              onClick={() => {
                if (validateSite()) {
                  setActiveTab('customer');
                }
              }}
            >
              {th ? 'ถัดไป' : 'Next'}
            </Button>
          ) : activeTab === 'customer' ? (
            <Button
              key="manage-next-customer"
              type="button"
              disabled={busy}
              onClick={() => {
                if (validateCustomer()) {
                  setActiveTab('billing');
                }
              }}
            >
              {th ? 'ถัดไป' : 'Next'}
            </Button>
          ) : (
            <Button key="manage-save" type="button" disabled={busy} onClick={() => void saveAll()}>
              {busy ? (th ? 'กำลังบันทึก…' : 'Saving…') : th ? 'บันทึกข้อมูล' : 'Save details'}
            </Button>
          )}
        </div>
      </DialogFooter>
    </form>
  );

  if (inline) {
    return (
      <Dialog open={true}>
        <section className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
          {dialogHeader}
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {th ? 'กำลังโหลดข้อมูล…' : 'Loading details…'}
            </div>
          ) : (
            formBody
          )}
        </section>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent
        className="max-h-[90svh] sm:max-w-3xl"
        showCloseButton={!busy}
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        {dialogHeader}
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {th ? 'กำลังโหลดข้อมูล…' : 'Loading details…'}
          </div>
        ) : (
          formBody
        )}
      </DialogContent>
    </Dialog>
  );
}

export function SiteManageHeaderButton({ siteId }: { siteId: string }) {
  const [open, setOpen] = useState(false);
  const th = useLocale() === 'th';
  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5"
      >
        <Settings2 className="size-4" />
        {th ? 'จัดการข้อมูล' : 'Manage details'}
      </Button>
      <SiteManageModal open={open} onOpenChange={setOpen} siteId={siteId} />
    </>
  );
}

