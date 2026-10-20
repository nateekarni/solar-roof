'use client';
import * as React from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '../../components/ui/dialog';
import {Button} from '../../components/ui/button';
import {Badge} from '../../components/ui/badge';
import {Card,CardHeader,CardTitle,CardContent} from '../../components/ui/card';
import {formatAppDateTime} from '../../lib/date-format';
import {TelemetryAgeLabel} from '../shared/telemetry-age-label';
import {apiClient} from '../../lib/api-client';
import {Radio,Wifi,Cpu,Sliders,Settings,Activity,Layers,Clock} from 'lucide-react';
import type {GatewayRow} from './gateway-index';
import type {PayloadConfig} from './payload-contracts';
import type {MetricSources} from './dashboard-source-model';
import {useSessionUser} from '../../providers/session-user-provider';
import {canManageGatewayOnboarding} from './gateway-permissions';
import {GatewayCredentialRecovery} from './gateway-credential-recovery';

type GatewayConfig = PayloadConfig & {
  metricSources?: MetricSources;
  mqttBrokerId?: string;
  brokerName?: string;
  brokerUrl?: string;
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

type Pair = {
  id: string;
  leftDeviceId: string;
  rightDeviceId: string;
  leftTag: string;
  rightTag: string;
  kind: 'energy' | 'power';
  relativeTolerance: number;
  absoluteFloor: number;
  windowSeconds: number;
  alertEnabled: boolean;
  latest: { state: string; result: unknown; windowStart: string; windowEnd: string } | null;
};

export function GatewayDetailModal({
  gateway,
  open,
  onOpenChange,
  onConfigure,
  locale = 'th',
  canEdit = true,
  inline = false,
}: {
  gateway: GatewayRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfigure?: ((gateway: GatewayRow) => void) | undefined;
  locale?: string | undefined;
  canEdit?: boolean | undefined;
  inline?: boolean | undefined;
}) {
  const th = locale === 'th';
  const canRecoverCredential=canManageGatewayOnboarding(useSessionUser());
  const [config, setConfig] = React.useState<GatewayConfig | null>(null);
  const [pairs, setPairs] = React.useState<Pair[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!open || !gateway) {
      setConfig(null);
      setPairs([]);
      setError('');
      return;
    }
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      apiClient.get<GatewayConfig>(`/v1/gateways/${gateway.id}/configuration`),
      apiClient.get<Pair[]>(`/v1/gateways/${gateway.id}/comparisons`).catch(() => []),
    ])
      .then(([configData, pairsData]) => {
        if (active) {
          setConfig(configData);
          setPairs(pairsData);
        }
      })
      .catch((e: Error) => {
        if (active) setError(e.message || 'Unable to load gateway details');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, gateway]);

  if (!gateway) return null;

  const stateLabels: Record<string, [string, string]> = {
    matched: ['สอดคล้อง', 'Matched'],
    ok: ['สอดคล้อง', 'Matched'],
    mismatch: ['ต่างเกินเกณฑ์', 'Mismatch'],
    insufficient_data: ['ข้อมูลไม่เพียงพอ', 'Insufficient data'],
    insufficient: ['ข้อมูลไม่เพียงพอ', 'Insufficient data'],
    gap: ['ข้อมูลขาดช่วง', 'Data gap'],
    pending: ['รอข้อมูล', 'Pending'],
  };

  const badge = (status: string) => (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        status === 'online'
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : status === 'offline'
          ? 'bg-red-500/10 text-red-700 dark:text-red-400'
          : 'bg-muted text-muted-foreground'
      }`}
    >
      {status === 'online' ? (th ? 'ออนไลน์' : 'Online') : status === 'offline' ? (th ? 'ออฟไลน์' : 'Offline') : status}
    </span>
  );

  const bodyContent = (
    <div data-slot="dialog-body" className="min-h-0 flex-1 overflow-y-auto space-y-4 py-2 px-1.5">
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          {/* Quick Metrics & Time Grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border bg-card p-3 space-y-1">
              <p className="text-xs text-muted-foreground">{th ? 'กำลังผลิตปัจจุบัน' : 'Current Power'}</p>
              <p className="text-base font-semibold">
                {gateway.currentProductionKw == null
                  ? '—'
                  : `${Number(gateway.currentProductionKw).toLocaleString(th ? 'th-TH' : 'en-US', { maximumFractionDigits: 2 })} kW`}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-3 space-y-1">
              <p className="text-xs text-muted-foreground">{th ? 'จำนวนอุปกรณ์' : 'Devices'}</p>
              <p className="text-base font-semibold">{gateway.deviceCount ?? (config?.devices?.length ?? 0)}</p>
            </div>
            <div className="rounded-xl border bg-card p-3 space-y-1">
              <p className="text-xs text-muted-foreground">{th ? 'รอบอ่านตั้งต้น' : 'Default Cadence'}</p>
              <p className="text-base font-semibold">{config?.pollingIntervalSeconds ?? gateway.pollingIntervalSeconds ?? 10}s</p>
            </div>
            <div className="rounded-xl border bg-card p-3 space-y-1">
              <p className="text-xs text-muted-foreground">{th ? 'รับข้อมูลล่าสุด' : 'Last Received'}</p>
              <div className="text-xs font-medium">
                {gateway.lastReceivedAt ? (
                  <span title={formatAppDateTime(gateway.lastReceivedAt, th ? 'th' : 'en')}>
                    <TelemetryAgeLabel value={gateway.lastReceivedAt} locale={locale} />
                  </span>
                ) : (
                  '—'
                )}
              </div>
            </div>
          </div>

          {/* MQTT & Broker Connection */}
          <Card className="gap-0 py-0 overflow-hidden">
            <CardHeader className="py-3 bg-muted/30">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Wifi className="size-4 text-primary" />
                <span>{th ? 'การเชื่อมต่อและ MQTT' : 'MQTT Connection & Topics'}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="py-3 text-xs space-y-2.5">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{th ? 'ตัวกรอง Subscribe' : 'Subscription Topic'}</span>
                <code className="font-mono break-all text-right">{config?.subscriptionTopic || gateway.subscriptionTopic || '—'}</code>
              </div>
              {config?.ackTopic && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{th ? 'Topic ตอบรับ (dataAcept)' : 'ACK Topic'}</span>
                  <code className="font-mono break-all text-right">{config.ackTopic}</code>
                </div>
              )}
              {config?.configuration && (
                <div className="flex justify-between gap-4 pt-1 border-t">
                  <span className="text-muted-foreground">{th ? 'เวอร์ชันคอนฟิก' : 'Configuration Version'}</span>
                  <span className="font-medium">
                    {th ? 'ต้องการ' : 'Desired'}: {config.configuration.desiredVersion ?? '—'} ·{' '}
                    {th ? 'เผยแพร่' : 'Published'}: {config.configuration.publishedVersion ?? '—'} ·{' '}
                    {th ? 'ใช้งาน' : 'Applied'}: {config.configuration.appliedVersion ?? '—'}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Connected Devices & Cadence */}
          <Card className="gap-0 py-0 overflow-hidden">
            <CardHeader className="py-3 bg-muted/30">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Cpu className="size-4 text-primary" />
                <span>{th ? 'อุปกรณ์ในเกตเวย์นี้' : 'Connected Devices'} ({config?.devices?.length ?? 0})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {config?.devices && config.devices.length > 0 ? (
                <div className="divide-y text-xs">
                  {config.devices.map((device) => {
                    const cadence = config.cadence?.find((c) => c.id === device.id);
                    return (
                      <div key={device.id} className="p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-foreground flex items-center gap-1.5">
                            <span>{device.name}</span>
                            {device.billingMeter && (
                              <Badge variant="outline" className="text-[10px] py-0 h-4 font-normal">
                                {th ? 'มิเตอร์คิดบิล' : 'Billing Meter'}
                              </Badge>
                            )}
                          </div>
                          <span className="font-mono text-muted-foreground">{device.externalDeviceId || device.id}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                          <div>
                            <span>{th ? 'รุ่น' : 'Model'}: </span>
                            <strong className="text-foreground">{device.profileConfig?.displayName || device.profileId || '—'}</strong>
                          </div>
                          <div>
                            <span>{th ? 'รอบคาดหวัง' : 'Expected Cadence'}: </span>
                            <strong className="text-foreground">{cadence?.expectedIntervalSeconds ?? config.pollingIntervalSeconds}s</strong>
                          </div>
                          <div className="col-span-2">
                            <span>Publish Topic: </span>
                            <code className="font-mono text-foreground break-all">{device.telemetryTopic}</code>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="p-4 text-xs text-muted-foreground">{th ? 'ไม่พบข้อมูลอุปกรณ์' : 'No devices found'}</p>
              )}
            </CardContent>
          </Card>
        </div>
      );

  if (inline) {
    return (
      <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
        <header className="pb-1 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <Radio className="size-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold">
                  {gateway.name} · {gateway.externalGatewayId}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {gateway.siteName} · {gateway.siteCode}
                </p>
              </div>
            </div>
            <div>{badge(gateway.status)}</div>
          </div>
        </header>

        {bodyContent}

        <footer className="pt-3 border-t shrink-0 flex flex-row items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {th ? 'ปิด' : 'Close'}
          </Button>
          {canEdit && onConfigure && (
            <Button
              size="sm"
              onClick={() => onConfigure(gateway)}
              className="gap-1.5"
            >
              <Settings className="size-3.5" />
              <span>{th ? 'ตั้งค่าเกตเวย์' : 'Configure Gateway'}</span>
            </Button>
          )}
          {canRecoverCredential&&<GatewayCredentialRecovery gatewayId={gateway.id} locale={locale}/>}
        </footer>
      </section>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-sm:fixed max-sm:inset-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:rounded-none max-sm:p-4.5 max-sm:flex max-sm:flex-col sm:max-w-3xl sm:rounded-2xl sm:p-6 sm:max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-1 shrink-0">
          <div className="flex items-center justify-between gap-3 pr-6">
            <div className="flex items-center gap-2.5">
              <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <Radio className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">
                  {gateway.name} · {gateway.externalGatewayId}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {gateway.siteName} · {gateway.siteCode}
                </DialogDescription>
              </div>
            </div>
            <div>{badge(gateway.status)}</div>
          </div>
        </DialogHeader>

        {bodyContent}

        <DialogFooter className="mt-0 sm:mt-0 shrink-0 flex flex-row items-center justify-between sm:justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {th ? 'ปิด' : 'Close'}
          </Button>
          {canEdit && onConfigure && (
            <Button
              size="sm"
              onClick={() => {
                onOpenChange(false);
                onConfigure(gateway);
              }}
              className="gap-1.5"
            >
              <Settings className="size-3.5" />
              <span>{th ? 'ตั้งค่าเกตเวย์' : 'Configure Gateway'}</span>
            </Button>
          )}
          {canRecoverCredential&&<GatewayCredentialRecovery gatewayId={gateway.id} locale={locale}/>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
