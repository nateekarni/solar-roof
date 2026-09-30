"use client";

import * as React from "react";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { apiClient } from "../../lib/api-client";

interface LiveTelemetryData {
  siteId: string; siteName?: string; gatewayName?: string; endpoint?: string; deviceId: string; deviceModel?: string;
  timestamp: string; sourceTime: string; serverReceivedAt: string; status: string; quality: string;
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
  const [data, setData] = React.useState<LiveTelemetryData | null>(null);
  const [mappings, setMappings] = React.useState<RegisterMapping[]>([]);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const fetchData = React.useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const result = await apiClient.get<LiveTelemetryData | null>(`/v1/sites/${siteId}/live-telemetry`);
      setData(result); setError('');
      setMappings(result?.deviceId ? await apiClient.get<RegisterMapping[]>(`/v1/devices/${result.deviceId}/register-mappings`) : []);
    } catch (failure) { setData(null); setMappings([]); setError(failure instanceof Error ? failure.message : 'Unable to load telemetry'); }
    finally { setLoading(false); }
  }, [siteId]);
  React.useEffect(() => {
    setData(null); setMappings([]); setError('');
    if (!open || !siteId) return;
    void fetchData();
    const refresh = () => { if (document.visibilityState === 'visible' && navigator.onLine) void fetchData(); };
    const timer = setInterval(refresh, 10_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [open, siteId, fetchData]);
  const ageSeconds = data ? Math.max(0, Math.floor((Date.now() - new Date(data.sourceTime).getTime()) / 1000)) : null;
  const realtime = Boolean(data && ageSeconds !== null && ageSeconds <= 120 && data.status === 'online');
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
        <h3 className="font-semibold">Raw Registers</h3>
        {data.rawRegisters && Object.keys(data.rawRegisters).length ? <pre className="max-h-56 overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(data.rawRegisters, null, 2)}</pre> : <p className="text-sm text-muted-foreground">ไม่มี Raw Registers ในข้อมูลนี้</p>}
        <h3 className="font-semibold">Current Register Mapping</h3>
        {mappings.length ? <table className="w-full text-sm"><thead><tr><th>Field</th><th>Address</th><th>Type</th><th>Scale</th><th>Unit</th></tr></thead>
          <tbody>{mappings.map(mapping => <tr key={mapping.id}><td>{mapping.semanticField}</td><td>{mapping.registerAddress}</td><td>{mapping.dataType}</td><td>{mapping.scale}</td><td>{mapping.unit}</td></tr>)}</tbody>
        </table> : <p className="text-sm text-muted-foreground">ยังไม่มี Register Mapping ที่ตั้งค่าไว้</p>}
      </>}
    </DialogContent>
  </Dialog>;
}
