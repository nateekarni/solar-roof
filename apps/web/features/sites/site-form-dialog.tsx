"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Cpu,
  Layers,
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
import { apiClient } from "../../lib/api-client";
import { useLocale, useT } from "../../providers/locale-provider";

const siteSchema = z.object({
  // Step 1: Site Info
  name: z.string().min(2, "ชื่อไซต์งานต้องมีอย่างน้อย 2 ตัวอักษร"),
  schoolId: z.string().min(1, "กรุณาเลือกโรงเรียนสังกัด"),
  capacityMwp: z.number().min(0.01, "กำลังติดตั้งต้องมากกว่า 0"),
  latitude: z.number().optional(),
  longitude: z.number().optional(),

  // Step 2: Gateway & Meter Config
  gatewayName: z.string().min(2, "กรุณาระบุชื่อหรือรหัส Gateway"),
  protocol: z.string().min(1, "กรุณาเลือกโปรโตคอล"),
  endpoint: z.string().min(3, "กรุณาระบุ Endpoint หรือ MQTT Topic"),
  meterPresetId: z.string().optional(),
  deviceModel: z.string().optional(),
  deviceSerial: z.string().min(2, "กรุณาระบุรหัสซีเรียลของมิเตอร์"),
});

type SiteFormValues = z.infer<typeof siteSchema>;

interface SchoolOption {
  id: string;
  name: string;
}

interface MeterPresetOption {
  id: string;
  brand: string;
  model: string;
  deviceType: string;
}

