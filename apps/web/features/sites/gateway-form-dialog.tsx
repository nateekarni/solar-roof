'use client';
import * as React from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '../../components/ui/dialog';
import {Button} from '../../components/ui/button';
import {Input} from '../../components/ui/input';
import {ChoiceSelect} from '../../components/ui/choice-select';
import {Field,FieldError,FieldGroup,FieldLabel} from '../../components/ui/field';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '../../components/ui/tabs';
import {BrokerSelect} from './broker-select';
import {DeviceProfileEditor,defaultDeviceTopic,composeAutoDeviceTopic} from './device-profile-editor';
import {newDeviceDraft,deviceProfilePayload,validateDeviceDraft,type DeviceDraft} from './site-form-values';
import type {PayloadRevision} from './payload-contracts';
import {apiClient} from '../../lib/api-client';
import {focusErrorElement} from '../../lib/form-feedback';
import {useLocale} from '../../providers/locale-provider';
import {Radio,Cpu,Plus,Trash2} from 'lucide-react';

interface SiteOption {
  id: string;
  name: string;
  code: string;
  active: boolean;
  assignedGatewayId?: string | null;
}

const SEPARATED_TAB_LIST_CLASS =
  'h-auto w-full flex gap-2 !bg-transparent bg-transparent p-0 border-0 shadow-none mb-3 shrink-0';
const SEPARATED_TAB_TRIGGER_CLASS =
  'flex-1 justify-center px-3.5 py-2 rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-neutral-950 data-[state=active]:font-bold data-active:border-primary data-active:bg-primary data-active:text-neutral-950 data-active:font-bold transition-colors shadow-none gap-1.5 text-xs';

