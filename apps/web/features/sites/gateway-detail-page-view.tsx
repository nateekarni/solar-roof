'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronRight, ArrowLeft, RefreshCw, Settings, Clock, CheckCircle2, AlertTriangle, XCircle, Info, Copy, Check, Braces } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { formatAppDateTime } from '../../lib/date-format';
import { formatFlexibleDecimal } from '../../lib/number-format';
import { TelemetryAgeLabel } from '../shared/telemetry-age-label';
import { apiClient } from '../../lib/api-client';
import { useLocale } from '../../providers/locale-provider';
import { useSessionUser } from '../../providers/session-user-provider';
import { gatewayPermissions } from './gateway-permissions';
import {canManageGatewayOnboarding} from './gateway-permissions';
import {GatewayCredentialRecovery} from './gateway-credential-recovery';
import { GatewayEditDialog } from './gateway-edit-dialog';
import {GatewayConfigProposals} from './gateway-config-proposals';
import {GatewayOperationalStatus} from './gateway-operational-status';
import {canCorrectInitialConfig,GatewayInitialConfigCorrection} from './gateway-initial-config-correction';
import type {CorrectInitialGatewayConfigRequest,GatewaySyncState} from '@solar/api-contracts';
export {GatewayOperationalStatus} from './gateway-operational-status';
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

export type DeviceTelemetryPayload = {
  id: string;
  deviceId: string;
  messageId: string;
  lotNumber: number;
  sequence: number;
  polledAt: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  payload: unknown;
  sampleCount: number;
  quality: string;
  communication: string;
  pollGroup: string;
};

