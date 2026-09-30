"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Edit,
  Radio,
  Wifi,
  XCircle,
} from "lucide-react";
import { notify } from "../../components/feedback/notifications";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { useAuth } from "../../stores/auth-store";
import { apiClient } from "../../lib/api-client";
import { useLocale, useT } from "../../providers/locale-provider";

const editSiteSchema = z.object({
  name: z.string().min(2, "ชื่อไซต์งานต้องมีอย่างน้อย 2 ตัวอักษร"),
  schoolName: z.string().min(1, "กรุณาเลือกโรงเรียนสังกัด"),
  capacityMwp: z.number().min(0.01, "กำลังติดตั้งต้องมากกว่า 0"),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  status: z.string().optional(),

  gatewayName: z.string().min(2, "กรุณาระบุชื่อหรือรหัส Gateway"),
  protocol: z.literal("mqtt"),
  deviceId: z.string().optional(),
  pollingIntervalSeconds: z.number().int().min(1).max(86400),
  voltageMin: z.number(), voltageMax: z.number(), currentMax: z.number(),
  alertSeverity: z.enum(["info", "warning", "critical"]),
  endpoint: z.string().min(3, "กรุณาระบุ Endpoint หรือ MQTT Topic"),
  deviceModel: z.string().optional(),
  deviceSerial: z.string().min(2, "กรุณาระบุรหัสซีเรียลของมิเตอร์"),
});

type EditSiteFormValues = z.infer<typeof editSiteSchema>;

interface SchoolOption {
  id: string;
  name: string;
}

