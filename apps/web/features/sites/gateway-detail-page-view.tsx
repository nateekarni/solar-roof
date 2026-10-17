'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronRight, ArrowLeft, RefreshCw, Settings, Clock, CheckCircle2, AlertTriangle, XCircle, Info, Copy, Check } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card';
import { formatAppDateTime } from '../../lib/date-format';
import { formatFlexibleDecimal } from '../../lib/number-format';
import { TelemetryAgeLabel } from '../shared/telemetry-age-label';
import { apiClient } from '../../lib/api-client';
import { useLocale } from '../../providers/locale-provider';
import { useSessionUser } from '../../providers/session-user-provider';
import { gatewayPermissions } from './gateway-permissions';
import { GatewayEditDialog } from './gateway-edit-dialog';
import { getTelemetryTagLabel } from './telemetry-tag-labels';
import type { GatewayRow } from './gateway-index';
import type { PayloadConfig } from './payload-contracts';
import type { MetricSources } from './dashboard-source-model';

export type DeviceTelemetrySample = {
  deviceId: string;
  externalDeviceId: string;
  deviceName: string;
  tag: string;
  value: number;
  unit: string;
  rawValue: number | null;
  rawUnit: string | null;
  polledAt: string | null;
  sourceTime: string | null;
  receivedAt: string | null;
  quality: string;
  communication: string;
  pollGroup: string;
};