export function SiteFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [loading, setLoading] = React.useState(false);
  const [pingStatus, setPingStatus] = React.useState<"idle" | "testing" | "online" | "offline">("idle");
  const [pingMessage, setPingMessage] = React.useState<string>("");
  const [pingLatency, setPingLatency] = React.useState<number | null>(null);
  const [schools, setSchools] = React.useState<SchoolOption[]>([]);
  const [presets, setPresets] = React.useState<MeterPresetOption[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    reset,
    formState: { errors },
  } = useForm<SiteFormValues>({
    resolver: zodResolver(siteSchema),
    defaultValues: {
      name: "",
      schoolId: "",
      capacityMwp: 0.48,
      latitude: 13.7563,
      longitude: 100.5018,
      gatewayName: "GW-020",
      protocol: "mqtt",
      endpoint: "energy/site020/telemetry",
      meterPresetId: "",
      deviceModel: "PM5350",
      deviceSerial: "SN-020-MTR01",
    },
  });

  const formValues = watch();

  React.useEffect(() => {
    if (open) {
      setStep(1);
      setPingStatus("idle");
      setPingMessage("");
      setPingLatency(null);

      // Fetch schools, meter presets, and existing sites concurrently to generate unique defaults
      Promise.all([
        apiClient.get<SchoolOption[]>("/v1/schools"),
        apiClient.get<MeterPresetOption[]>("/v1/meter-presets").catch(() => []),
        apiClient.get<any[]>("/v1/sites").catch(() => []),
      ])
        .then(([schoolList, presetList, siteList]) => {
          setSchools(schoolList);
          if (schoolList.length > 0 && schoolList[0]) {
            setValue("schoolId", schoolList[0].id);
          }
          if (Array.isArray(presetList)) {
            setPresets(presetList);
            if (presetList.length > 0 && presetList[0]) {
              setValue("meterPresetId", presetList[0].id);
              setValue("deviceModel", presetList[0].model);
            }
          }

          // Suggest next unique site/gateway code based on existing sites count
          const nextCount = Array.isArray(siteList) ? siteList.length + 1 : 20;
          const nextCode = String(nextCount).padStart(3, "0");
          setValue("gatewayName", `GW-${nextCode}`);
          setValue("endpoint", `energy/site${nextCode}/telemetry`);
          setValue("deviceSerial", `SN-${nextCode}-MTR01`);
        })
        .catch(() => {});
    }
  }, [open, setValue]);

  // Auto-generate suggested gateway and endpoint when site name changes
  const handleSiteNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setValue("name", val);

    // Extract potential number from name (e.g. Site 021 -> 021)
    const match = val.match(/\d+/);
    if (match) {
      const code = match[0].padStart(3, "0");
      setValue("gatewayName", `GW-${code}`);
      setValue("endpoint", `energy/site${code}/telemetry`);
      setValue("deviceSerial", `SN-${code}-MTR01`);
    }
  };

  const handleNextStep = async () => {
    if (step === 1) {
      const valid = await trigger(["name", "schoolId", "capacityMwp", "latitude", "longitude"]);
      if (valid) setStep(2);
    } else if (step === 2) {
      const valid = await trigger(["gatewayName", "protocol", "endpoint", "deviceSerial"]);
      if (valid) {
        setStep(3);
        setPingStatus("idle");
        setPingMessage("");
      }
    }
  };

  // Real connection test using backend API
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

  const onSubmit = async (values: SiteFormValues) => {
    setLoading(true);
    try {
      const finalStatus = pingStatus === "online" ? "online" : "offline";
      await apiClient.post("/v1/sites", {
        ...values,
        status: finalStatus,
      });

      notify.success(
        locale === "th"
          ? `เพิ่มไซต์งาน "${values.name}" เรียบร้อยแล้ว (สถานะ: ${finalStatus === "online" ? "ออนไลน์" : "ออฟไลน์"})`
          : `Solar Site "${values.name}" created successfully (Status: ${finalStatus})`
      );
      reset();
      onOpenChange(false);
      router.refresh();
    } catch (err: any) {
      notify.error(err.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl sm:rounded-2xl sm:p-6">
        <DialogHeader className="pb-1">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Cpu className="size-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                {locale === "th" ? "เพิ่มไซต์งานและกำหนดค่า Gateway" : "Add Solar Site & Configure Gateway"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {locale === "th"
                  ? "สร้างไซต์งานติดตั้งโซลาร์และเชื่อมโยงเกตเวย์เพื่อดึงข้อมูล Telemetry เข้าสู่ระบบ"
                  : "Register a solar site, configure IoT gateway, and connect telemetry"}
              </DialogDescription>
            </div>
          </div>

          {/* Wizard Step Indicator */}
          <div className="mt-2 flex items-center justify-between py-2 px-1 text-xs">
            <div
              className={`flex items-center gap-1.5 font-medium ${
                step === 1 ? "text-primary font-bold" : step > 1 ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <span
                className={`grid size-5 place-items-center rounded-full text-[11px] ${
                  step === 1
                    ? "bg-primary text-primary-foreground font-bold"
                    : step > 1
                      ? "bg-emerald-500 text-white"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {step > 1 ? <Check className="size-3" /> : "1"}
              </span>
              <span>{locale === "th" ? "ข้อมูลไซต์งาน" : "Site Info"}</span>
            </div>

            <div className="flex-1" />

            <div
              className={`flex items-center gap-1.5 font-medium ${
                step === 2 ? "text-primary font-bold" : step > 2 ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <span
                className={`grid size-5 place-items-center rounded-full text-[11px] ${
                  step === 2
                    ? "bg-primary text-primary-foreground font-bold"
                    : step > 2
                      ? "bg-emerald-500 text-white"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {step > 2 ? <Check className="size-3" /> : "2"}
              </span>
              <span>{locale === "th" ? "ตั้งค่า Gateway" : "Gateway Config"}</span>
            </div>

            <div className="flex-1" />

            <div
              className={`flex items-center gap-1.5 font-medium ${
                step === 3 ? "text-primary font-bold" : "text-muted-foreground"
              }`}
            >
              <span
                className={`grid size-5 place-items-center rounded-full text-[11px] ${
                  step === 3
                    ? "bg-primary text-primary-foreground font-bold"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                3
              </span>
              <span>{locale === "th" ? "ตรวจสอบ & ทดสอบ" : "Review & Test"}</span>
            </div>
          </div>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          onKeyDown={(e) => {
            // Prevent accidental form submission on Enter key in Step 1 or 2
            if (e.key === "Enter" && step !== 3) {
              e.preventDefault();
              handleNextStep();
            }
          }}
          className="space-y-4 pt-3"
        >
          {/* STEP 1: Site Info */}
          {step === 1 && (
            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="site-name" required className="text-xs font-medium">
                  {locale === "th" ? "ชื่อไซต์งาน" : "Site Name"}
                </Label>
                <Input
                  id="site-name"
                  placeholder={locale === "th" ? "เช่น Solar Site 020 - อาคารเรียน 1" : "e.g. Solar Site 020 - Building 1"}
                  className="text-xs h-10"
                  value={formValues.name}
                  onChange={handleSiteNameChange}
                />
                {errors.name && (
                  <p className="text-[11px] text-destructive">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="school-select" required className="text-xs font-medium">
                  {locale === "th" ? "โรงเรียนต้นสังกัด" : "Associated School"}
                </Label>
                <Select
                  value={formValues.schoolId}
                  onValueChange={(val) => setValue("schoolId", val, { shouldValidate: true })}
                >
                  <SelectTrigger id="school-select" className="text-xs h-10 w-full">
                    <SelectValue placeholder="เลือกโรงเรียนสังกัด" />
                  </SelectTrigger>
                  <SelectContent>
                    {schools.map((sch) => (
                      <SelectItem key={sch.id} value={sch.id} className="text-xs">
                        {sch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.schoolId && (
                  <p className="text-[11px] text-destructive">{errors.schoolId.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="capacity" required className="text-xs font-medium">
                  {locale === "th" ? "กำลังการผลิตติดตั้ง (MWp)" : "Installed Capacity (MWp)"}
                </Label>
                <Input
                  id="capacity"
                  type="number"
                  step="0.01"
                  placeholder="0.48"
                  className="text-xs h-10"
                  {...register("capacityMwp", { valueAsNumber: true })}
                />
                {errors.capacityMwp && (
                  <p className="text-[11px] text-destructive">{errors.capacityMwp.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="lat" className="text-xs font-medium">
                    {locale === "th" ? "ละติจูด (Latitude)" : "Latitude"}
                  </Label>
                  <Input
                    id="lat"
                    type="number"
                    step="0.0001"
                    placeholder="13.7563"
                    className="text-xs h-10"
                    {...register("latitude", { valueAsNumber: true })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lng" className="text-xs font-medium">
                    {locale === "th" ? "ลองจิจูด (Longitude)" : "Longitude"}
                  </Label>
                  <Input
                    id="lng"
                    type="number"
                    step="0.0001"
                    placeholder="100.5018"
                    className="text-xs h-10"
                    {...register("longitude", { valueAsNumber: true })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Gateway & Meter Config */}
          {step === 2 && (
            <div className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="gw-name" required className="text-xs font-medium">
                    {locale === "th" ? "ชื่อ/รหัส Gateway" : "Gateway Name / ID"}
                  </Label>
                  <Input
                    id="gw-name"
                    placeholder="GW-020"
                    className="text-xs h-10 font-mono"
                    {...register("gatewayName")}
                  />
                  {errors.gatewayName && (
                    <p className="text-[11px] text-destructive">{errors.gatewayName.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="gw-protocol" required className="text-xs font-medium">
                    {locale === "th" ? "โปรโตคอลการเชื่อมต่อ" : "Protocol"}
                  </Label>
                  <Select
                    defaultValue={formValues.protocol}
                    onValueChange={(val) => setValue("protocol", val, { shouldValidate: true })}
                  >
                    <SelectTrigger id="gw-protocol" className="text-xs h-10 w-full">
                      <SelectValue placeholder="เลือกโปรโตคอล" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mqtt" className="text-xs">
                        MQTT (Standard Telemetry Ingestion)
                      </SelectItem>
                      <SelectItem value="modbus-tcp" className="text-xs">
                        Modbus TCP (Industrial Polling)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="gw-endpoint" required className="text-xs font-medium">
                  {locale === "th" ? "Endpoint / MQTT Topic" : "Telemetry Endpoint / Topic"}
                </Label>
                <Input
                  id="gw-endpoint"
                  placeholder="energy/site020/telemetry"
                  className="text-xs h-10 font-mono"
                  {...register("endpoint")}
                />
                {errors.endpoint && (
                  <p className="text-[11px] text-destructive">{errors.endpoint.message}</p>
                )}
                <span className="text-[10px] text-muted-foreground">
                  {formValues.protocol === "modbus-tcp"
                    ? "ระบุ Host:Port เช่น 192.168.1.50:502 หรือ localhost:502"
                    : "หัวข้อ MQTT Topic เช่น energy/site020/telemetry หรือ URL เต็ม mqtt://broker:1883"}
                </span>
              </div>

              <div className="rounded-xl border border-border/80 bg-muted/20 p-3 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Radio className="size-4 text-primary" />
                  <span>{locale === "th" ? "การตั้งค่ามิเตอร์หลัก (Billing Meter)" : "Billing Meter Setup"}</span>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="meter-preset" className="text-xs font-medium">
                    {locale === "th" ? "แม่แบบมิเตอร์ (Meter Preset)" : "Meter Preset (Register Mapping)"}
                  </Label>
                  <Select
                    value={formValues.meterPresetId ?? ""}
                    onValueChange={(val) => {
                      setValue("meterPresetId", val);
                      const matched = presets.find((p) => p.id === val);
                      if (matched) {
                        setValue("deviceModel", matched.model);
                      }
                    }}
                  >
                    <SelectTrigger id="meter-preset" className="text-xs h-10 w-full bg-background">
                      <SelectValue placeholder="เลือกแม่แบบมิเตอร์ (Auto-map Registers)" />
                    </SelectTrigger>
                    <SelectContent>
                      {presets.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">
                          {p.brand} - {p.model} ({p.deviceType})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-[10px] text-muted-foreground">
                    การเลือก Preset จะทำการดึงตาราง Register (Total Energy, Voltage, Current) เข้าสู่อุปกรณ์อัตโนมัติ
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="meter-model" className="text-xs font-medium">
                      {locale === "th" ? "รุ่นมิเตอร์" : "Meter Model"}
                    </Label>
                    <Input
                      id="meter-model"
                      placeholder="PM5350"
                      className="text-xs h-10 bg-background"
                      {...register("deviceModel")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="meter-serial" required className="text-xs font-medium">
                      {locale === "th" ? "หมายเลขซีเรียล (Serial No.)" : "Meter Serial No."}
                    </Label>
                    <Input
                      id="meter-serial"
                      placeholder="SN-020-MTR01"
                      className="text-xs h-10 font-mono bg-background"
                      {...register("deviceSerial")}
                    />
                    {errors.deviceSerial && (
                      <p className="text-[11px] text-destructive">{errors.deviceSerial.message}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Review & Test Ping */}
          {step === 3 && (
            <div className="space-y-3.5">
              <div className="rounded-xl border border-border bg-card p-3.5 space-y-2.5 text-xs">
                <h4 className="font-semibold text-foreground flex items-center gap-1.5">
                  <Layers className="size-4 text-primary" />
                  <span>{locale === "th" ? "สรุปการตั้งค่าไซต์งานและเกตเวย์" : "Site & Gateway Summary"}</span>
                </h4>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-muted-foreground">ชื่อไซต์งาน:</span>{" "}
                    <strong className="text-foreground">{formValues.name}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">กำลังติดตั้ง:</span>{" "}
                    <strong className="text-foreground">{formValues.capacityMwp} MWp</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Gateway:</span>{" "}
                    <strong className="text-foreground font-mono">{formValues.gatewayName}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">โปรโตคอล:</span>{" "}
                    <strong className="text-foreground uppercase">{formValues.protocol}</strong>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Endpoint/Topic:</span>{" "}
                    <code className="text-foreground font-mono bg-muted/60 px-1 py-0.5 rounded break-all">
                      {formValues.endpoint}
                    </code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">รุ่นมิเตอร์:</span>{" "}
                    <strong className="text-foreground">{formValues.deviceModel || "PM5350"}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Serial No.:</span>{" "}
                    <strong className="text-foreground font-mono">{formValues.deviceSerial}</strong>
                  </div>
                </div>
              </div>

              {/* Ping / Connectivity Test Card */}
              <div className="rounded-xl border border-border p-3.5 bg-muted/30 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wifi className="size-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground">
                      {locale === "th" ? "ทดสอบสัญญาณการเชื่อมต่อจริง (Signal Test)" : "Real Connection Test"}
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
                        กำลังตรวจสอบสัญญาณ...
                      </span>
                    ) : (
                      "ทดสอบสัญญาณจริง"
                    )}
                  </Button>
                </div>

                {pingStatus === "online" ? (
                  <div className="flex flex-col gap-1 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5 text-xs">
                    <div className="flex items-center gap-2 font-medium">
                      <CheckCircle2 className="size-4 shrink-0" />
                      <span>
                        {locale === "th"
                          ? "สถานะเกตเวย์: เชื่อมต่อสำเร็จ พร้อมรับข้อมูล Telemetry"
                          : "Gateway Status: Online, ready for telemetry ingestion"}
                      </span>
                      {pingLatency !== null && (
                        <span className="text-[10px] bg-emerald-500/20 px-1.5 py-0.5 rounded font-mono ml-auto">
                          {pingLatency}ms
                        </span>
                      )}
                    </div>
                    {pingMessage && (
                      <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 pl-6">
                        {pingMessage}
                      </p>
                    )}
                  </div>
                ) : pingStatus === "offline" ? (
                  <div className="flex flex-col gap-1.5 text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-2.5 text-xs">
                    <div className="flex items-start gap-2 font-medium">
                      <XCircle className="size-4 shrink-0 mt-0.5" />
                      <div>
                        <span>
                          {locale === "th"
                            ? "สถานะเกตเวย์: ไม่พบสัญญาณการเชื่อมต่อ (Offline)"
                            : "Gateway Status: Offline (No signal)"}
                        </span>
                        {pingMessage && (
                          <p className="text-[11px] text-muted-foreground font-normal mt-0.5 break-all">
                            {pingMessage}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded p-1.5">
                      <AlertTriangle className="size-3 shrink-0" />
                      <span>
                        {locale === "th"
                          ? "คุณยังสามารถกดบันทึกเพื่อลงทะเบียนไซต์งานล่วงหน้าได้ โดยระบบจะบันทึกสถานะเป็น 'ออฟไลน์ (Offline)'"
                          : "You can still save to pre-register the site. Status will be saved as 'Offline'."}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    {locale === "th"
                      ? "กดปุ่มเพื่อทดสอบสัญญาณจริงระหว่างเซิร์ฟเวอร์กับเกตเวย์ตาม Protocol และ Endpoint ที่ระบุ"
                      : "Click to ping test real connectivity based on your configured protocol and endpoint"}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Footer Navigation Buttons */}
          <DialogFooter>
            {step === 1 ? (
              <>
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
                  type="button"
                  size="sm"
                  onClick={handleNextStep}
                  className="text-xs h-10 px-5 font-semibold gap-1 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <span>ถัดไป: ตั้งค่า Gateway</span>
                  <ArrowRight className="size-3.5" />
                </Button>
              </>
            ) : step === 2 ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setStep(1)}
                  className="text-xs h-10 px-4 gap-1 cursor-pointer"
                >
                  <ArrowLeft className="size-3.5" />
                  <span>ย้อนกลับ</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleNextStep}
                  className="text-xs h-10 px-5 font-semibold gap-1 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <span>ถัดไป: ตรวจสอบ & ทดสอบ</span>
                  <ArrowRight className="size-3.5" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setStep(2)}
                  className="text-xs h-10 px-4 gap-1 cursor-pointer"
                >
                  <ArrowLeft className="size-3.5" />
                  <span>ย้อนกลับ</span>
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={loading}
                  className="text-xs h-10 px-5 font-semibold cursor-pointer bg-[#EAB308] text-[#0F172A] hover:bg-[#EAB308]/90 shadow-xs"
                >
                  {loading
                    ? t("common.saving")
                    : locale === "th"
                      ? pingStatus === "offline"
                        ? "บันทึกไซต์งาน (สถานะออฟไลน์)"
                        : "บันทึกและเปิดใช้งานไซต์งาน"
                      : "Save Site"}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