function TelemetryQualityBadge({quality,locale}:{quality:string;locale:'th'|'en'}) {
  const q=(quality||'').toLowerCase(),isGood=['good','complete','ok'].includes(q),isWarning=['fair','partial','mixed'].includes(q),th=locale==='th';
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${isGood?'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400':isWarning?'bg-amber-500/10 text-amber-700 dark:text-amber-400':'bg-red-500/10 text-red-700 dark:text-red-400'}`}>
    {isGood?<CheckCircle2 className="size-3"/>:isWarning?<AlertTriangle className="size-3"/>:<XCircle className="size-3"/>}
    <span>{isGood?(th?'สมบูรณ์':'Good'):isWarning?(th?'บางส่วน':'Fair'):(th?'ไม่สมบูรณ์':'Bad')}</span>
  </span>;
}

export function GatewayTelemetryPayloadTable({payloads,locale,onSelect}:{payloads:DeviceTelemetryPayload[];locale:'th'|'en';onSelect:(payload:DeviceTelemetryPayload)=>void}) {
  const th=locale==='th';
  return <div className="overflow-x-auto"><table className="w-full text-xs text-left">
    <thead className="bg-muted/30 text-muted-foreground border-b border-border/60 uppercase text-[11px] font-medium tracking-wider"><tr>
      <th className="py-3 px-6">{th?'เวลาที่รับ':'Received'}</th><th className="py-3 px-6">Message ID</th><th className="py-3 px-6">{th?'ชุดข้อมูล':'Payload'}</th><th className="py-3 px-6">{th?'สถานะข้อมูล':'Quality'}</th><th className="py-3 px-6 text-right">{th?'รายละเอียด':'Details'}</th>
    </tr></thead>
    <tbody className="divide-y divide-border/60">{payloads.map(payload=><tr key={payload.id} className="cursor-pointer hover:bg-muted/20 transition-colors" onClick={()=>onSelect(payload)}>
      <td className="py-3 px-6 text-muted-foreground">{payload.receivedAt?<div className="space-y-0.5"><div className="text-foreground">{formatAppDateTime(payload.receivedAt,locale)}</div><div className="text-[11px]"><TelemetryAgeLabel value={payload.receivedAt} locale={locale}/></div></div>:'—'}</td>
      <td className="py-3 px-6"><div className="font-mono text-foreground break-all">{payload.messageId}</div><div className="text-[11px] text-muted-foreground">Lot {payload.lotNumber} · Seq {payload.sequence}</div></td>
      <td className="py-3 px-6"><div className="font-medium text-foreground">{payload.pollGroup||'—'}</div><div className="text-[11px] text-muted-foreground">{payload.sampleCount} {th?'ค่า':'values'}</div></td>
      <td className="py-3 px-6"><TelemetryQualityBadge quality={payload.quality} locale={locale}/></td>
      <td className="py-3 px-6 text-right"><Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={event=>{event.stopPropagation();onSelect(payload);}} aria-label={th?`ดูรายละเอียดข้อมูล ${payload.messageId}`:`View payload ${payload.messageId}`}><Braces className="size-3.5"/>{th?'ดู JSON':'View JSON'}</Button></td>
    </tr>)}</tbody>
  </table></div>;
}

export function GatewayTelemetryPayloadJson({payload,deviceName,locale,showHeading=true}:{payload:DeviceTelemetryPayload;deviceName:string;locale:'th'|'en';showHeading?:boolean}) {
  const th=locale==='th';
  return <>{showHeading?<header><h2 className="font-heading text-base font-semibold">{th?'รายละเอียด JSON ที่เกตเวย์ส่ง':'Gateway payload JSON'}</h2><p className="text-sm text-muted-foreground">{deviceName} · {payload.messageId}</p></header>:null}
    <pre className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-muted/40 p-4 text-xs leading-relaxed text-foreground"><code>{JSON.stringify(payload.payload,null,2)}</code></pre></>;
}

export function GatewayTelemetryPayloadDialog({payload,deviceName,locale,open,onOpenChange}:{payload:DeviceTelemetryPayload|null;deviceName:string;locale:'th'|'en';open:boolean;onOpenChange:(open:boolean)=>void}) {
  const th=locale==='th';
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
    {payload?<><DialogHeader><DialogTitle>{th?'รายละเอียด JSON ที่เกตเวย์ส่ง':'Gateway payload JSON'}</DialogTitle><DialogDescription>{deviceName} · {payload.messageId}</DialogDescription></DialogHeader><GatewayTelemetryPayloadJson payload={payload} deviceName={deviceName} locale={locale} showHeading={false}/></>:null}
  </DialogContent></Dialog>;
}

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
  const canRecoverCredential=canManageGatewayOnboarding(user);

  const [gateway, setGateway] = React.useState<GatewayRow | null>(null);
  const [config, setConfig] = React.useState<GatewayConfig | null>(null);
  const [payloads,setPayloads]=React.useState<DeviceTelemetryPayload[]>([]);
  const [selectedPayload,setSelectedPayload]=React.useState<{deviceName:string;payload:DeviceTelemetryPayload}|null>(null);
  const [pairs, setPairs] = React.useState<Pair[]>([]);
  const [syncState,setSyncState]=React.useState<GatewaySyncState|null>(null);
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
      const [telemetryRes, configRes, pairsRes,syncRes] = await Promise.all([
        apiClient.get<{ gateway: GatewayRow; samples: DeviceTelemetrySample[]; payloads:DeviceTelemetryPayload[] }>(`/v1/gateways/${gatewayId}/telemetry`),
        apiClient.get<GatewayConfig>(`/v1/gateways/${gatewayId}/configuration`).catch(() => null),
        apiClient.get<Pair[]>(`/v1/gateways/${gatewayId}/comparisons`).catch(() => []),
        canRecoverCredential?apiClient.get<GatewaySyncState>(`/v1/gateways/${gatewayId}/sync-state`).catch(()=>null):Promise.resolve(null),
      ]);

      setGateway(telemetryRes.gateway);
      setPayloads(telemetryRes.payloads||[]);
      if (configRes) setConfig(configRes);
      if (pairsRes) setPairs(pairsRes);
      setSyncState(syncRes);
    } catch (err) {
      setError((err as Error).message || 'Unable to load gateway details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [gatewayId,canRecoverCredential]);

  const correctInitial=React.useCallback(async(request:CorrectInitialGatewayConfigRequest)=>{
    await apiClient.post(`/v1/gateways/${encodeURIComponent(gatewayId)}/configuration/correct`,request);
    await loadData(true);
  },[gatewayId,loadData]);

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

  const payloadsByDevice=React.useMemo(()=>{const map=new Map<string,DeviceTelemetryPayload[]>();for(const payload of payloads){const list=map.get(payload.deviceId)||[];list.push(payload);map.set(payload.deviceId,list);}return map;},[payloads]);

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
            {canRecoverCredential&&<GatewayCredentialRecovery gatewayId={gateway.id} locale={locale}/>}
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
                <GatewayOperationalStatus gateway={gateway} locale={locale}/>
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

        {canRecoverCredential&&<GatewayConfigProposals gatewayId={gateway.id} canManage={canRecoverCredential} initialCorrection={syncState&&canCorrectInitialConfig(syncState)?<GatewayInitialConfigCorrection gatewayId={gateway.id} syncState={syncState} locale={locale} onCorrect={correctInitial}/>:null}/>}

        {/* Connected Devices & Live Telemetry Cards */}
        {config?.devices && config.devices.length > 0 ? (
          <div className="space-y-5">
            {config.devices.map((device) => {
              const devicePayloads=payloadsByDevice.get(device.id)||[];

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
                    {devicePayloads.length > 0 ? (
                      <GatewayTelemetryPayloadTable payloads={devicePayloads} locale={locale} onSelect={payload=>setSelectedPayload({deviceName:device.name,payload})}/>
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

        <GatewayTelemetryPayloadDialog payload={selectedPayload?.payload??null} deviceName={selectedPayload?.deviceName??''} locale={locale} open={Boolean(selectedPayload)} onOpenChange={open=>{if(!open)setSelectedPayload(null);}}/>

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
