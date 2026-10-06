"use client";

import type { CanonicalField, PayloadConfig } from "./payload-contracts";
import { PayloadConnectionCard } from "./payload-connection-card";
import * as React from "react";
import {DataTable} from "../../components/ui/data-table";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { apiClient } from "../../lib/api-client";

interface LiveTelemetryData {
  siteId: string; siteName?: string; gatewayName?: string; endpoint?: string; deviceId: string; deviceModel?: string;
  timestamp: string; sourceTime: string; serverReceivedAt: string; status: string; quality: string;
  canonicalFields?: CanonicalField[];
  metrics: Record<string, number | null>; rawRegisters?: Record<string, number>;
}
interface RegisterMapping { id: string; semanticField: string; registerAddress: string; registerCount: number; dataType: string; scale: number; unit: string; }
const fields = [
  ['voltage', 'Voltage', 'V'], ['current', 'Current', 'A'], ['activePower', 'Active Power', 'W'],
  ['totalEnergy', 'Cumulative Energy', 'kWh'], ['apparentPower', 'Apparent Power', 'VA'],
  ['reactivePower', 'Reactive Power', 'var'], ['frequency', 'Frequency', 'Hz'], ['powerFactor', 'Power Factor', ''],
];

export function SiteTelemetryDialog({ open, onOpenChange, siteId, siteName }: {
  open: boolean; onOpenChange: (open: boolean) => void; siteId?: string | null | undefined; siteName?: string | null | undefined;
}) {
  const [payloadConfig, setPayloadConfig] = React.useState<PayloadConfig | null>(null);
  const [configError, setConfigError] = React.useState('');
  const [data, setData] = React.useState<LiveTelemetryData | null>(null);
  const [mappings, setMappings] = React.useState<RegisterMapping[]>([]);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const fetchData = React.useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const loadedConfig = await apiClient.get<PayloadConfig | null>(`/v1/sites/${siteId}/payload-config`).catch(failure => { setConfigError(failure instanceof Error ? failure.message : "โหลด Payload config ไม่สำเร็จ"); return null; });
      const config = loadedConfig?.externalSiteId && loadedConfig.externalGatewayId ? loadedConfig : null;
      setPayloadConfig(config); if(config) setConfigError('');
      const result = await apiClient.get<LiveTelemetryData | null>(`/v1/sites/${siteId}/live-telemetry`);
      setData(result); setError('');
      setMappings(!config && result?.deviceId ? await apiClient.get<RegisterMapping[]>(`/v1/devices/${result.deviceId}/register-mappings`) : []);
    } catch (failure) { setData(null); setMappings([]); setError(failure instanceof Error ? failure.message : 'Unable to load telemetry'); }
    finally { setLoading(false); }
  }, [siteId]);
  React.useEffect(() => {
    setData(null); setMappings([]); setError(''); setPayloadConfig(null); setConfigError('');
    if (!open || !siteId) return;
    void fetchData();
    const refresh = () => { if (document.visibilityState === 'visible' && navigator.onLine) void fetchData(); };
    const timer = setInterval(refresh, 10_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [open, siteId, fetchData]);
  const ageSeconds = data ? Math.max(0, Math.floor((Date.now() - new Date(data.sourceTime).getTime()) / 1000)) : null;
  const realtime = Boolean(data && ageSeconds !== null && ageSeconds <= 120 && data.status === 'online' && ['good', 'valid'].includes(data.quality.toLowerCase()));
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{siteName || data?.siteName || 'Site'} · MQTT Telemetry</DialogTitle>
        <DialogDescription>ข้อมูลจาก Gateway · อัปเดตหน้าจอทุก 10 วินาที</DialogDescription>
      </DialogHeader>
      <div className="flex items-center justify-between gap-3">
        <span>{data ? realtime ? 'Realtime' : 'Stale / Offline' : 'ยังไม่มีข้อมูลจากอุปกรณ์'}</span>
        <Button variant="outline" disabled={loading} onClick={() => void fetchData()}>{loading ? 'กำลังโหลด…' : 'รีเฟรช'}</Button>
      </div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {configError && <p role="alert" className="text-destructive">{configError}</p>}
      {payloadConfig && <PayloadConnectionCard config={payloadConfig} onRefresh={() => void fetchData()}/>}
      {(payloadConfig || data?.canonicalFields?.length) && <><h3 className="font-semibold">Canonical fields · คุณภาพแยกจากอายุข้อมูล</h3><DataTable data={data?.canonicalFields ?? []} getRowId={r => `${r.deviceId}-${r.tag}`} searchKey="tag" columns={[{accessorKey:"deviceName",header:"อุปกรณ์"},{accessorKey:"tag",header:"Tag"},{accessorKey:"value",header:"Value"},{accessorKey:"unit",header:"Unit"},{accessorKey:"rawValue",header:"Raw value"},{accessorKey:"rawUnit",header:"Raw unit"},{accessorKey:"pollGroup",header:"Group"},{accessorKey:"polledAt",header:"เวลา Poll"},{accessorKey:"receivedAt",header:"เวลารับ"},{accessorKey:"quality",header:"Quality"},{accessorKey:"communication",header:"Communication"},{accessorKey:"ageSeconds",header:"อายุ (s)"},{accessorKey:"stale",header:"Freshness",cell:({row}) => row.original.stale ? "Stale" : "Fresh"},{accessorKey:"profileId",header:"Profile"},{accessorKey:"profileVersion",header:"Version"}]}/></>}
      {data && <>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div><dt>Gateway</dt><dd>{data.gatewayName || '—'}</dd></div>
          <div><dt>MQTT Topic</dt><dd className="font-mono">{data.endpoint || '—'}</dd></div>
          <div><dt>เวลาอุปกรณ์ (Source)</dt><dd>{new Date(data.sourceTime).toLocaleString()} · {ageSeconds}s ago</dd></div>
          <div><dt>เวลารับข้อมูล (Server)</dt><dd>{new Date(data.serverReceivedAt).toLocaleString()}</dd></div>
        </dl>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {fields.map(([key, label, unit]) => <div key={key} className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-2 text-xl font-semibold">{key && data.metrics[key] != null ? data.metrics[key]!.toFixed(2) : '—'} <span className="text-xs">{unit}</span></div>
          </div>)}
        </div>
        {!payloadConfig && <>
        <h3 className="font-semibold">Raw Registers</h3>
        {data.rawRegisters && Object.keys(data.rawRegisters).length ? <pre className="max-h-56 overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(data.rawRegisters, null, 2)}</pre> : <p className="text-sm text-muted-foreground">ไม่มี Raw Registers ในข้อมูลนี้</p>}
        <h3 className="font-semibold">Current Register Mapping</h3>
        <DataTable data={mappings} getRowId={row=>row.id} columns={[{accessorKey:'semanticField',header:'Field'},{accessorKey:'registerAddress',header:'Address'},{accessorKey:'dataType',header:'Type'},{accessorKey:'scale',header:'Scale'},{accessorKey:'unit',header:'Unit'}]}/>

      </>}
      </>}
    </DialogContent>
  </Dialog>;
}
