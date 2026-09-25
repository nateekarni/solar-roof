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
import { apiClient } from "../../lib/api-client";
import { useLocale, useT } from "../../providers/locale-provider";

const editSiteSchema = z.object({
  name: z.string().min(2, "ชื่อไซต์งานต้องมีอย่างน้อย 2 ตัวอักษร"),
  schoolId: z.string().min(1, "กรุณาเลือกโรงเรียนสังกัด"),
  capacityMwp: z.number().min(0.01, "กำลังติดตั้งต้องมากกว่า 0"),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  status: z.string().optional(),

  gatewayName: z.string().min(2, "กรุณาระบุชื่อหรือรหัส Gateway"),
  protocol: z.string().min(1, "กรุณาเลือกโปรโตคอล"),
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
  const t = useT();
  const locale = useLocale();
  const [loading, setLoading] = React.useState(false);
  const [fetching, setFetching] = React.useState(false);
  const [schools, setSchools] = React.useState<SchoolOption[]>([]);
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
      schoolId: "",
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
      setPingStatus("idle");
      setPingMessage("");
      setPingLatency(null);

      Promise.all([
        apiClient.get<SchoolOption[]>("/v1/schools"),
        apiClient.get<any>(`/v1/sites/${siteId}`),
      ])
        .then(([schoolList, siteData]) => {
          setSchools(schoolList);
          if (siteData) {
            reset({
              name: siteData.name || "",
              schoolId: siteData.schoolId || "",
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
      await apiClient.patch(`/v1/sites/${siteId}`, values);
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
                  <Select
                    value={formValues.schoolId || ""}
                    onValueChange={(val) => setValue("schoolId", val, { shouldValidate: true })}
                  >
                    <SelectTrigger id="edit-school-select" className="text-xs h-10 w-full">
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
                    {...register("gatewayName")}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-gw-proto" required className="text-xs font-medium">
                    {locale === "th" ? "โปรโตคอล" : "Protocol"}
                  </Label>
                  <Select
                    value={formValues.protocol}
                    onValueChange={(val) => setValue("protocol", val)}
                  >
                    <SelectTrigger id="edit-gw-proto" className="text-xs h-10 w-full bg-background">
                      <SelectValue placeholder="โปรโตคอล" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mqtt" className="text-xs">MQTT</SelectItem>
                      <SelectItem value="modbus-tcp" className="text-xs">Modbus TCP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-gw-endpoint" required className="text-xs font-medium">
                  {locale === "th" ? "Endpoint / MQTT Topic" : "Telemetry Endpoint"}
                </Label>
                <Input
                  id="edit-gw-endpoint"
                  className="text-xs h-10 font-mono bg-background"
                  {...register("endpoint")}
                />
              </div>

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
                    {locale === "th" ? "หมายเลขซีเรียล" : "Serial No."}
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