export function SiteEditDialog({
  open,
  onOpenChange,
  siteId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string | null;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const t = useT();
  const locale = useLocale();
  const [meterPresets, setMeterPresets] = React.useState<Array<{ id: string; model: string; registers: unknown[] }>>([]);
  const [devices, setDevices] = React.useState<Array<{ id: string; name: string; model: string; serialNumber: string }>>([]);
  const [newDevice, setNewDevice] = React.useState({ name: "", model: "", serialNumber: "", slaveId: 2, meterPresetId: "" });
  const [addingDevice, setAddingDevice] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [fetching, setFetching] = React.useState(false);

  const [pingStatus, setPingStatus] = React.useState<"idle" | "testing" | "online" | "offline">("idle");
  const [pingMessage, setPingMessage] = React.useState("");
  const [pingLatency, setPingLatency] = React.useState<number | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<EditSiteFormValues>({
    resolver: zodResolver(editSiteSchema),
    defaultValues: {
      name: "",
      pollingIntervalSeconds: 10, voltageMin: 200, voltageMax: 250, currentMax: 100, alertSeverity: "warning",
      schoolName: "",
      capacityMwp: 0.5,
      latitude: 13.7563,
      longitude: 100.5018,
      status: "online",
      gatewayName: "",
      protocol: "mqtt",
      endpoint: "",
      deviceModel: "PM5350",
      deviceSerial: "",
    },
  });

  const formValues = watch();

  React.useEffect(() => {
    if (open && siteId) {
      setFetching(true);
      apiClient.get<typeof meterPresets>("/v1/meter-presets").then(setMeterPresets).catch(() => setMeterPresets([]));
      apiClient.get<typeof devices>(`/v1/sites/${siteId}/devices`).then(setDevices).catch(() => setDevices([]));
      setPingStatus("idle");
      setPingMessage("");
      setPingLatency(null);

      apiClient.get<any>(`/v1/sites/${siteId}`)
        .then((siteData) => {
          if (siteData) {
            reset({
              name: siteData.name || "",
              deviceId: siteData.deviceId,
              pollingIntervalSeconds: Number(siteData.pollingIntervalSeconds ?? 10),
              voltageMin: Number(siteData.alertRules?.voltageMin ?? 200), voltageMax: Number(siteData.alertRules?.voltageMax ?? 250), currentMax: Number(siteData.alertRules?.currentMax ?? 100),
              alertSeverity: siteData.alertRules?.voltageSeverity ?? "warning",
              schoolName: siteData.schoolName || "",
              capacityMwp: Number(siteData.capacityMwp || 0.5),
              latitude: Number(siteData.latitude || 13.7563),
              longitude: Number(siteData.longitude || 100.5018),
              status: siteData.status || "online",
              gatewayName: siteData.gatewayName || "",
              protocol: siteData.protocol || "mqtt",
              endpoint: siteData.endpoint || "",
              deviceModel: siteData.deviceModel || "PM5350",
              deviceSerial: siteData.deviceSerial || "",
            });
          }
        })
        .catch((err: any) => {
          notify.error(err.message || "ไม่สามารถโหลดข้อมูลไซต์งานได้");
          onOpenChange(false);
        })
        .finally(() => {
          setFetching(false);
        });
    }
  }, [open, siteId, reset, onOpenChange]);

  const handleTestPing = async () => {
    setPingStatus("testing");
    setPingMessage("");
    setPingLatency(null);

    try {
      const res = await apiClient.post<{
        status: "online" | "offline";
        protocol: string;
        endpoint: string;
        latencyMs: number | null;
        message: string;
      }>("/v1/sites/test-connection", {
        protocol: formValues.protocol,
        endpoint: formValues.endpoint,
      });

      setPingStatus(res.status);
      setPingMessage(res.message);
      setPingLatency(res.latencyMs);
    } catch (err: any) {
      setPingStatus("offline");
      setPingMessage(err.message || "ไม่สามารถติดต่อเซิร์ฟเวอร์เพื่อทดสอบสัญญาณได้");
      setPingLatency(null);
    }
  };

  const onSubmit = async (values: EditSiteFormValues) => {
    if (!siteId) return;
    setLoading(true);
    try {
      const result = await apiClient.patch<{ configDelivery: string }>(`/v1/sites/${siteId}`, { ...values,
        alertRules: { voltageMin: values.voltageMin, voltageMax: values.voltageMax, currentMax: values.currentMax, voltageSeverity: values.alertSeverity, currentSeverity: values.alertSeverity },
      });
      if (result.configDelivery === "pending") notify.error("บันทึกแล้ว แต่ MQTT config ยังส่งไม่สำเร็จ กรุณาลองอีกครั้ง");
      notify.success(
        locale === "th"
          ? `แก้ไขข้อมูลไซต์งาน "${values.name}" เรียบร้อยแล้ว`
          : `Solar Site "${values.name}" updated successfully`
      );
      onOpenChange(false);
      router.refresh();
    } catch (err: any) {
      notify.error(err.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    } finally {
      setLoading(false);
    }
  };

  const addDevice = async () => {
    if (!siteId) return;
    setAddingDevice(true);
    try {
      await apiClient.post(`/v1/sites/${siteId}/devices`, newDevice);
      setDevices(await apiClient.get<typeof devices>(`/v1/sites/${siteId}/devices`));
      setNewDevice({ name: "", model: "", serialNumber: "", slaveId: newDevice.slaveId + 1, meterPresetId: "" });
      notify.success("เพิ่มมิเตอร์พร้อม Register Mapping แล้ว");
    } catch (error) { notify.error(error instanceof Error ? error.message : "Unable to add device"); }
    finally { setAddingDevice(false); }
  };
  if (user?.role !== "admin") return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl sm:rounded-2xl sm:p-6 max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-1">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Edit className="size-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                {locale === "th" ? "แก้ไขข้อมูลไซต์งานและ Gateway" : "Edit Solar Site & Gateway"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {locale === "th"
                  ? "ปรับปรุงข้อมูลจุดติดตั้งโซลาร์เซลล์ การตั้งค่าเกตเวย์ และมิเตอร์ประจำไซต์"
                  : "Update solar site installation info, gateway parameters, and metering devices"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {fetching ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
            <Activity className="size-5 animate-spin text-primary" />
            <span>กำลังโหลดข้อมูลไซต์งาน...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
            {/* Section 1: Site Info */}
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Cpu className="size-4 text-primary" />
                <span>{locale === "th" ? "ข้อมูลทั่วไปของไซต์งาน" : "General Site Info"}</span>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-site-name" required className="text-xs font-medium">
                  {locale === "th" ? "ชื่อไซต์งาน" : "Site Name"}
                </Label>
                <Input
                  id="edit-site-name"
                  className="text-xs h-10"
                  {...register("name")}
                />
                {errors.name && (
                  <p className="text-[11px] text-destructive">{errors.name.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-school-select" required className="text-xs font-medium">
                    {locale === "th" ? "โรงเรียนต้นสังกัด" : "Associated School"}
                  </Label>
                  <Input id="edit-school-select" {...register("schoolName")} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-capacity" required className="text-xs font-medium">
                    {locale === "th" ? "กำลังติดตั้ง (MWp)" : "Capacity (MWp)"}
                  </Label>
                  <Input
                    id="edit-capacity"
                    type="number"
                    step="0.01"
                    className="text-xs h-10"
                    {...register("capacityMwp", { valueAsNumber: true })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-lat" className="text-xs font-medium">
                    {locale === "th" ? "ละติจูด" : "Latitude"}
                  </Label>
                  <Input
                    id="edit-lat"
                    type="number"
                    step="0.0001"
                    className="text-xs h-10"
                    {...register("latitude", { valueAsNumber: true })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-lng" className="text-xs font-medium">
                    {locale === "th" ? "ลองจิจูด" : "Longitude"}
                  </Label>
                  <Input
                    id="edit-lng"
                    type="number"
                    step="0.0001"
                    className="text-xs h-10"
                    {...register("longitude", { valueAsNumber: true })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-status" className="text-xs font-medium">
                    {locale === "th" ? "สถานะการทำงาน" : "Status"}
                  </Label>
                  <Select
                    value={formValues.status || "online"}
                    onValueChange={(val) => setValue("status", val)}
                  >
                    <SelectTrigger id="edit-status" className="text-xs h-10 w-full">
                      <SelectValue placeholder="สถานะ" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="online" className="text-xs">ออนไลน์ (Online)</SelectItem>
                      <SelectItem value="offline" className="text-xs">ออฟไลน์ (Offline)</SelectItem>
                      <SelectItem value="degraded" className="text-xs">ผิดปกติ (Degraded)</SelectItem>
                      <SelectItem value="archived" className="text-xs">ระงับใช้งาน (Archived)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Section 2: Gateway & Meter Config */}
            <div className="rounded-xl border border-border/80 bg-muted/20 p-3 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Radio className="size-4 text-primary" />
                <span>{locale === "th" ? "การตั้งค่า Gateway & มิเตอร์หลัก" : "Gateway & Meter Setup"}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-gw-name" required className="text-xs font-medium">
                    {locale === "th" ? "ชื่อ/รหัส Gateway" : "Gateway Name"}
                  </Label>
                  <Input
                    id="edit-gw-name"
                    className="text-xs h-10 font-mono bg-background"
                    {...register("gatewayName", { onChange: (event) => setValue("endpoint", `energy/${event.target.value}/#`) })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-gw-proto" required className="text-xs font-medium">
                    {locale === "th" ? "โปรโตคอล" : "Protocol"}
                  </Label>
                  <Select
                    value={formValues.protocol}
                    onValueChange={(val) => setValue("protocol", val as "mqtt")}
                  >
                    <SelectTrigger id="edit-gw-proto" className="text-xs h-10 w-full bg-background">
                      <SelectValue placeholder="โปรโตคอล" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mqtt" className="text-xs">MQTT</SelectItem>

                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-gw-endpoint" required className="text-xs font-medium">
                  {locale === "th" ? "Endpoint / MQTT Topic" : "Telemetry Endpoint"}
                </Label>
                <Input
                  readOnly
                  id="edit-gw-endpoint"
                  className="text-xs h-10 font-mono bg-background"
                  {...register("endpoint")}
                />
              </div>

              <div><Label htmlFor="edit-device">Meter Device</Label><select id="edit-device" value={formValues.deviceId ?? ""} className="h-10 w-full rounded-md border bg-background" onChange={event => {
                const device = devices.find(item => item.id === event.target.value);
                if (device) { setValue("deviceId", device.id); setValue("deviceModel", device.model); setValue("deviceSerial", device.serialNumber); }
              }}>{devices.map(device => <option key={device.id} value={device.id}>{device.name} · {device.serialNumber}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-dev-model" className="text-xs font-medium">
                    {locale === "th" ? "รุ่นมิเตอร์" : "Meter Model"}
                  </Label>
                  <Input
                    id="edit-dev-model"
                    className="text-xs h-10 bg-background"
                    {...register("deviceModel")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-dev-serial" required className="text-xs font-medium">
                    {locale === "th" ? "รหัสซีเรียลมิเตอร์" : "Meter Serial Number"}
                  </Label>
                  <Input
                    id="edit-dev-serial"
                    className="text-xs h-10 font-mono bg-background"
                    {...register("deviceSerial")}
                  />
                  {errors.deviceSerial && (
                    <p className="text-[11px] text-destructive">{errors.deviceSerial.message}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
              <div><Label htmlFor="edit-interval">Gateway Push Interval (seconds)</Label><Input id="edit-interval" type="number" {...register("pollingIntervalSeconds", { valueAsNumber: true })} /></div>
              <div><Label htmlFor="edit-severity">Alert Severity</Label><select id="edit-severity" className="h-10 w-full rounded-md border bg-background" {...register("alertSeverity")}><option value="info">Info</option><option value="warning">Warning</option><option value="critical">Critical</option></select></div>
              <div><Label htmlFor="edit-vmin">Min Voltage (V)</Label><Input id="edit-vmin" type="number" {...register("voltageMin", { valueAsNumber: true })} /></div>
              <div><Label htmlFor="edit-vmax">Max Voltage (V)</Label><Input id="edit-vmax" type="number" {...register("voltageMax", { valueAsNumber: true })} /></div>
              <div><Label htmlFor="edit-imax">Max Current (A)</Label><Input id="edit-imax" type="number" {...register("currentMax", { valueAsNumber: true })} /></div>
              <p className="text-xs text-muted-foreground">บันทึกและส่งค่าไปยัง Hardware Gateway ตามชื่อที่ระบุ</p>
            </div>
            <div className="space-y-2 rounded-lg border p-3">
              <h3 className="text-sm font-semibold">เพิ่มมิเตอร์ใน Gateway นี้</h3>
              <div className="grid grid-cols-2 gap-2">
                <Input aria-label="New meter name" placeholder="Meter Name" value={newDevice.name} onChange={event => setNewDevice({ ...newDevice, name: event.target.value })} />
                <Input aria-label="New meter model" placeholder="Model" value={newDevice.model} onChange={event => setNewDevice({ ...newDevice, model: event.target.value })} />
                <Input aria-label="New meter serial" placeholder="Meter Serial Number" value={newDevice.serialNumber} onChange={event => setNewDevice({ ...newDevice, serialNumber: event.target.value })} />
                <Input aria-label="New meter slave ID" type="number" min={1} max={247} value={newDevice.slaveId} onChange={event => setNewDevice({ ...newDevice, slaveId: Number(event.target.value) })} />
              </div>
              <Label htmlFor="new-meter-preset">Meter Preset</Label>
              <select id="new-meter-preset" className="h-10 w-full rounded-md border bg-background" value={newDevice.meterPresetId} onChange={event => { const preset = meterPresets.find(item => item.id === event.target.value); setNewDevice({ ...newDevice, meterPresetId: event.target.value, model: preset?.model ?? newDevice.model }); }}>
                <option value="">เลือก Register Preset</option>{meterPresets.map(preset => <option key={preset.id} value={preset.id}>{preset.model}</option>)}
              </select>
              {newDevice.meterPresetId && <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(meterPresets.find(preset => preset.id === newDevice.meterPresetId)?.registers, null, 2)}</pre>}
              <Button type="button" variant="outline" disabled={addingDevice || !newDevice.meterPresetId} onClick={() => void addDevice()}>เพิ่มมิเตอร์</Button>
              <p className="text-xs text-muted-foreground">มิเตอร์เพิ่มเติมไม่เปลี่ยนมิเตอร์ที่ใช้คำนวณบิล</p>
            </div>
            {/* Section 3: Connection Test */}
            <div className="rounded-xl border border-border p-3 bg-muted/30 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wifi className="size-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">
                    {locale === "th" ? "ทดสอบสัญญาณการเชื่อมต่อจริง" : "Connection Test"}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pingStatus === "testing"}
                  onClick={handleTestPing}
                  className="h-7 text-xs px-2.5 bg-background cursor-pointer"
                >
                  {pingStatus === "testing" ? (
                    <span className="flex items-center gap-1">
                      <Activity className="size-3 animate-spin text-primary" />
                      กำลังทดสอบ...
                    </span>
                  ) : (
                    "ทดสอบสัญญาณ"
                  )}
                </Button>
              </div>

              {pingStatus === "online" ? (
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2 text-xs">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span className="font-medium">
                    {locale === "th" ? "เชื่อมต่อสำเร็จ พร้อมรับข้อมูล Telemetry" : "Online: Gateway connected"}
                  </span>
                  {pingLatency !== null && (
                    <span className="text-[10px] bg-emerald-500/20 px-1.5 py-0.5 rounded font-mono ml-auto">
                      {pingLatency}ms
                    </span>
                  )}
                </div>
              ) : pingStatus === "offline" ? (
                <div className="flex flex-col gap-1 text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-2 text-xs">
                  <div className="flex items-center gap-2 font-medium">
                    <XCircle className="size-4 shrink-0" />
                    <span>{locale === "th" ? "เชื่อมต่อไม่สำเร็จ (Offline)" : "Offline"}</span>
                  </div>
                  {pingMessage && (
                    <p className="text-[10px] text-muted-foreground break-all">{pingMessage}</p>
                  )}
                </div>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="text-xs h-10 px-4 cursor-pointer"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={loading}
                className="text-xs h-10 px-5 font-semibold cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {loading ? t("common.saving") : locale === "th" ? "บันทึกการแก้ไข" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