export type GatewayConfig = PayloadConfig & {
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

function CopyableId({ label, id, locale }: { label: string; id: string; locale: 'th' | 'en' }) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const short = id.length > 22 ? `${id.slice(0, 12)}…${id.slice(-6)}` : id;

  return (
    <div className="inline-flex items-center gap-1.5 font-mono text-xs">
      <span title={id} className="rounded bg-muted/60 px-2 py-1 text-foreground border border-border/60">
        {short}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 text-muted-foreground hover:text-foreground"
        onClick={copy}
        title={locale === 'th' ? `คัดลอก ${label}` : `Copy ${label}`}
        aria-label={locale === 'th' ? `คัดลอก ${label}` : `Copy ${label}`}
      >
        {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}

export function GatewayDetailPageView({ gatewayId }: { gatewayId: string }) {
  const locale = useLocale();
  const th = locale === 'th';
  const user = useSessionUser();
  const permissions = gatewayPermissions(user);

  const [gateway, setGateway] = React.useState<GatewayRow | null>(null);
  const [config, setConfig] = React.useState<GatewayConfig | null>(null);
  const [samples, setSamples] = React.useState<DeviceTelemetrySample[]>([]);
  const [pairs, setPairs] = React.useState<Pair[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState('');
  const [editOpen, setEditOpen] = React.useState(false);
  const [revision, setRevision] = React.useState(0);

  const loadData = React.useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const [telemetryRes, configRes, pairsRes] = await Promise.all([
        apiClient.get<{ gateway: GatewayRow; samples: DeviceTelemetrySample[] }>(`/v1/gateways/${gatewayId}/telemetry`),
        apiClient.get<GatewayConfig>(`/v1/gateways/${gatewayId}/configuration`).catch(() => null),
        apiClient.get<Pair[]>(`/v1/gateways/${gatewayId}/comparisons`).catch(() => []),
      ]);

      setGateway(telemetryRes.gateway);
      setSamples(telemetryRes.samples || []);
      if (configRes) setConfig(configRes);
      if (pairsRes) setPairs(pairsRes);
    } catch (err) {
      setError((err as Error).message || 'Unable to load gateway details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [gatewayId]);

  React.useEffect(() => {
    void loadData();
  }, [loadData, revision]);

  const stateLabels: Record<string, [string, string]> = {
    matched: ['สอดคล้อง', 'Matched'],
    ok: ['สอดคล้อง', 'Matched'],
    mismatch: ['ต่างเกินเกณฑ์', 'Mismatch'],
    insufficient_data: ['ข้อมูลไม่เพียงพอ', 'Insufficient data'],
    insufficient: ['ข้อมูลไม่เพียงพอ', 'Insufficient data'],
    gap: ['ข้อมูลขาดช่วง', 'Data gap'],
    pending: ['รอข้อมูล', 'Pending'],
  };

  const statusBadge = (status: string) => {
    const isOnline = status === 'online';
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
          isOnline
            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
            : 'bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20'
        }`}
      >
        <span className={`size-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`} />
        {isOnline ? (th ? 'ออนไลน์' : 'Online') : (th ? 'ออฟไลน์' : 'Offline')}
      </span>
    );
  };

  const qualityBadge = (quality: string) => {
    const q = (quality || '').toLowerCase();
    const isGood = ['good', 'complete', 'ok'].includes(q);
    const isWarning = ['fair', 'partial'].includes(q);
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
          isGood
            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
            : isWarning
            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
            : 'bg-red-500/10 text-red-700 dark:text-red-400'
        }`}
      >
        {isGood ? (
          <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400" />
        ) : isWarning ? (
          <AlertTriangle className="size-3 text-amber-600 dark:text-amber-400" />
        ) : (
          <XCircle className="size-3 text-red-600 dark:text-red-400" />
        )}
        <span>{isGood ? (th ? 'สมบูรณ์' : 'Good') : isWarning ? (th ? 'บางส่วน' : 'Fair') : (th ? 'ไม่สมบูรณ์' : 'Bad')}</span>
      </span>
    );
  };

  // Group samples by deviceId
  const samplesByDevice = React.useMemo(() => {
    const map = new Map<string, DeviceTelemetrySample[]>();
    for (const sample of samples) {
      const list = map.get(sample.deviceId) || [];
      list.push(sample);
      map.set(sample.deviceId, list);
    }
    return map;
  }, [samples]);

  if (loading) {
    return (
      <main className="content">
        <div className="ops-content w-full space-y-5 animate-pulse">
          <div className="h-8 w-44 bg-muted rounded-lg" />
          <div className="space-y-2">
            <div className="h-8 w-64 bg-muted rounded" />
            <div className="h-4 w-96 bg-muted rounded" />
          </div>
          <div className="h-64 bg-card ring-1 ring-foreground/10 rounded-xl" />
          <div className="h-48 bg-card ring-1 ring-foreground/10 rounded-xl" />
        </div>
      </main>
    );
  }

  if (error || !gateway) {
    return (
      <main className="content">
        <div className="ops-content w-full space-y-5">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/gateways" className="hover:text-foreground">
              {th ? 'จัดการเกตเวย์' : 'Manage gateways'}
            </Link>
            <ChevronRight className="size-4" />
            <span>{th ? 'ไม่พบข้อมูล' : 'Not found'}</span>
          </nav>
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center space-y-3">
            <p className="text-destructive font-medium">{error || (th ? 'ไม่พบข้อมูลเกตเวย์นี้' : 'Gateway not found')}</p>
            <Button variant="outline" asChild>
              <Link href="/gateways">
                <ArrowLeft className="size-4 mr-2" />
                {th ? 'กลับหน้ารายการเกตเวย์' : 'Back to gateways'}
              </Link>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const externalGatewayCode = gateway.externalGatewayId || gateway.id;
  const subscribeTopic = config?.subscriptionTopic || gateway.subscriptionTopic || '—';
  const ackTopic = config?.ackTopic || '—';

  return (
    <main className="content">
      <div className="ops-content w-full space-y-5">
        {/* Back Button */}
        <div>
          <Link
            href="/gateways"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50"
          >
            <ArrowLeft className="size-4 shrink-0" />
            {th ? 'กลับไปหน้าจัดการเกตเวย์' : 'Back to gateways'}
          </Link>
        </div>

        {/* Formal Page Header */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{gateway.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {th
                ? 'ดูข้อมูลสถานะการเชื่อมต่อ อุปกรณ์ที่ผูกอยู่ และข้อมูลโทรมาตรสดของเกตเวย์'
                : 'View connection status, linked devices, and live gateway telemetry'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadData(true)}
              disabled={refreshing}
              className="h-9 gap-1.5"
            >
              <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{th ? 'รีเฟรชข้อมูล' : 'Refresh'}</span>
            </Button>
            {permissions.gatewayEdit && (
              <Button
                size="sm"
                onClick={() => setEditOpen(true)}
                className="h-9 gap-1.5"
              >
                <Settings className="size-3.5" />
                <span>{th ? 'ตั้งค่าเกตเวย์' : 'Configure Gateway'}</span>
              </Button>
            )}
          </div>
        </header>

        {/* Card 1: Unified Gateway Overview & MQTT Connection Card */}
        <Card>
          <CardHeader className="px-6 py-3.5 [.border-b]:pb-3.5 border-b border-border/60">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                {statusBadge(gateway.status)}
                <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                  <Clock className="size-3.5" />
                  {gateway.lastReceivedAt ? (
                    <span title={formatAppDateTime(gateway.lastReceivedAt, th ? 'th' : 'en')}>
                      {th ? 'รับข้อมูลล่าสุด: ' : 'Last received: '}
                      <TelemetryAgeLabel value={gateway.lastReceivedAt} locale={locale} />
                    </span>
                  ) : (
                    <span>{th ? 'รับข้อมูลล่าสุด: —' : 'Last received: —'}</span>
                  )}
                </span>
              </div>

              {externalGatewayCode && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="text-muted-foreground/80">{th ? 'รหัสเกตเวย์:' : 'Gateway ID:'}</span>
                  <CopyableId label="Gateway ID" id={externalGatewayCode} locale={th ? 'th' : 'en'} />
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="px-6 py-6">
            <dl className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <dt className="text-sm text-muted-foreground">{th ? 'ไซต์งาน' : 'Site'}</dt>
                <dd className="text-sm font-medium text-foreground">{gateway.siteName || '—'}</dd>
              </div>

              <div className="space-y-1">
                <dt className="text-sm text-muted-foreground">{th ? 'รหัสไซต์งาน' : 'Site ID'}</dt>
                <dd className="text-sm font-medium font-mono text-foreground">{gateway.siteCode || '—'}</dd>
              </div>

              <div className="space-y-1">
                <dt className="text-sm text-muted-foreground">{th ? 'กำลังผลิตปัจจุบัน' : 'Current Power'}</dt>
                <dd className="text-sm font-medium text-foreground">
                  {gateway.currentProductionKw == null
                    ? '—'
                    : `${formatFlexibleDecimal(gateway.currentProductionKw, { locale })} kW`}
                </dd>
              </div>

              <div className="space-y-1">
                <dt className="text-sm text-muted-foreground">{th ? 'จำนวนอุปกรณ์' : 'Devices'}</dt>
                <dd className="text-sm font-medium text-foreground">
                  {gateway.deviceCount ?? (config?.devices?.length ?? 0)}
                </dd>
              </div>

              <div className="space-y-1">
                <dt className="text-sm text-muted-foreground">{th ? 'รอบอ่านตั้งต้น' : 'Default Cadence'}</dt>
                <dd className="text-sm font-medium text-foreground">
                  {config?.pollingIntervalSeconds ?? gateway.pollingIntervalSeconds ?? 10}s
                </dd>
              </div>

              <div className="space-y-1">
                <dt className="text-sm text-muted-foreground">{th ? 'เวอร์ชันคอนฟิกเกตเวย์' : 'Configuration Version'}</dt>
                <dd className="text-sm font-medium text-foreground">
                  {config?.configuration ? (
                    <>
                      {th ? 'ต้องการ' : 'Desired'}: {config.configuration.desiredVersion ?? 0} ·{' '}
                      {th ? 'เผยแพร่' : 'Published'}: {config.configuration.publishedVersion ?? 0} ·{' '}
                      {th ? 'ใช้งาน' : 'Applied'}: {config.configuration.appliedVersion ?? 0}
                    </>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>

              <div className="space-y-1">
                <dt className="text-sm text-muted-foreground">{th ? 'ตัวกรอง Subscribe' : 'Subscription Topic'}</dt>
                <dd className="text-sm font-medium font-mono text-foreground break-all">
                  {subscribeTopic}
                </dd>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <dt className="text-sm text-muted-foreground">{th ? 'Topic ตอบรับ (dataAccept)' : 'ACK Topic'}</dt>
                <dd className="text-sm font-medium font-mono text-foreground break-all">
                  {ackTopic}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Connected Devices & Live Telemetry Cards */}
        {config?.devices && config.devices.length > 0 ? (
          <div className="space-y-5">
            {config.devices.map((device) => {
              const deviceSamples = samplesByDevice.get(device.id) || [];

              return (
                <Card key={device.id}>
                  <CardHeader className="px-6 py-3.5 [.border-b]:pb-3.5 border-b border-border/60">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <span>{device.name}</span>
                        {device.billingMeter && (
                          <Badge variant="outline" className="text-[11px] py-0 h-5 font-normal bg-primary/5 text-primary border-primary/20">
                            {th ? 'มิเตอร์คิดบิล' : 'Billing Meter'}
                          </Badge>
                        )}
                      </CardTitle>
                      <span className="font-mono text-xs rounded bg-muted/60 px-2 py-1 text-foreground border border-border/60">
                        {device.externalDeviceId || device.id}
                      </span>
                    </div>

                    <CardDescription className="text-xs flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {th ? 'รุ่นอุปกรณ์' : 'Model'}:{' '}
                        <strong className="text-foreground font-medium">
                          {device.profileConfig?.displayName || device.profileId || '—'}
                        </strong>
                      </span>
                      <span>
                        Publish Topic: <code className="font-mono text-foreground">{device.telemetryTopic}</code>
                      </span>
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="p-0">
                    {deviceSamples.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-muted/30 text-muted-foreground border-b border-border/60 uppercase text-[11px] font-medium tracking-wider">
                            <tr>
                              <th className="py-3 px-6">{th ? 'พารามิเตอร์' : 'Parameter'}</th>
                              <th className="py-3 px-6">{th ? 'ค่าที่อ่านได้' : 'Current Value'}</th>
                              <th className="py-3 px-6">{th ? 'เวลาที่อ่านได้' : 'Last Polled'}</th>
                              <th className="py-3 px-6">{th ? 'สถานะข้อมูล' : 'Quality'}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60">
                            {deviceSamples.map((sample) => (
                              <tr key={`${sample.deviceId}-${sample.tag}`} className="hover:bg-muted/20 transition-colors">
                                <td className="py-3 px-6">
                                  <div className="font-medium text-foreground">
                                    {getTelemetryTagLabel(sample.tag, locale)}
                                  </div>
                                  <div className="font-mono text-[11px] text-muted-foreground">{sample.tag}</div>
                                </td>
                                <td className="py-3 px-6 font-semibold text-foreground">
                                  <span className="text-sm">
                                    {formatFlexibleDecimal(sample.value, { locale })}
                                  </span>
                                  {sample.unit && <span className="ml-1 text-xs text-muted-foreground">{sample.unit}</span>}
                                </td>
                                <td className="py-3 px-6 text-muted-foreground">
                                  {sample.sourceTime ? (
                                    <div className="space-y-0.5">
                                      <div className="text-foreground">{formatAppDateTime(sample.sourceTime, th ? 'th' : 'en')}</div>
                                      <div className="text-[11px]">
                                        <TelemetryAgeLabel value={sample.sourceTime} locale={locale} />
                                      </div>
                                    </div>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                                <td className="py-3 px-6">
                                  {qualityBadge(sample.quality)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="py-8 px-6 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-1.5">
                        <Info className="size-5 text-muted-foreground/60" />
                        <p>{th ? 'ยังไม่มีข้อมูลโทรมาตรส่งมาจากอุปกรณ์นี้' : 'No telemetry samples received for this device yet'}</p>
                        <p className="text-xs text-muted-foreground/80">
                          {th ? 'ระบบจะแสดงค่าทันทีเมื่ออุปกรณ์เริ่มส่งข้อมูลผ่าน MQTT' : 'Data will populate automatically once received via MQTT'}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 px-6 text-center text-sm text-muted-foreground">
              {th ? 'ไม่มีอุปกรณ์เชื่อมต่ออยู่ในเกตเวย์นี้' : 'No connected devices in this gateway'}
            </CardContent>
          </Card>
        )}

        {/* Measurement Reconciliation Pairs (if any) */}
        {pairs.length > 0 && (
          <Card>
            <CardHeader className="px-6 py-3.5 [.border-b]:pb-3.5 border-b border-border/60">
              <CardTitle className="text-base font-semibold">
                {th ? 'คู่ตรวจเทียบความถูกต้องข้อมูล' : 'Data Reconciliation Pairs'}
              </CardTitle>
              <CardDescription className="text-xs">
                {th
                  ? 'เปรียบเทียบความสอดคล้องของค่าพลังงานและกำลังไฟระหว่างอุปกรณ์ในเกตเวย์'
                  : 'Compare energy and power consistency across devices in this gateway'}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-border/60 text-xs">
              {pairs.map((pair) => {
                const leftDevice = config?.devices?.find((d) => d.id === pair.leftDeviceId);
                const rightDevice = config?.devices?.find((d) => d.id === pair.rightDeviceId);
                const stateText = pair.latest?.state
                  ? stateLabels[pair.latest.state]?.[th ? 0 : 1] ?? pair.latest.state
                  : th ? 'ยังไม่มีหน้าต่างตรวจเทียบ' : 'No comparison window';
                return (
                  <div key={pair.id} className="px-6 py-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-foreground text-sm">
                        {leftDevice?.name ?? pair.leftDeviceId} · {pair.leftTag} ↔ {rightDevice?.name ?? pair.rightDeviceId} · {pair.rightTag}
                      </div>
                      <Badge
                        variant={
                          pair.latest?.state === 'matched' || pair.latest?.state === 'ok'
                            ? 'default'
                            : pair.latest?.state === 'mismatch'
                            ? 'destructive'
                            : 'secondary'
                        }
                        className="text-xs"
                      >
                        {stateText}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-muted-foreground text-xs">
                      <div>
                        <span>{th ? 'ประเภท' : 'Type'}: </span>
                        <strong className="text-foreground">{pair.kind === 'energy' ? (th ? 'พลังงาน' : 'Energy') : (th ? 'กำลังไฟ' : 'Power')}</strong>
                      </div>
                      <div>
                        <span>{th ? 'ความคลาดเคลื่อน' : 'Tolerance'}: </span>
                        <strong className="text-foreground font-mono">±{(pair.relativeTolerance * 100).toFixed(1)}%</strong>
                      </div>
                      <div>
                        <span>{th ? 'หน้าต่างเวลา' : 'Window'}: </span>
                        <strong className="text-foreground font-mono">{pair.windowSeconds}s</strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Edit Gateway Dialog */}
        {gateway && (
          <GatewayEditDialog
            gateway={gateway}
            open={editOpen}
            onOpenChange={setEditOpen}
            permissions={permissions}
            onSaved={() => setRevision((r) => r + 1)}
          />
        )}
      </div>
    </main>
  );
}
