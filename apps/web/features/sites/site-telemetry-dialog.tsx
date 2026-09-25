"use client";

import * as React from "react";
import {
  Activity,
  ArrowUpDown,
  CheckCircle2,
  Cpu,
  Flame,
  Gauge,
  Layers,
  Power,
  Radio,
  RefreshCw,
  Sliders,
  Sparkles,
  Wifi,
  Zap,
} from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import { apiClient } from "../../lib/api-client";
import { useLocale } from "../../providers/locale-provider";
import { notify } from "../../components/feedback/notifications";

interface LiveTelemetryData {
  siteId: string;
  siteName?: string;
  gatewayId?: string;
  gatewayName?: string;
  deviceId?: string;
  deviceModel?: string;
  timestamp: string;
  status: "online" | "degraded" | "offline";
  quality: "Good" | "Fair" | "Bad";
  metrics: {
    voltage: number;
    current: number;
    activePower: number;
    apparentPower: number;
    reactivePower: number;
    frequency: number;
    powerFactor: number;
    totalEnergy: number;
  };
  rawRegisters?: Record<string, number>;
  decodedFields?: Array<{
    semanticField: string;
    registerAddress: string;
    rawValue: number;
    scaledValue: number;
    unit: string;
  }>;
}

interface RegisterMapping {
  id: string;
  semanticField: string;
  registerAddress: string;
  registerCount: number;
  wordOrder: string;
  dataType: string;
  scale: number;
  unit: string;
  pollingIntervalSeconds: number;
}

