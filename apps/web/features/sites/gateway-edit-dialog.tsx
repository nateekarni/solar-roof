'use client';
import * as React from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '../../components/ui/dialog';
import {Button} from '../../components/ui/button';
import {Input} from '../../components/ui/input';
import {ChoiceSelect} from '../../components/ui/choice-select';
import {Field,FieldError,FieldGroup,FieldLabel} from '../../components/ui/field';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '../../components/ui/tabs';
import {BrokerSelect} from './broker-select';
import {PayloadConnectionCard} from './payload-connection-card';
import {GatewayBillingSourceSection} from './gateway-billing-source-section';
import {GatewayInstallationHistory} from './gateway-installation-history';
import {DeviceProfileEditor, composeAutoDeviceTopic} from './device-profile-editor';
import {
  newDeviceDraft,
  draftFromDevice,
  deviceProfilePayload,
  validateDeviceDraft,
  type DeviceDraft,
} from './site-form-values';
import {apiClient} from '../../lib/api-client';
import {focusErrorElement} from '../../lib/form-feedback';
import {useLocale} from '../../providers/locale-provider';
import {useSessionUser} from '../../providers/session-user-provider';
import type {GatewayRow} from './gateway-index';
import type {PayloadConfig,PayloadRevision} from './payload-contracts';
import type {MetricSources} from './dashboard-source-model';
import {Radio,Cpu,History,Settings,Plus,Trash2,ReceiptText} from 'lucide-react';

type GatewayConfig = PayloadConfig & {
  metricSources?: MetricSources;
  mqttBrokerId?: string;
  pollingIntervalSeconds: number;
  configuration: {
    desiredVersion: number | null;
    publishedVersion: number | null;
    acknowledgedVersion: number | null;
    appliedVersion: number | null;
  };
  cadence: {
    id: string;
    expectedIntervalSeconds: number;
    pollGroups: Record<string, number>;
  }[];
};

interface SiteOption {
  id: string;
  name: string;
  code: string;
  active: boolean;
  assignedGatewayId?: string | null;
}

const SEPARATED_TAB_LIST_CLASS =
  'h-auto w-full flex overflow-x-auto !bg-transparent bg-transparent p-0 gap-2 border-0 shadow-none mb-3 shrink-0';
const SEPARATED_TAB_TRIGGER_CLASS =
  'flex-1 justify-center shrink-0 px-3.5 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-neutral-950 data-[state=active]:font-bold data-active:border-primary data-active:bg-primary data-active:text-neutral-950 data-active:font-bold transition-colors shadow-none gap-1.5 text-xs';