export function GatewayFormDialog({
  open,
  onOpenChange,
  sites,
  onSaved,
  brokerAccess = true,
  inline = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sites?: SiteOption[] | undefined;
  onSaved: () => void;
  brokerAccess?: boolean | undefined;
  inline?: boolean | undefined;
}) {
  const locale = useLocale();
  const th = locale === 'th';

  const [tab, setTab] = React.useState('general');
  const [availableSites, setAvailableSites] = React.useState<SiteOption[]>(sites ?? []);
  const [siteId, setSiteId] = React.useState('');
  const [name, setName] = React.useState('');
  const [code, setCode] = React.useState('');
  const [broker, setBroker] = React.useState('');

  const [mainDevice, setMainDevice] = React.useState<DeviceDraft>(() => {
    const draft = newDeviceDraft('energy-meter', 5);
    draft.name = 'Meter - Pilot SPM91';
    draft.model = 'Pilot SPM91';
    return draft;
  });
  const [additionalDevices, setAdditionalDevices] = React.useState<DeviceDraft[]>([]);
  const [presets, setPresets] = React.useState<PayloadRevision[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [showErrors, setShowErrors] = React.useState(false);

  const selectedSite = availableSites.find((s) => s.id === siteId);
  const siteCode = selectedSite?.code?.trim() || '';
  const gwCode = code.trim();

  // Helper to re-sync auto-topics when siteCode or gwCode changes
  const handleSiteChange = (nextSiteId: string) => {
    setSiteId(nextSiteId);
    const nextSite = availableSites.find((s) => s.id === nextSiteId);
    const nextSiteCode = nextSite?.code?.trim() || '';
    setMainDevice((prev) => {
      const prevAuto = composeAutoDeviceTopic(siteCode, gwCode, prev.externalDeviceId);
      if (!prev.telemetryTopic || prev.telemetryTopic === prevAuto) {
        return { ...prev, telemetryTopic: composeAutoDeviceTopic(nextSiteCode, gwCode, prev.externalDeviceId) };
      }
      return prev;
    });
    setAdditionalDevices((prev) =>
      prev.map((dev) => {
        const prevAuto = composeAutoDeviceTopic(siteCode, gwCode, dev.externalDeviceId);
        if (!dev.telemetryTopic || dev.telemetryTopic === prevAuto) {
          return { ...dev, telemetryTopic: composeAutoDeviceTopic(nextSiteCode, gwCode, dev.externalDeviceId) };
        }
        return dev;
      })
    );
  };

  const handleCodeChange = (nextCode: string) => {
    setCode(nextCode);
    const nextGwCode = nextCode.trim();
    setMainDevice((prev) => {
      const prevAuto = composeAutoDeviceTopic(siteCode, gwCode, prev.externalDeviceId);
      if (!prev.telemetryTopic || prev.telemetryTopic === prevAuto) {
        return { ...prev, telemetryTopic: composeAutoDeviceTopic(siteCode, nextGwCode, prev.externalDeviceId) };
      }
      return prev;
    });
    setAdditionalDevices((prev) =>
      prev.map((dev) => {
        const prevAuto = composeAutoDeviceTopic(siteCode, gwCode, dev.externalDeviceId);
        if (!dev.telemetryTopic || dev.telemetryTopic === prevAuto) {
          return { ...dev, telemetryTopic: composeAutoDeviceTopic(siteCode, nextGwCode, dev.externalDeviceId) };
        }
        return dev;
      })
    );
  };

  React.useEffect(() => {
    if (sites && sites.length > 0) {
      setAvailableSites(sites);
    }
  }, [sites]);

  React.useEffect(() => {
    if (open) {
      setTab('general');
      setSiteId('');
      setName('');
      setCode('');
      setBroker('');
      const draft = newDeviceDraft('energy-meter', 5);
      draft.name = 'Meter - Pilot SPM91';
      draft.model = 'Pilot SPM91';
      setMainDevice(draft);
      setAdditionalDevices([]);
      setError('');
      setShowErrors(false);
      if (!sites || sites.length === 0) {
        apiClient.get<SiteOption[]>('/v1/gateways/site-options')
          .then(setAvailableSites)
          .catch(() => {});
      }
      apiClient.get<PayloadRevision[]>('/v1/settings/payload-presets')
        .then(setPresets)
        .catch((e: Error) => setError(e.message));
    }
  }, [open, sites]);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    setShowErrors(true);
    setError('');

    if (!siteId || !name.trim()) {
      setTab('general');
      requestAnimationFrame(() => {
        const el = document.getElementById(!siteId ? 'new-gw-site' : 'new-gw-name');
        if (el) focusErrorElement(el);
      });
      return;
    }

    const mainProblem = validateDeviceDraft(mainDevice, true, locale, true);
    if (mainProblem) {
      setTab('devices');
      requestAnimationFrame(() => {
        const card = document.getElementById('new-gw-main-device-card');
        const invalidEl = card?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? card;
        if (invalidEl) focusErrorElement(invalidEl);
      });
      return;
    }

    for (let i = 0; i < additionalDevices.length; i++) {
      const dev = additionalDevices[i]!;
      const devProblem = validateDeviceDraft(dev, false, locale, true);
      if (devProblem) {
        setTab('devices');
        requestAnimationFrame(() => {
          const card = document.getElementById(`new-gw-additional-device-${dev.key}`);
          const invalidEl = card?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? card;
          if (invalidEl) focusErrorElement(invalidEl);
        });
        return;
      }
    }

    setBusy(true);
    try {
      const gatewaySubscriptionTopic = `solar/v1/sites/${siteCode}/gateways/${gwCode}/devices/+/telemetry`;

      // 1. Create or bind gateway to site
      await apiClient.post(`/v1/sites/${siteId}/gateway`, {
        name: name.trim(),
        externalGatewayId: code.trim() || undefined,
        mqttBrokerId: broker || undefined,
        topicContract: 'solar-v1',
        subscriptionTopic: gatewaySubscriptionTopic,
      });

      // 2. Create main meter device
      await apiClient.post(`/v1/sites/${siteId}/devices`, {
        name: mainDevice.name.trim(),
        model: mainDevice.model.trim(),
        serialNumber: mainDevice.serialNumber.trim(),
        externalDeviceId: mainDevice.externalDeviceId.trim() || undefined,
        expectedIntervalSeconds: mainDevice.expectedIntervalSeconds ?? 5,
        ...deviceProfilePayload(mainDevice),
      });

      // 3. Create any additional devices (e.g. SmartLogger)
      for (const dev of additionalDevices) {
        await apiClient.post(`/v1/sites/${siteId}/devices`, {
          name: dev.name.trim(),
          model: dev.model.trim(),
          serialNumber: dev.serialNumber.trim(),
          externalDeviceId: dev.externalDeviceId.trim() || undefined,
          expectedIntervalSeconds: dev.expectedIntervalSeconds ?? (dev.config?.deviceType?.includes('logger') ? 15 : 5),
          ...deviceProfilePayload(dev),
        });
      }

      setShowErrors(false);
      onOpenChange(false);
      onSaved();
    } catch (err: unknown) {
      setError((err as Error).message || (th ? 'เกิดข้อผิดพลาดในการบันทึกเกตเวย์' : 'Failed to save gateway'));
    } finally {
      setBusy(false);
    }
  }

  const siteInvalid = showErrors && !siteId;
  const nameInvalid = showErrors && !name.trim();
  const mainProblem = showErrors ? validateDeviceDraft(mainDevice, true, locale, true) : null;
  const gatewaySubscriptionTopic = `solar/v1/sites/${siteCode}/gateways/${gwCode}/devices/+/telemetry`;

  const tabsContent = (
    <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 flex flex-col pt-2">
      <TabsList className={SEPARATED_TAB_LIST_CLASS}>
        <TabsTrigger value="general" className={SEPARATED_TAB_TRIGGER_CLASS}>
          <Radio className="size-3.5" />
          <span>{th ? 'เกตเวย์และการเชื่อมต่อ' : 'Gateway & Connection'}</span>
        </TabsTrigger>
        <TabsTrigger value="devices" className={SEPARATED_TAB_TRIGGER_CLASS}>
          <Cpu className="size-3.5" />
          <span>{th ? 'อุปกรณ์และการรับข้อมูล' : 'Devices & Data Reception'}</span>
        </TabsTrigger>
      </TabsList>

      <form
        id="gateway-form"
        noValidate
        onSubmit={(e) => void handleSubmit(e)}
        data-slot="dialog-body"
        className="min-h-0 flex-1 overflow-y-auto py-1 px-1.5"
      >
        {error && <p role="alert" className="text-sm text-destructive mb-3">{error}</p>}

        {/* TAB 1: Gateway & Connection */}
        <TabsContent value="general" forceMount className="data-[state=inactive]:hidden space-y-6 m-0">
          <FieldGroup className="grid gap-3 sm:grid-cols-2">
            <Field className="sm:col-span-2" data-invalid={siteInvalid || undefined}>
              <FieldLabel htmlFor="new-gw-site">
                {th ? 'ไซต์งานที่มีอยู่' : 'Existing Site'}
              </FieldLabel>
              <ChoiceSelect
                id="new-gw-site"
                required
                aria-invalid={siteInvalid || undefined}
                value={siteId}
                onChange={(e) => handleSiteChange(e.target.value)}
                className="h-10"
              >
                <option value="">{th ? 'เลือกไซต์งาน' : 'Select site'}</option>
                {availableSites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name} · {site.code}
                  </option>
                ))}
              </ChoiceSelect>
              {siteInvalid && (
                <FieldError className="text-xs">
                  {th ? 'กรุณาเลือกไซต์งาน' : 'Please select a site'}
                </FieldError>
              )}
            </Field>

            <Field data-invalid={nameInvalid || undefined}>
              <FieldLabel htmlFor="new-gw-name">
                {th ? 'ชื่อเกตเวย์' : 'Gateway Name'}
              </FieldLabel>
              <Input
                id="new-gw-name"
                required
                aria-invalid={nameInvalid || undefined}
                placeholder="GW-001"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10"
              />
              {nameInvalid && (
                <FieldError className="text-xs">
                  {th ? 'กรุณาระบุชื่อเกตเวย์' : 'Please enter gateway name'}
                </FieldError>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="new-gw-code">
                {th ? 'รหัสเกตเวย์ (Gateway ID)' : 'Gateway ID'}
              </FieldLabel>
              <Input
                id="new-gw-code"
                placeholder={th ? 'เว้นว่างเพื่อสร้างให้อัตโนมัติ' : 'Generated automatically'}
                value={code}
                onChange={(e) => handleCodeChange(e.target.value)}
                className="h-10 font-mono"
              />
            </Field>

            <div className="sm:col-span-2">
              {brokerAccess ? (
                <BrokerSelect value={broker} onChange={setBroker} />
              ) : (
                <Field>
                  <FieldLabel>MQTT Broker</FieldLabel>
                  <p className="text-xs text-muted-foreground pt-2">
                    {th
                      ? 'การเลือก Broker ขึ้นอยู่กับสิทธิ์ระดับผู้ดูแลระบบ'
                      : 'Broker management requires broker privileges'}
                  </p>
                </Field>
              )}
            </div>
          </FieldGroup>
        </TabsContent>

        {/* TAB 2: Devices & Data Reception */}
        <TabsContent value="devices" forceMount className="data-[state=inactive]:hidden space-y-5 m-0">
          {/* Main Billing Meter */}
          <section
            id="new-gw-main-device-card"
            className={`flex min-w-0 flex-col gap-4 ${mainProblem ? 'rounded-xl border border-destructive/60 p-4' : ''}`}
          >
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Cpu className="size-4 text-primary" />
                <span>{th ? 'มิเตอร์หลักสำหรับคิดบิล' : 'Main Billing Meter'}</span>
              </h3>
              <span className="font-mono text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded border">
                {mainDevice.externalDeviceId || (th ? 'สุ่มรหัสอัตโนมัติ' : 'Auto ID')}
              </span>
            </div>

            <DeviceProfileEditor
              billing
              value={mainDevice}
              onChange={setMainDevice}
              revisions={presets}
              onCatalogChange={setPresets}
              locale={locale}
              showAdvanced={false}
              showErrors={showErrors}
              siteCode={siteCode}
              gatewayCode={gwCode}
            />

            {mainProblem && (
              <p role="alert" data-slot="field-error" className="text-xs text-destructive">
                {mainProblem}
              </p>
            )}
          </section>

          {/* Additional Devices Section */}
          <section className="border-t pt-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Cpu className="size-4 text-primary" />
                <h3 className="text-sm font-semibold">
                  {th ? 'อุปกรณ์เพิ่มเติม' : 'Additional Devices'}
                </h3>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const nextIndex = additionalDevices.length + 1;
                  const d = newDeviceDraft('solar-logger', 15);
                  d.name = `Device ${nextIndex}`;
                  d.model = 'SmartLogger';
                  d.telemetryTopic = composeAutoDeviceTopic(siteCode, gwCode, d.externalDeviceId);
                  setAdditionalDevices((prev) => [...prev, d]);
                }}
                className="gap-1.5"
              >
                <Plus className="size-3.5" />
                <span>{th ? 'เพิ่มอุปกรณ์' : 'Add Device'}</span>
              </Button>
            </div>

            {additionalDevices.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                {th
                  ? 'ยังไม่มีอุปกรณ์เพิ่มเติม สามารถกดปุ่มเพิ่มอุปกรณ์เพื่อผูก SmartLogger หรืออุปกรณ์ตรวจวัดอื่น'
                  : 'No additional devices. Click Add Device to link SmartLogger or other sensors.'}
              </p>
            ) : (
              <div className="space-y-5">
                {additionalDevices.map((device, index) => {
                  const devProblem = showErrors ? validateDeviceDraft(device, false, locale, true) : null;
                  return (
                    <section
                      key={device.key}
                      id={`new-gw-additional-device-${device.key}`}
                      className={`flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 ${devProblem ? 'border-destructive/60' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <Cpu className="size-4 text-primary" />
                          <span>#{index + 1} {device.name || (th ? 'อุปกรณ์ใหม่' : 'New Device')}</span>
                        </h4>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 gap-1"
                          onClick={() =>
                            setAdditionalDevices(additionalDevices.filter((_, i) => i !== index))
                          }
                        >
                          <Trash2 className="size-3.5" />
                          <span>{th ? 'ลบอุปกรณ์นี้' : 'Remove'}</span>
                        </Button>
                      </div>
                      <DeviceProfileEditor
                        value={device}
                        onChange={(next) =>
                          setAdditionalDevices(
                            additionalDevices.map((d, i) => (i === index ? next : d))
                          )
                        }
                        revisions={presets}
                        onCatalogChange={setPresets}
                        locale={locale}
                        showAdvanced={false}
                        showErrors={showErrors}
                        siteCode={siteCode}
                        gatewayCode={gwCode}
                      />
                      {devProblem && (
                        <p role="alert" data-slot="field-error" className="text-xs text-destructive">
                          {devProblem}
                        </p>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </section>
        </TabsContent>
      </form>
    </Tabs>
  );

  const footerActions = (
    <>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>
        {th ? 'ยกเลิก' : 'Cancel'}
      </Button>
      <Button type="submit" form="gateway-form" size="sm" disabled={busy}>
        {busy ? (th ? 'กำลังบันทึก…' : 'Saving…') : th ? 'บันทึกและสร้างเกตเวย์' : 'Save and Create Gateway'}
      </Button>
    </>
  );

  if (inline) {
    return (
      <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
        <header className="pb-1 flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Radio className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">
                {th ? 'เพิ่มเกตเวย์ใหม่' : 'Add New Gateway'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {th
                  ? 'ลงทะเบียนเกตเวย์และกำหนดค่าอุปกรณ์รับส่งข้อมูลประจำไซต์งาน'
                  : 'Register gateway parameters and device telemetry settings'}
              </p>
            </div>
          </div>
        </header>

        {tabsContent}

        <footer className="pt-3 border-t shrink-0 flex flex-row items-center justify-between gap-2">
          {footerActions}
        </footer>
      </section>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-sm:fixed max-sm:inset-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:rounded-none max-sm:p-4.5 max-sm:flex max-sm:flex-col sm:max-w-4xl sm:rounded-2xl sm:p-6 sm:max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-1 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Radio className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                {th ? 'เพิ่มเกตเวย์ใหม่' : 'Add New Gateway'}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {th
                  ? 'ลงทะเบียนเกตเวย์และกำหนดค่าอุปกรณ์รับส่งข้อมูลประจำไซต์งาน'
                  : 'Register gateway parameters and device telemetry settings'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {tabsContent}

        <DialogFooter className="mt-0 sm:mt-0 shrink-0 flex flex-row items-center justify-between sm:justify-between gap-2">
          {footerActions}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