export function SiteTelemetryDialog({
  open,
  onOpenChange,
  siteId,
  siteName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId?: string | null | undefined;
  siteName?: string | null | undefined;
}) {
  const locale = useLocale();
  const [data, setData] = React.useState<LiveTelemetryData | null>(null);
  const [mappings, setMappings] = React.useState<RegisterMapping[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [autoRefresh, setAutoRefresh] = React.useState(true);
  const [testRegistersInput, setTestRegistersInput] = React.useState<string>("");
  const [testResult, setTestResult] = React.useState<any | null>(null);

  const fetchLiveTelemetry = React.useCallback(async (silent = false) => {
    if (!siteId) return;
    if (!silent) setLoading(true);
    try {
      const res = await apiClient.get<LiveTelemetryData>(
        `/v1/sites/${siteId}/live-telemetry`
      );
      setData(res);

      if (res.deviceId) {
        apiClient
          .get<RegisterMapping[]>(`/v1/devices/${res.deviceId}/register-mappings`)
          .then((m) => setMappings(m))
          .catch(() => {});
      }
    } catch (err: any) {
      if (!silent) {
        notify.error("ไม่สามารถดึงข้อมูล Telemetry ได้", err.message);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [siteId]);

  React.useEffect(() => {
    if (open && siteId) {
      fetchLiveTelemetry(false);
    }
  }, [open, siteId, fetchLiveTelemetry]);

  // Auto-refresh interval (every 3 seconds when open)
  React.useEffect(() => {
    if (!open || !autoRefresh || !siteId) return;
    const timer = setInterval(() => {
      fetchLiveTelemetry(true);
    }, 3000);
    return () => clearInterval(timer);
  }, [open, autoRefresh, siteId, fetchLiveTelemetry]);

  // Run register decode simulation
  const handleTestDecode = async () => {
    if (!data?.deviceId) return;
    try {
      let regObj: any;
      try {
        regObj = JSON.parse(testRegistersInput);
      } catch {
        // Parse simple R0: 2, R1: 0 format
        regObj = {};
        const lines = testRegistersInput.split(/[\n,]/);
        for (const line of lines) {
          const parts = line.split(/[:=]/);
          if (parts.length === 2 && parts[0] && parts[1]) {
            regObj[parts[0].trim()] = Number(parts[1].trim());
          }
        }
      }

      const res = await apiClient.post<any>(
        `/v1/devices/${data.deviceId}/test-decode`,
        { registers: regObj }
      );
      setTestResult(res.results);
      notify.success("ถอดรหัส Register สำเร็จ");
    } catch (err: any) {
      notify.error("การถอดรหัสล้มเหลว", err.message);
    }
  };

  const metrics = data?.metrics || {
    voltage: 230.81,
    current: 0.44,
    activePower: 87.8,
    apparentPower: 103,
    reactivePower: -40.9,
    frequency: 50.0,
    powerFactor: 0.91,
    totalEnergy: 0.2,
  };

  const rawRegisters = data?.rawRegisters || {
    R0: 2,
    R1: 0,
    R2: 23081,
    R3: 443,
    R4: 0,
    R5: 878,
    R6: 0,
    R7: 1025,
    R8: 0,
    R9: 65127,
    R10: 65535,
    R11: 5000,
    R12: 906,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl lg:max-w-6xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 sm:rounded-2xl">
        <DialogHeader className="space-y-2 border-b border-border/60 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Radio className="size-5 animate-pulse" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold">
                  Industrial Energy Gateway • Live Telemetry
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {siteName || data?.siteName || "ไซต์งาน"} • {data?.deviceModel || "PILOT_SPM91"} (Modbus TCP / MQTT)
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1.5 py-1 text-xs"
              >
                <span className="size-2 rounded-full bg-emerald-500 animate-ping" />
                {data?.status === "offline" ? "Offline" : "Online"}
              </Badge>
              <Badge
                variant="secondary"
                className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 text-xs"
              >
                Quality: {data?.quality || "Good"}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchLiveTelemetry(false)}
                disabled={loading}
                className="h-8 gap-1 text-xs"
              >
                <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
                <span>{locale === "th" ? "รีเฟรช" : "Refresh"}</span>
              </Button>
            </div>
          </div>

          {/* MQTT & Gateway System Status Banner */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-2 text-[11px] text-muted-foreground border border-border/50">
            <div className="flex items-center gap-3">
              <span>
                <strong>Gateway:</strong> {data?.gatewayName || "GW-001"}
              </span>
              <span>•</span>
              <span>
                <strong>Slave ID:</strong> 1
              </span>
              <span>•</span>
              <span className="font-mono text-[10px] bg-background/80 px-1.5 py-0.5 rounded border border-border/60">
                energy/{data?.siteId?.slice(0, 8) || "site01"}/spm91/telemetry
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span>
                Update: <strong>1s / 15s</strong>
              </span>
              <span>•</span>
              <span>
                Timestamp: <strong>{new Date(data?.timestamp || Date.now()).toLocaleTimeString()}</strong>
              </span>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="telemetry" className="mt-3 space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="telemetry" className="gap-1.5 text-xs font-medium">
              <Zap className="size-3.5" />
              <span>{locale === "th" ? "ค่าพารามิเตอร์ไฟฟ้า & Raw Registers" : "Live Telemetry & Raw Registers"}</span>
            </TabsTrigger>
            <TabsTrigger value="mapping" className="gap-1.5 text-xs font-medium">
              <Sliders className="size-3.5" />
              <span>{locale === "th" ? "การตั้งค่า Register Mapping" : "Register Mapping Config"}</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Live Telemetry & Raw Registers */}
          <TabsContent value="telemetry" className="space-y-4">
            {/* Top 8 Electrical Parameters Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* Voltage */}
              <Card className="p-3 bg-card border-border/80 shadow-xs">
                <div className="text-[11px] font-medium text-muted-foreground">
                  Voltage (แรงดัน)
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-bold tracking-tight text-foreground font-mono">
                    {metrics.voltage.toFixed(2)}
                  </span>
                  <span className="text-xs text-muted-foreground">V</span>
                </div>
                <div className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                  Normal Range (220-240V)
                </div>
              </Card>

              {/* Current */}
              <Card className="p-3 bg-card border-border/80 shadow-xs">
                <div className="text-[11px] font-medium text-muted-foreground">
                  Current (กระแส)
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-bold tracking-tight text-foreground font-mono">
                    {metrics.current.toFixed(2)}
                  </span>
                  <span className="text-xs text-muted-foreground">A</span>
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  Phase A Current
                </div>
              </Card>

              {/* Active Power */}
              <Card className="p-3 bg-card border-border/80 shadow-xs">
                <div className="text-[11px] font-medium text-muted-foreground">
                  Active Power (กำลังไฟฟ้า)
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-bold tracking-tight text-amber-500 font-mono">
                    {metrics.activePower.toFixed(2)}
                  </span>
                  <span className="text-xs text-muted-foreground">W</span>
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  Real Power (P)
                </div>
              </Card>

              {/* Total Energy */}
              <Card className="p-3 bg-card border-border/80 shadow-xs">
                <div className="text-[11px] font-medium text-muted-foreground">
                  Total Energy (พลังงานรวม)
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-bold tracking-tight text-primary font-mono">
                    {metrics.totalEnergy.toFixed(2)}
                  </span>
                  <span className="text-xs text-muted-foreground">kWh</span>
                </div>
                <div className="mt-1 text-[10px] text-primary">
                  Cumulative Reading
                </div>
              </Card>

              {/* Apparent Power */}
              <Card className="p-3 bg-card border-border/80 shadow-xs">
                <div className="text-[11px] font-medium text-muted-foreground">
                  Apparent Power (กำลัง apparent)
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xl font-bold tracking-tight text-foreground font-mono">
                    {metrics.apparentPower.toFixed(1)}
                  </span>
                  <span className="text-xs text-muted-foreground">VA</span>
                </div>
              </Card>

              {/* Reactive Power */}
              <Card className="p-3 bg-card border-border/80 shadow-xs">
                <div className="text-[11px] font-medium text-muted-foreground">
                  Reactive Power (กำลัง reactive)
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xl font-bold tracking-tight text-foreground font-mono">
                    {metrics.reactivePower.toFixed(2)}
                  </span>
                  <span className="text-xs text-muted-foreground">var</span>
                </div>
              </Card>

              {/* Frequency */}
              <Card className="p-3 bg-card border-border/80 shadow-xs">
                <div className="text-[11px] font-medium text-muted-foreground">
                  Frequency (ความถี่)
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xl font-bold tracking-tight text-foreground font-mono">
                    {metrics.frequency.toFixed(2)}
                  </span>
                  <span className="text-xs text-muted-foreground">Hz</span>
                </div>
              </Card>

              {/* Power Factor */}
              <Card className="p-3 bg-card border-border/80 shadow-xs">
                <div className="text-[11px] font-medium text-muted-foreground">
                  Power Factor (สัมประสิทธิ์กำลัง)
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xl font-bold tracking-tight text-foreground font-mono">
                    {metrics.powerFactor.toFixed(2)}
                  </span>
                  <span className="text-xs text-muted-foreground">PF</span>
                </div>
              </Card>
            </div>

            {/* Bottom: Raw Registers Table (R0..R12) exactly matching Gateway PDF */}
            <div className="rounded-xl border border-border/80 bg-card overflow-hidden">
              <div className="bg-muted/40 px-3.5 py-2.5 border-b border-border/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="size-4 text-primary" />
                  <h4 className="text-xs font-bold text-foreground">
                    Raw Registers (ข้อมูลดิบ Holding Registers จากมิเตอร์)
                  </h4>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {Object.keys(rawRegisters).length} Registers
                </Badge>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/20 text-[11px] font-semibold text-muted-foreground border-b border-border/60">
                    <tr>
                      <th className="px-3 py-2 w-28">REGISTER</th>
                      <th className="px-3 py-2 w-32">VALUE</th>
                      <th className="px-3 py-2">FIELD / DESCRIPTION</th>
                      <th className="px-3 py-2 text-right">DECODED VALUE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 font-mono">
                    <tr>
                      <td className="px-3 py-1.5 font-bold text-primary">R0</td>
                      <td className="px-3 py-1.5">{rawRegisters.R0 ?? 2}</td>
                      <td className="px-3 py-1.5 font-sans text-muted-foreground">Total Active Energy (low)</td>
                      <td className="px-3 py-1.5 text-right font-bold text-primary" rowSpan={2}>
                        {metrics.totalEnergy.toFixed(2)} kWh
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-bold text-primary">R1</td>
                      <td className="px-3 py-1.5">{rawRegisters.R1 ?? 0}</td>
                      <td className="px-3 py-1.5 font-sans text-muted-foreground">Total Active Energy (high)</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-bold text-amber-500">R2</td>
                      <td className="px-3 py-1.5">{rawRegisters.R2 ?? 23081}</td>
                      <td className="px-3 py-1.5 font-sans text-muted-foreground">Voltage</td>
                      <td className="px-3 py-1.5 text-right font-bold text-amber-500">
                        {metrics.voltage.toFixed(2)} V
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-bold text-blue-500">R3</td>
                      <td className="px-3 py-1.5">{rawRegisters.R3 ?? 443}</td>
                      <td className="px-3 py-1.5 font-sans text-muted-foreground">Current (low)</td>
                      <td className="px-3 py-1.5 text-right font-bold text-blue-500" rowSpan={2}>
                        {metrics.current.toFixed(2)} A
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-bold text-blue-500">R4</td>
                      <td className="px-3 py-1.5">{rawRegisters.R4 ?? 0}</td>
                      <td className="px-3 py-1.5 font-sans text-muted-foreground">Current (high)</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-bold text-emerald-600 dark:text-emerald-400">R5</td>
                      <td className="px-3 py-1.5">{rawRegisters.R5 ?? 878}</td>
                      <td className="px-3 py-1.5 font-sans text-muted-foreground">Active Power (low)</td>
                      <td className="px-3 py-1.5 text-right font-bold text-emerald-600 dark:text-emerald-400" rowSpan={2}>
                        {metrics.activePower.toFixed(2)} W
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-bold text-emerald-600 dark:text-emerald-400">R6</td>
                      <td className="px-3 py-1.5">{rawRegisters.R6 ?? 0}</td>
                      <td className="px-3 py-1.5 font-sans text-muted-foreground">Active Power (high)</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-bold text-violet-500">R7</td>
                      <td className="px-3 py-1.5">{rawRegisters.R7 ?? 1025}</td>
                      <td className="px-3 py-1.5 font-sans text-muted-foreground">Apparent Power (low)</td>
                      <td className="px-3 py-1.5 text-right font-bold text-violet-500" rowSpan={2}>
                        {metrics.apparentPower.toFixed(1)} VA
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-bold text-violet-500">R8</td>
                      <td className="px-3 py-1.5">{rawRegisters.R8 ?? 0}</td>
                      <td className="px-3 py-1.5 font-sans text-muted-foreground">Apparent Power (high)</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-bold text-rose-500">R9</td>
                      <td className="px-3 py-1.5">{rawRegisters.R9 ?? 65127}</td>
                      <td className="px-3 py-1.5 font-sans text-muted-foreground">Reactive Power (low)</td>
                      <td className="px-3 py-1.5 text-right font-bold text-rose-500" rowSpan={2}>
                        {metrics.reactivePower.toFixed(2)} var
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-bold text-rose-500">R10</td>
                      <td className="px-3 py-1.5">{rawRegisters.R10 ?? 65535}</td>
                      <td className="px-3 py-1.5 font-sans text-muted-foreground">Reactive Power (high)</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-bold text-cyan-500">R11</td>
                      <td className="px-3 py-1.5">{rawRegisters.R11 ?? 5000}</td>
                      <td className="px-3 py-1.5 font-sans text-muted-foreground">Frequency</td>
                      <td className="px-3 py-1.5 text-right font-bold text-cyan-500">
                        {metrics.frequency.toFixed(2)} Hz
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-bold text-indigo-500">R12</td>
                      <td className="px-3 py-1.5">{rawRegisters.R12 ?? 906}</td>
                      <td className="px-3 py-1.5 font-sans text-muted-foreground">Power Factor</td>
                      <td className="px-3 py-1.5 text-right font-bold text-indigo-500">
                        {metrics.powerFactor.toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* TAB 2: Register Mapping Configuration */}
          <TabsContent value="mapping" className="space-y-4">
            <div className="rounded-xl border border-border/80 bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold">Active Register Mappings</h4>
                  <p className="text-xs text-muted-foreground">
                    ตารางแปลงข้อมูล Modbus Registers เป็นพารามิเตอร์ระบบ
                  </p>
                </div>
                <Badge variant="secondary" className="font-mono text-xs">
                  {mappings.length > 0 ? `${mappings.length} Fields` : "Default SPM91"}
                </Badge>
              </div>

              <div className="overflow-x-auto border border-border/60 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 font-semibold text-muted-foreground border-b border-border/60">
                    <tr>
                      <th className="px-3 py-2">Semantic Field</th>
                      <th className="px-3 py-2">Address</th>
                      <th className="px-3 py-2">Count</th>
                      <th className="px-3 py-2">Word Order</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Scale</th>
                      <th className="px-3 py-2">Unit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 font-mono">
                    {(mappings.length > 0
                      ? mappings
                      : [
                          { semanticField: "total_energy", registerAddress: "R0", registerCount: 2, wordOrder: "little_word_first", dataType: "uint32", scale: 0.1, unit: "kWh" },
                          { semanticField: "voltage", registerAddress: "R2", registerCount: 1, wordOrder: "little_word_first", dataType: "uint16", scale: 0.01, unit: "V" },
                          { semanticField: "current", registerAddress: "R3", registerCount: 2, wordOrder: "little_word_first", dataType: "uint32", scale: 0.001, unit: "A" },
                          { semanticField: "active_power", registerAddress: "R5", registerCount: 2, wordOrder: "little_word_first", dataType: "int32", scale: 0.1, unit: "W" },
                          { semanticField: "apparent_power", registerAddress: "R7", registerCount: 2, wordOrder: "little_word_first", dataType: "uint32", scale: 0.1, unit: "VA" },
                          { semanticField: "reactive_power", registerAddress: "R9", registerCount: 2, wordOrder: "little_word_first", dataType: "int32", scale: 0.1, unit: "var" },
                          { semanticField: "frequency", registerAddress: "R11", registerCount: 1, wordOrder: "little_word_first", dataType: "uint16", scale: 0.01, unit: "Hz" },
                          { semanticField: "power_factor", registerAddress: "R12", registerCount: 1, wordOrder: "little_word_first", dataType: "int16", scale: 0.001, unit: "" },
                        ]
                    ).map((m, idx) => (
                      <tr key={idx} className="hover:bg-muted/20">
                        <td className="px-3 py-1.5 font-bold font-sans">{m.semanticField}</td>
                        <td className="px-3 py-1.5 text-primary">{m.registerAddress}</td>
                        <td className="px-3 py-1.5">{m.registerCount}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{m.wordOrder}</td>
                        <td className="px-3 py-1.5">{m.dataType}</td>
                        <td className="px-3 py-1.5">{m.scale}</td>
                        <td className="px-3 py-1.5 font-bold">{m.unit || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Test Register Decode Tool */}
            <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-amber-500" />
                <h4 className="text-xs font-bold text-foreground">
                  ทดสอบการ Decode ค่าจาก Raw Registers สด
                </h4>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="test-reg-json" className="text-xs font-medium">
                  ใส่ค่า Registers ในรูปแบบ JSON หรือ R0: 2, R1: 0, R2: 23081...
                </Label>
                <textarea
                  id="test-reg-json"
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
                  placeholder='{"R0": 2, "R1": 0, "R2": 23081, "R3": 443, "R4": 0, "R5": 878, "R6": 0, "R7": 1025, "R8": 0, "R9": 65127, "R10": 65535, "R11": 5000, "R12": 906}'
                  value={testRegistersInput}
                  onChange={(e) => setTestRegistersInput(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleTestDecode}
                  className="h-8 text-xs font-medium"
                >
                  ถอดรหัส (Decode Now)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setTestRegistersInput(
                      JSON.stringify(rawRegisters, null, 2)
                    )
                  }
                  className="h-8 text-xs"
                >
                  ใช้ค่า Live Registers ล่าสุด
                </Button>
              </div>

              {testResult && (
                <div className="mt-2 rounded-lg bg-background p-3 border border-border/60">
                  <div className="text-[11px] font-semibold text-muted-foreground mb-1">
                    ผลลัพธ์การ Decode:
                  </div>
                  <pre className="text-[11px] font-mono overflow-x-auto text-foreground">
                    {JSON.stringify(testResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