export function GatewayEditDialog({
  gateway,
  open,
  onOpenChange,
  sites,
  onSaved,
  permissions,
  onReplaced,
  inline = false,
}: {
  gateway: GatewayRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sites?: SiteOption[] | undefined;
  onSaved: () => void;
  permissions: {
    gatewayEdit: boolean;
    deviceEdit: boolean;
    brokerView: boolean;
    brokerEdit?: boolean | undefined;
    receptionEdit?: boolean | undefined;
    registerView?: boolean | undefined;
  };
  onReplaced?: (() => void) | undefined;
  inline?: boolean | undefined;
}) {
  const locale = useLocale();
  const th = locale === 'th';
  const user = useSessionUser();
  const canManageBillingSource = user.role === 'admin';

  const [availableSites, setAvailableSites] = React.useState<SiteOption[]>(sites ?? []);
  const [tab, setTab] = React.useState('general');
  const [config, setConfig] = React.useState<GatewayConfig | null>(null);
  const [deviceDrafts, setDeviceDrafts] = React.useState<Record<string, DeviceDraft>>({});
  const [siteId, setSiteId] = React.useState(gateway?.siteId ?? '');
  const [name, setName] = React.useState(gateway?.name ?? '');
  const [code, setCode] = React.useState(gateway?.externalGatewayId ?? '');
  const [broker, setBroker] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [showErrors, setShowErrors] = React.useState(false);
  const [revision, setRevision] = React.useState(0);
  const [newDevices, setNewDevices] = React.useState<DeviceDraft[]>([]);
  const [presets, setPresets] = React.useState<PayloadRevision[]>([]);

  const selectedSite = availableSites.find((s) => s.id === siteId);
  const siteCode = selectedSite?.code?.trim() || '';
  const gwCode = code.trim();

  React.useEffect(() => {
    let active = true;
    apiClient
      .get<PayloadRevision[]>('/v1/settings/payload-presets')
      .then((rows) => {
        if (active) setPresets(rows);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (sites && sites.length > 0) {
      setAvailableSites(sites);
    }
  }, [sites]);

  React.useEffect(() => {
    if (!open || !gateway) {
      setConfig(null);
      setDeviceDrafts({});
      setNewDevices([]);
      setError('');
      setShowErrors(false);
      return;
    }

    setSiteId(gateway.siteId ?? '');
    setName(gateway.name ?? '');
    setCode(gateway.externalGatewayId ?? '');
    setBroker('');
    setError('');
    setShowErrors(false);

    let active = true;
    if (!sites || sites.length === 0) {
      apiClient.get<SiteOption[]>(`/v1/gateways/site-options?gatewayId=${gateway.id}`)
        .then((data) => {
          if (active) setAvailableSites(data);
        })
        .catch(() => {});
    }
    apiClient.get<GatewayConfig>(`/v1/gateways/${gateway.id}/configuration`)
      .then((data) => {
        if (active) {
          setConfig(data);
          setBroker(data.mqttBrokerId ?? '');
          const nextDrafts: Record<string, DeviceDraft> = {};
          for (const device of data.devices) {
            const cadence = data.cadence?.find((c) => c.id === device.id);
            const effectiveInterval = cadence?.expectedIntervalSeconds ?? device.expectedIntervalSeconds;
            nextDrafts[device.id] = draftFromDevice(
              typeof effectiveInterval === 'number'
                ? { ...device, expectedIntervalSeconds: effectiveInterval }
                : device
            );
          }
          setDeviceDrafts(nextDrafts);
        }
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });

    return () => {
      active = false;
    };
  }, [open, gateway, revision, sites]);

  async function handleSaveAll(e?: React.FormEvent) {
    e?.preventDefault();
    if (!permissions.gatewayEdit && !permissions.deviceEdit) return;
    setShowErrors(true);
    setError('');

    if (permissions.gatewayEdit && (!siteId || !name.trim())) {
      setTab('general');
      requestAnimationFrame(() => {
        const el = document.getElementById(!siteId ? 'edit-gw-site' : 'edit-gw-name');
        if (el) focusErrorElement(el);
      });
      return;
    }

    if (permissions.deviceEdit && config) {
      for (const device of config.devices) {
        const draft = deviceDrafts[device.id];
        if (!draft) continue;
        const problem = validateDeviceDraft(draft, !!device.billingMeter, locale);
        if (problem) {
          setTab('devices');
          requestAnimationFrame(() => {
            const card = document.getElementById(`device-card-${device.id}`);
            const invalidInput = card?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? card;
            if (invalidInput) focusErrorElement(invalidInput);
          });
          return;
        }
      }
    }

    if (permissions.deviceEdit && newDevices.length > 0) {
      for (const dev of newDevices) {
        const problem = validateDeviceDraft(dev, false, locale, true);
        if (problem) {
          setTab('devices');
          requestAnimationFrame(() => {
            const card = document.getElementById(`edit-gw-new-device-${dev.key}`);
            const invalidInput = card?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? card;
            if (invalidInput) focusErrorElement(invalidInput);
          });
          return;
        }
      }
    }

    setBusy(true);
    try {
      if (permissions.gatewayEdit && siteId) {
        const gatewaySubscriptionTopic = `solar/v1/sites/${siteCode}/gateways/${gwCode}/devices/+/telemetry`;
        await apiClient.post(`/v1/sites/${siteId}/gateway`, {
          name: name.trim(),
          externalGatewayId: code.trim() || undefined,
          mqttBrokerId: broker || undefined,
          topicContract: 'solar-v1',
          subscriptionTopic: gatewaySubscriptionTopic,
        });
      }

      if (permissions.deviceEdit && config) {
        for (const device of config.devices) {
          const draft = deviceDrafts[device.id];
          if (!draft) continue;
          const cadence = config.cadence?.find((c) => c.id === device.id);
          const effectiveInterval = cadence?.expectedIntervalSeconds ?? device.expectedIntervalSeconds;
          const hasChanged =
            draft.dirty ||
            draft.profileDirty ||
            draft.payloadProfileRevisionId !== device.profileRevisionId ||
            draft.name !== device.name ||
            draft.model !== (device.model ?? '') ||
            draft.serialNumber !== (device.serialNumber ?? '') ||
            draft.expectedIntervalSeconds !== (effectiveInterval ?? draft.expectedIntervalSeconds);

          if (hasChanged) {
            await apiClient.patch<{ payloadProfileRevisionId: string }>(
              `/v1/devices/${device.id}/payload-profile`,
              {
                ...deviceProfilePayload(draft),
                name: draft.name.trim(),
                model: draft.model.trim(),
                serialNumber: draft.serialNumber.trim(),
                expectedIntervalSeconds: draft.expectedIntervalSeconds,
              }
            );
          }
        }
      }

      if (permissions.deviceEdit && newDevices.length > 0 && siteId) {
        for (const dev of newDevices) {
          await apiClient.post(`/v1/sites/${siteId}/devices`, {
            name: dev.name.trim(),
            model: dev.model.trim(),
            serialNumber: dev.serialNumber.trim(),
            externalDeviceId: dev.externalDeviceId || undefined,
            expectedIntervalSeconds: dev.expectedIntervalSeconds,
            ...deviceProfilePayload(dev),
          });
        }
        setNewDevices([]);
      }

      setShowErrors(false);
      setRevision((n) => n + 1);
      onSaved();
    } catch (err: unknown) {
      setError((err as Error).message || (th ? 'บันทึกไม่สำเร็จ' : 'Failed to save'));
    } finally {
      setBusy(false);
    }
  }

  if (!gateway) return null;

  const nameInvalid = showErrors && !name.trim();

  const footerActions = (
    <>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>
        {th ? 'ปิด' : 'Close'}
      </Button>
      {(permissions.gatewayEdit || permissions.deviceEdit) && (
        <Button type="button" size="sm" disabled={busy} onClick={() => void handleSaveAll()}>
          {busy ? (th ? 'กำลังบันทึก…' : 'Saving…') : th ? 'บันทึกการตั้งค่า' : 'Save Configuration'}
        </Button>
      )}
    </>
  );

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
        {canManageBillingSource && (
          <TabsTrigger value="billing" className={SEPARATED_TAB_TRIGGER_CLASS}>
            <ReceiptText className="size-3.5" />
            <span>{th ? 'มิเตอร์ออกบิล' : 'Billing Meter'}</span>
          </TabsTrigger>
        )}
        <TabsTrigger value="history" className={SEPARATED_TAB_TRIGGER_CLASS}>
          <History className="size-3.5" />
          <span>{th ? 'ประวัติและการสลับเปลี่ยน' : 'History & Replacement'}</span>
        </TabsTrigger>
      </TabsList>

      <div data-slot="dialog-body" className="min-h-0 flex-1 overflow-y-auto py-1 px-1.5">
        {error && <p role="alert" className="text-sm text-destructive mb-3">{error}</p>}

        {/* TAB 1: General Gateway Settings */}
        <TabsContent value="general" forceMount className="data-[state=inactive]:hidden space-y-6 m-0">
          <form onSubmit={(e) => void handleSaveAll(e)} noValidate className="space-y-4">
            <FieldGroup className="grid gap-3 sm:grid-cols-2">
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="edit-gw-site">
                  {th ? 'ไซต์งาน' : 'Site'}
                </FieldLabel>
                <ChoiceSelect
                  id="edit-gw-site"
                  disabled
                  value={siteId}
                  className="h-10 bg-muted/40 cursor-not-allowed"
                >
                  {availableSites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name} · {site.code}
                    </option>
                  ))}
                </ChoiceSelect>
              </Field>

              <Field data-invalid={nameInvalid || undefined}>
                <FieldLabel htmlFor="edit-gw-name">
                  {th ? 'ชื่อเกตเวย์' : 'Gateway Name'}
                </FieldLabel>
                <Input
                  id="edit-gw-name"
                  required
                  aria-invalid={nameInvalid || undefined}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-10"
                />
                {nameInvalid && (
                  <FieldError className="text-xs">
                    {th ? 'กรุณาระบุชื่อเกตเวย์' : 'Gateway name is required'}
                  </FieldError>
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor="edit-gw-code">
                  {th ? 'รหัสเกตเวย์ (Gateway ID)' : 'Gateway ID'}
                </FieldLabel>
                <Input
                  id="edit-gw-code"
                  disabled
                  value={code}
                  className="h-10 bg-muted/40 cursor-not-allowed font-mono"
                />
              </Field>

              {/* Row 3: Broker */}
              <div className="sm:col-span-2">
                {permissions.brokerView ? (
                  <BrokerSelect value={broker} onChange={setBroker} />
                ) : (
                  <Field>
                    <FieldLabel>MQTT Broker</FieldLabel>
                    <p className="text-xs text-muted-foreground pt-2">
                      {th ? 'การจัดการ Broker ต้องใช้สิทธิ์ที่เกี่ยวข้อง' : 'Broker management requires broker access'}
                    </p>
                  </Field>
                )}
              </div>
            </FieldGroup>

          </form>

          {config && (
            <div className="rounded-xl border bg-card p-4">
              <ConfigurationPublishSection
                gatewayId={config.gatewayId}
                configuration={config.configuration}
                onSaved={() => {
                  setRevision((n) => n + 1);
                  onSaved();
                }}
              />
            </div>
          )}
        </TabsContent>

        {/* TAB 2: Devices and Data Reception */}
        <TabsContent value="devices" forceMount className="data-[state=inactive]:hidden space-y-5 m-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Cpu className="size-4 text-primary" />
              <span>{th ? 'รายการอุปกรณ์ของเกตเวย์' : 'Gateway Devices'}</span>
            </h3>
            {permissions.gatewayEdit && siteId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const nextIndex = (config?.devices.length ?? 0) + newDevices.length + 1;
                  const d = newDeviceDraft('solar-logger', 15);
                  d.name = `Device ${nextIndex}`;
                  d.model = 'SmartLogger';
                  d.telemetryTopic = composeAutoDeviceTopic(siteCode, gwCode, d.externalDeviceId);
                  setNewDevices((prev) => [...prev, d]);
                }}
                className="gap-1.5"
              >
                <Plus className="size-3.5" />
                <span>{th ? 'เพิ่มอุปกรณ์' : 'Add device'}</span>
              </Button>
            )}
          </div>

          {config ? (
            <PayloadConnectionCard
              config={config}
              editable={permissions.gatewayEdit}
              edgeToEdge
              drafts={deviceDrafts}
              onDraftChange={(deviceId, nextDraft) =>
                setDeviceDrafts((prev) => ({ ...prev, [deviceId]: nextDraft }))
              }
              hideInlineSave
              showErrors={showErrors}
              onRefresh={() => {
                setRevision((n) => n + 1);
                onSaved();
              }}
            />
          ) : (
            <p className="text-xs text-muted-foreground py-4">{th ? 'กำลังโหลดข้อมูลอุปกรณ์…' : 'Loading devices…'}</p>
          )}

          {newDevices.length > 0 && (
            <div className="space-y-4 pt-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {th ? 'อุปกรณ์ใหม่ที่รอการบันทึก' : 'New Devices to be Added'}
              </h4>
              {newDevices.map((device, index) => {
                const devProblem = showErrors ? validateDeviceDraft(device, false, locale, true) : null;
                return (
                  <section
                    key={device.key}
                    id={`edit-gw-new-device-${device.key}`}
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
                          setNewDevices(newDevices.filter((_, i) => i !== index))
                        }
                      >
                        <Trash2 className="size-3.5" />
                        <span>{th ? 'ลบอุปกรณ์นี้' : 'Remove'}</span>
                      </Button>
                    </div>
                    <DeviceProfileEditor
                      value={device}
                      onChange={(next) =>
                        setNewDevices(
                          newDevices.map((d, i) => (i === index ? next : d))
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
        </TabsContent>

        {/* TAB 3: Billing meter source */}
        {canManageBillingSource && (
          <TabsContent value="billing" forceMount className="data-[state=inactive]:hidden space-y-5 m-0">
            {config && siteId ? (
              <GatewayBillingSourceSection
                siteId={siteId}
                locale={locale}
                receiveConfig={config.receiveRevision.config}
                onBindingSaved={() => {
                  setRevision((n) => n + 1);
                  onSaved();
                }}
              />
            ) : (
              <p className="py-4 text-xs text-muted-foreground">{th ? 'กำลังโหลดข้อมูลมิเตอร์ออกบิล…' : 'Loading billing meter…'}</p>
            )}
          </TabsContent>
        )}

        {/* TAB 4: Installation History & Replacement */}
        <TabsContent value="history" forceMount className="data-[state=inactive]:hidden space-y-6 m-0">
          {config ? (
            <GatewayInstallationHistory
              gatewayId={config.gatewayId}
              onReplaced={() => {
                onOpenChange(false);
                if (onReplaced) {
                  onReplaced();
                } else {
                  onSaved();
                }
              }}
            />
          ) : (
            <p className="text-xs text-muted-foreground py-4">{th ? 'กำลังโหลดประวัติ…' : 'Loading history…'}</p>
          )}
        </TabsContent>
      </div>
    </Tabs>
  );

  if (inline) {
    return (
      <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
        <header className="pb-1 flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Settings className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">
                {th ? 'ตั้งค่าเกตเวย์' : 'Configure Gateway'}: {gateway.name}
              </h2>
              <p className="text-xs text-muted-foreground">
                {gateway.externalGatewayId} · {gateway.siteName}
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
              <Settings className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                {th ? 'ตั้งค่าเกตเวย์' : 'Configure Gateway'}: {gateway.name}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {gateway.externalGatewayId} · {gateway.siteName}
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

function ConfigurationPublishSection({
  gatewayId,
  configuration,
  onSaved,
}: {
  gatewayId: string;
  configuration: GatewayConfig['configuration'];
  onSaved: () => void;
}) {
  const th = useLocale() === 'th';
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');

  async function publish() {
    setBusy(true);
    setError('');
    try {
      const result = await apiClient.post<{ version: number; delivery: string }>(
        `/v1/gateways/${gatewayId}/configuration/publish`,
        { baseVersion: configuration.desiredVersion }
      );
      setNotice(
        result.delivery === 'published'
          ? th
            ? 'เผยแพร่แล้ว รออุปกรณ์ยืนยันรับและนำไปใช้'
            : 'Published; awaiting device acknowledgement and application'
          : th
          ? 'รอการเชื่อมต่อเพื่อเผยแพร่'
          : 'Pending connection for publication'
      );
      onSaved();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h3 className="font-semibold text-sm text-foreground">
          {th ? 'เผยแพร่เวอร์ชันการตั้งค่า' : 'Publish configuration version'}
        </h3>
        <p className="text-xs text-muted-foreground">
          {th
            ? 'ส่งการตั้งค่าล่าสุดไปยังเกตเวย์ผ่าน MQTT เพื่อให้อุปกรณ์รับทราบและนำไปใช้งาน'
            : 'Send the latest configuration to the gateway over MQTT for acknowledgement and application.'}
        </p>
      </div>
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 text-xs">
        {([
          ['desiredVersion', 'ต้องการ', 'Desired'],
          ['publishedVersion', 'เผยแพร่', 'Published'],
          ['acknowledgedVersion', 'ยืนยันรับ', 'Acknowledged'],
          ['appliedVersion', 'ใช้งานแล้ว', 'Applied'],
        ] as const).map(([key, labelTh, labelEn]) => (
          <div key={key} className="rounded-lg border bg-muted/20 p-2.5 flex justify-between items-center gap-2">
            <span className="text-muted-foreground">{th ? labelTh : labelEn}</span>
            <strong className="text-foreground tabular-nums">{configuration[key] ?? '—'}</strong>
          </div>
        ))}
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {notice && <p role="status" className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{notice}</p>}
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={busy || configuration.desiredVersion === null}
          onClick={() => void publish()}
        >
          {th ? 'เผยแพร่การตั้งค่า' : 'Publish configuration'}
        </Button>
      </div>
    </section>
  );
}

