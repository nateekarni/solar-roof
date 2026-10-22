'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { Building2, FileText, Receipt } from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import { useLocale } from '../../providers/locale-provider';
import { notify } from '../../components/feedback/notifications';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { FieldError } from '../../components/ui/field';
import { ChoiceSelect } from '../../components/ui/choice-select';
import { DatePicker } from '../../components/ui/date-picker';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { OrganizationIdentityFields, getOrganizationFieldError } from '../organization/organization-edit-dialog';
import type { OrganizationDraft } from '../organization/organization-selection';
import { siteServicePayload } from './site-service-payload';

type BillingSettings = {
  serviceStartDate: string;
  paymentTermDays: number;
  taxRate: string;
  taxConfirmed: boolean;
  pricesIncludeTax: boolean;
  recipientUserIds: string[];
  remindersEnabled?: boolean;
  reminderStartDays?: number;
  reminderIntervalDays?: number;
};

export function SiteBillingSettings({ siteId }: { siteId: string }) {
  const th = useLocale() === 'th';
  const [settings, setSettings] = useState<BillingSettings | null>(null);
  const [users, setUsers] = useState<{ id: string; displayName: string; email: string }[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    setSettings(null);
    apiClient
      .get<BillingSettings & { recipientOptions?: { id: string; displayName: string; email: string }[] }>(
        `/v1/sites/${siteId}/billing-settings`
      )
      .then((data) => {
        if (active) {
          setSettings(data);
          setUsers(data.recipientOptions ?? []);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [siteId]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.put(`/v1/sites/${siteId}/billing-settings`, settings);
      setMessage(th ? 'บันทึกการตั้งค่าแล้ว' : 'Settings saved');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{th ? 'การเรียกเก็บเงินของไซต์งาน' : 'Site billing settings'}</CardTitle>
      </CardHeader>
      <CardContent>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {!settings ? (
          <p>{th ? 'กำลังโหลดการตั้งค่า…' : 'Loading settings…'}</p>
        ) : (
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            {(
              [
                { key: 'serviceStartDate', label: th ? 'วันที่เริ่มบริการ' : 'Service start', type: 'date' },
                { key: 'paymentTermDays', label: th ? 'ระยะเวลาชำระ (วัน)' : 'Payment term (days)', type: 'number' },
                { key: 'taxRate', label: th ? 'อัตราภาษี (%)' : 'Tax rate (%)', type: 'number' },
                { key: 'reminderStartDays', label: th ? 'เริ่มทวงหลังครบกำหนด (วัน)' : 'Reminder start (days)', type: 'number' },
                { key: 'reminderIntervalDays', label: th ? 'ทวงทุก (วัน)' : 'Reminder interval (days)', type: 'number' },
              ] as const
            ).map((field) => (
              <div key={field.key} data-slot="field" className="flex flex-col gap-1 [&_input]:mt-0">
                <Label htmlFor={`billing-${field.key}`} className="leading-snug">{field.label}</Label>
                <Input
                  id={`billing-${field.key}`}
                  type={field.type}
                  required={!field.key.startsWith('reminder') || !!settings.remindersEnabled}
                  min={field.key === 'reminderIntervalDays' ? '1' : '0'}
                  step={field.key === 'taxRate' ? '0.01' : '1'}
                  value={settings[field.key] ?? ''}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      [field.key]: field.type === 'date' || field.key === 'taxRate' ? e.target.value : Number(e.target.value),
                    })
                  }
                />
              </div>
            ))}
            <div data-slot="field" className="flex flex-col gap-1">
              <Label className="leading-snug">{th ? 'รูปแบบราคา' : 'Price mode'}</Label>
              <ChoiceSelect
                value={settings.pricesIncludeTax ? 'included' : 'excluded'}
                onChange={(e) => setSettings({ ...settings, pricesIncludeTax: e.target.value === 'included' })}
              >
                <option value="excluded">{th ? 'ยังไม่รวมภาษี' : 'Tax excluded'}</option>
                <option value="included">{th ? 'รวมภาษี' : 'Tax included'}</option>
              </ChoiceSelect>
            </div>
            <div data-slot="field" className="sm:col-span-2 flex flex-col gap-1">
              <Label className="leading-snug">{th ? 'ผู้รับเอกสาร' : 'Document recipients'}</Label>
              <div className="flex flex-wrap gap-2">
                {users.map((user) => (
                  <Button
                    key={user.id}
                    type="button"
                    variant={settings.recipientUserIds?.includes(user.id) ? 'default' : 'outline'}
                    aria-pressed={settings.recipientUserIds?.includes(user.id)}
                    onClick={() =>
                      setSettings({
                        ...settings,
                        recipientUserIds: settings.recipientUserIds?.includes(user.id)
                          ? settings.recipientUserIds.filter((id) => id !== user.id)
                          : [...(settings.recipientUserIds ?? []), user.id],
                      })
                    }
                  >
                    {user.displayName} · {user.email}
                  </Button>
                ))}
              </div>
            </div>
            <div data-slot="field" className="flex flex-col gap-1">
              <Label className="leading-snug">{th ? 'ยืนยันการตั้งค่าภาษี' : 'Tax confirmation'}</Label>
              <ChoiceSelect
                value={settings.taxConfirmed ? 'yes' : 'no'}
                onChange={(e) => setSettings({ ...settings, taxConfirmed: e.target.value === 'yes' })}
              >
                <option value="no">{th ? 'ยังไม่ยืนยัน' : 'Not confirmed'}</option>
                <option value="yes">{th ? 'ผู้รับผิดชอบบัญชียืนยันแล้ว' : 'Confirmed by accounting'}</option>
              </ChoiceSelect>
            </div>
            <div data-slot="field" className="flex flex-col gap-1">
              <Label className="leading-snug">{th ? 'การทวงชำระ' : 'Payment reminders'}</Label>
              <ChoiceSelect
                value={settings.remindersEnabled ? 'yes' : 'no'}
                onChange={(e) => setSettings({ ...settings, remindersEnabled: e.target.value === 'yes' })}
              >
                <option value="no">{th ? 'ปิด' : 'Off'}</option>
                <option value="yes">{th ? 'เปิด' : 'On'}</option>
              </ChoiceSelect>
            </div>
            {message && <p role="status">{message}</p>}
            <Button type="submit" disabled={busy}>
              {th ? 'บันทึกการตั้งค่า' : 'Save settings'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
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

export function SiteServiceDialog({
  open,
  onOpenChange,
  inline,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inline?: boolean;
}) {
  const locale = useLocale();
  const th = locale === 'th';

  const [activeTab, setActiveTab] = useState<'site' | 'customer' | 'billing'>('site');
  const [customer, setCustomer] = useState<OrganizationDraft>(emptyCustomer());
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('');
  const [code, setCode] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');

  // Billing tab states
  const [serviceStartDate, setServiceStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [ratePerKwh, setRatePerKwh] = useState('4.5000');
  const [paymentTermDays, setPaymentTermDays] = useState(30);
  const [taxRate, setTaxRate] = useState('7.00');
  const [pricesIncludeTax, setPricesIncludeTax] = useState(false);
  const [taxConfirmed, setTaxConfirmed] = useState(false);
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [reminderStartDays, setReminderStartDays] = useState(7);
  const [reminderIntervalDays, setReminderIntervalDays] = useState(7);

  const [showSiteErrors, setShowSiteErrors] = useState(false);
  const [showCustomerErrors, setShowCustomerErrors] = useState(false);
  const [showBillingErrors, setShowBillingErrors] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setActiveTab('site');
      setName('');
      setCustomer(emptyCustomer());
      setCapacity('');
      setCode('');
      setLatitude('');
      setLongitude('');
      setServiceStartDate(new Date().toISOString().slice(0, 10));
      setRatePerKwh('4.5000');
      setPaymentTermDays(30);
      setTaxRate('7.00');
      setPricesIncludeTax(false);
      setTaxConfirmed(false);
      setRemindersEnabled(false);
      setReminderStartDays(7);
      setReminderIntervalDays(7);
      setShowSiteErrors(false);
      setShowCustomerErrors(false);
      setShowBillingErrors(false);
      setError('');
    }
  }, [open]);

  const siteNameError = showSiteErrors && !name.trim()
    ? (th ? 'กรุณาระบุชื่อไซต์งาน' : 'Please enter site name')
    : null;
  const capacityError = showSiteErrors && (!capacity.trim() || Number(capacity) <= 0)
    ? (th ? 'กรุณาระบุกำลังติดตั้งที่มากกว่า 0' : 'Please enter positive capacity')
    : null;
  const latError = showSiteErrors && (
    (longitude.trim() && !latitude.trim())
      ? (th ? 'กรุณาระบุละติจูดคู่กับลองจิจูด' : 'Please enter latitude')
      : (latitude.trim() && (isNaN(Number(latitude)) || Number(latitude) < -90 || Number(latitude) > 90))
        ? (th ? 'ละติจูดต้องอยู่ระหว่าง -90 ถึง 90' : 'Latitude must be between -90 and 90')
        : null
  );
  const lngError = showSiteErrors && (
    (latitude.trim() && !longitude.trim())
      ? (th ? 'กรุณาระบุลองจิจูดคู่กับละติจูด' : 'Please enter longitude')
      : (longitude.trim() && (isNaN(Number(longitude)) || Number(longitude) < -180 || Number(longitude) > 180))
        ? (th ? 'ลองจิจูดต้องอยู่ระหว่าง -180 ถึง 180' : 'Longitude must be between -180 and 180')
        : null
  );
  const billingDateError = showBillingErrors && !serviceStartDate.trim()
    ? (th ? 'กรุณาเลือกวันที่เริ่มให้บริการ' : 'Please select service start date')
    : null;

  const isSiteValid = () => {
    if (!name.trim()) return false;
    if (!capacity.trim() || Number(capacity) <= 0) return false;
    if (latitude.trim() || longitude.trim()) {
      if (!latitude.trim() || !longitude.trim()) return false;
      const latNum = Number(latitude);
      const lngNum = Number(longitude);
      if (isNaN(latNum) || latNum < -90 || latNum > 90) return false;
      if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) return false;
    }
    return true;
  };

  const isCustomerValid = () => {
    return (
      !getOrganizationFieldError('name', customer, locale, true) &&
      !getOrganizationFieldError('code', customer, locale, true) &&
      !getOrganizationFieldError('taxId', customer, locale, true) &&
      !getOrganizationFieldError('documentEmail', customer, locale, true)
    );
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const submitter=(e.nativeEvent as SubmitEvent).submitter as HTMLElement|null;
    if(activeTab!=='billing'||submitter?.dataset.siteServiceSubmit!=='true')return;
    if (!isSiteValid()) {
      setShowSiteErrors(true);
      setActiveTab('site');
      return;
    }
    if (!isCustomerValid()) {
      setShowCustomerErrors(true);
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
      const payload = siteServicePayload(
        { name, capacity: Number(capacity), externalSiteId: code, latitude, longitude },
        customer,
        {
          serviceStartDate,
          ratePerKwh: ratePerKwh ? Number(ratePerKwh) : undefined,
          paymentTermDays,
          taxRate: taxRate ? Number(taxRate) : 7.0,
          pricesIncludeTax,
          taxConfirmed,
          remindersEnabled,
          reminderStartDays,
          reminderIntervalDays,
        }
      );
      await apiClient.post<{ id: string }>('/v1/sites', payload);
      notify.success(th ? 'เพิ่มไซต์งานและเริ่มบริการสำเร็จ' : 'Site created and service activated');
      onOpenChange(false);
      window.location.reload();
    } catch (e) {
      const errMessage = (e as Error).message;
      setError(errMessage);
      if (/customer|ลูกค้า/i.test(errMessage)) {
        setShowCustomerErrors(true);
        setActiveTab('customer');
      } else if (/coordinate|พิกัด|capacity|กำลังติดตั้ง|site name|ชื่อไซต์/i.test(errMessage)) {
        setShowSiteErrors(true);
        setActiveTab('site');
      }
    } finally {
      setBusy(false);
    }
  };

  const dialogHeader = (
    <DialogHeader>
      <DialogTitle>{th ? 'เพิ่มไซต์งาน' : 'Create site'}</DialogTitle>
      <DialogDescription>
        {th
          ? 'กรอกข้อมูลไซต์งาน ข้อมูลลูกค้า และตั้งค่าบริการเพื่อเริ่มใช้งานได้ทันที'
          : 'Enter site info, customer identity, and billing settings to activate service immediately.'}
      </DialogDescription>
    </DialogHeader>
  );

  const formBody = (
    <form noValidate onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-5">
      <DialogBody className="space-y-5">
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as 'site' | 'customer' | 'billing')}
          className="w-full"
        >
          <TabsList
            aria-label={th ? 'เลือกแท็บเพิ่มไซต์งาน' : 'Create site tabs'}
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

          <TabsContent value="site" className="space-y-4">
            <fieldset disabled={busy} className="space-y-4">
              <div data-slot="field" className="flex flex-col gap-1 [&_input]:mt-0">
                <Label htmlFor="service-site-name" className="leading-snug" required>
                  {th ? 'ชื่อไซต์งาน' : 'Site name'}
                </Label>
                <Input
                  id="service-site-name"
                  placeholder={th ? 'เช่น อาคารสำนักงาน A' : 'e.g. Office building A'}
                  required
                  minLength={2}
                  value={name}
                  aria-invalid={Boolean(siteNameError)}
                  onChange={(e) => setName(e.target.value)}
                />
                {siteNameError ? <FieldError>{siteNameError}</FieldError> : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div data-slot="field" className="flex flex-col gap-1 [&_input]:mt-0">
                  <Label htmlFor="service-site-code" className="leading-snug">{th ? 'รหัสไซต์งาน' : 'Site code'}</Label>
                  <Input
                    id="service-site-code"
                    value={code}
                    placeholder={th ? 'สร้างให้อัตโนมัติ (เช่น SITE-XXXXXXXX)' : 'Generated automatically'}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </div>
                <div data-slot="field" className="flex flex-col gap-1 [&_input]:mt-0">
                  <Label htmlFor="service-capacity" className="leading-snug" required>
                    {th ? 'กำลังติดตั้ง (MWp)' : 'Installed capacity (MWp)'}
                  </Label>
                  <Input
                    id="service-capacity"
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
                  <Label htmlFor="service-latitude" className="leading-snug">{th ? 'ละติจูด' : 'Latitude'}</Label>
                  <Input
                    id="service-latitude"
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
                  <Label htmlFor="service-longitude" className="leading-snug">{th ? 'ลองจิจูด' : 'Longitude'}</Label>
                  <Input
                    id="service-longitude"
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

          <TabsContent value="customer" className="space-y-4">
            <fieldset disabled={busy} className="space-y-4">
              <OrganizationIdentityFields
                value={customer}
                onChange={setCustomer}
                locale={locale}
                allowBlankCode
                disabled={busy}
                showErrors={showCustomerErrors}
              />
            </fieldset>
          </TabsContent>

          <TabsContent value="billing" className="space-y-4">
            <fieldset disabled={busy} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div data-slot="field" className="flex flex-col gap-1 [&_input]:mt-0">
                  <Label htmlFor="service-start-date" className="leading-snug" required>
                    {th ? 'วันที่เริ่มให้บริการ' : 'Service start date'}
                  </Label>
                  <DatePicker
                    id="service-start-date"
                    required
                    value={serviceStartDate}
                    aria-invalid={Boolean(billingDateError)}
                    onValueChange={(val) => setServiceStartDate(val)}
                    disabled={busy}
                  />
                  {billingDateError ? <FieldError>{billingDateError}</FieldError> : null}
                </div>
                <div data-slot="field" className="flex flex-col gap-1 [&_input]:mt-0">
                  <Label htmlFor="service-tariff-rate" className="leading-snug">
                    {th ? 'อัตราค่าบริการ (บาท/kWh)' : 'Tariff rate (THB/kWh)'}
                  </Label>
                  <Input
                    id="service-tariff-rate"
                    type="number"
                    step="0.0001"
                    min="0"
                    placeholder={th ? 'เช่น 4.5000' : 'e.g. 4.5000'}
                    value={ratePerKwh}
                    onChange={(e) => setRatePerKwh(e.target.value)}
                  />
                </div>
                <div data-slot="field" className="flex flex-col gap-1 [&_input]:mt-0">
                  <Label htmlFor="service-payment-term" className="leading-snug">
                    {th ? 'ระยะเวลาชำระเงิน (วัน)' : 'Payment term (days)'}
                  </Label>
                  <Input
                    id="service-payment-term"
                    type="number"
                    min="0"
                    value={paymentTermDays}
                    onChange={(e) => setPaymentTermDays(Number(e.target.value))}
                  />
                </div>
                <div data-slot="field" className="flex flex-col gap-1 [&_input]:mt-0">
                  <Label htmlFor="service-tax-rate" className="leading-snug">
                    {th ? 'อัตราภาษี (%)' : 'Tax rate (%)'}
                  </Label>
                  <Input
                    id="service-tax-rate"
                    type="number"
                    step="0.01"
                    min="0"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                  />
                </div>
                <div data-slot="field" className="flex flex-col gap-1">
                  <Label htmlFor="service-price-mode" className="leading-snug">{th ? 'รูปแบบราคา' : 'Price mode'}</Label>
                  <ChoiceSelect
                    id="service-price-mode"
                    value={pricesIncludeTax ? 'included' : 'excluded'}
                    onChange={(e) => setPricesIncludeTax(e.target.value === 'included')}
                  >
                    <option value="excluded">{th ? 'ยังไม่รวมภาษี' : 'Tax excluded'}</option>
                    <option value="included">{th ? 'รวมภาษี' : 'Tax included'}</option>
                  </ChoiceSelect>
                </div>
                <div data-slot="field" className="flex flex-col gap-1">
                  <Label htmlFor="service-tax-confirmed" className="leading-snug">{th ? 'ยืนยันการตั้งค่าภาษี' : 'Tax confirmation'}</Label>
                  <ChoiceSelect
                    id="service-tax-confirmed"
                    value={taxConfirmed ? 'yes' : 'no'}
                    onChange={(e) => setTaxConfirmed(e.target.value === 'yes')}
                  >
                    <option value="no">{th ? 'ยังไม่ยืนยัน' : 'Not confirmed'}</option>
                    <option value="yes">{th ? 'ผู้รับผิดชอบบัญชียืนยันแล้ว' : 'Confirmed by accounting'}</option>
                  </ChoiceSelect>
                </div>
                <div data-slot="field" className="flex flex-col gap-1">
                  <Label htmlFor="service-reminders-enabled" className="leading-snug">{th ? 'การทวงชำระเงิน' : 'Payment reminders'}</Label>
                  <ChoiceSelect
                    id="service-reminders-enabled"
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
                      <Label htmlFor="service-reminder-start" className="leading-snug">
                        {th ? 'เริ่มทวงหลังครบกำหนด (วัน)' : 'Reminder start (days)'}
                      </Label>
                      <Input
                        id="service-reminder-start"
                        type="number"
                        min="0"
                        value={reminderStartDays}
                        onChange={(e) => setReminderStartDays(Number(e.target.value))}
                      />
                    </div>
                    <div data-slot="field" className="flex flex-col gap-1 [&_input]:mt-0">
                      <Label htmlFor="service-reminder-interval" className="leading-snug">
                        {th ? 'ทวงซ้ำทุก (วัน)' : 'Reminder interval (days)'}
                      </Label>
                      <Input
                        id="service-reminder-interval"
                        type="number"
                        min="1"
                        value={reminderIntervalDays}
                        onChange={(e) => setReminderIntervalDays(Number(e.target.value))}
                      />
                    </div>
                  </>
                ) : null}
              </div>
            </fieldset>
          </TabsContent>
        </Tabs>
      </DialogBody>

      <DialogFooter className="flex flex-row justify-between sm:justify-between items-center gap-2">
        <div>
          {activeTab === 'site' ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              {th ? 'ยกเลิก' : 'Cancel'}
            </Button>
          ) : activeTab === 'customer' ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setActiveTab('site')}
              disabled={busy}
            >
              {th ? 'ย้อนกลับ' : 'Previous'}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setActiveTab('customer')}
              disabled={busy}
            >
              {th ? 'ย้อนกลับ' : 'Previous'}
            </Button>
          )}
        </div>

        <div className="flex gap-2">
          {activeTab === 'site' ? (
            <Button
              key="site-next"
              type="button"
              onClick={(event) => {
                event.preventDefault();
                if (!isSiteValid()) {
                  setShowSiteErrors(true);
                  return;
                }
                setShowSiteErrors(false);
                setError('');
                setActiveTab('customer');
              }}
              disabled={busy}
            >
              {th ? 'ถัดไป' : 'Next'}
            </Button>
          ) : activeTab === 'customer' ? (
            <Button
              key="customer-next"
              type="button"
              onClick={(event) => {
                event.preventDefault();
                if (!isCustomerValid()) {
                  setShowCustomerErrors(true);
                  return;
                }
                setShowCustomerErrors(false);
                setError('');
                setActiveTab('billing');
              }}
              disabled={busy}
            >
              {th ? 'ถัดไป' : 'Next'}
            </Button>
          ) : (
            <Button key="billing-submit" type="submit" data-site-service-submit="true" disabled={busy}>
              {busy ? (th ? 'กำลังบันทึก…' : 'Saving…') : th ? 'สร้างไซต์งาน' : 'Create site'}
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
          {formBody}
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
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        {dialogHeader}
        {formBody}
      </DialogContent>
    </Dialog>
  );
}

