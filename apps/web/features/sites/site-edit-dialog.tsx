"use client";
import { OrganizationPicker, useOrganizationCatalog } from "../organization/organization-picker";
import { organizationSitePayload, type OrganizationSelection } from "../organization/organization-selection";
import { BrokerSelect } from "./broker-select";
import { siteControlsClassName, siteFormClassName, siteTabsListClassName, siteTabsTriggerClassName } from "./site-form-layout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";

import { AddButton } from "../../components/ui/add-button";
import { AppLoading } from "../../components/feedback/app-loading";
import { optionalNumber } from "./site-form-values";
import type { PayloadConfig } from "./payload-contracts";
import {createSitePayloadLoader} from "./site-payload-loader";
import {SiteBillingSource} from "./site-billing-source";
import { PayloadConnectionCard } from "./payload-connection-card";
import { ChoiceSelect } from '../../components/ui/choice-select';

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
  schoolName: z.string().min(1, "กรุณาเลือกองค์กรสังกัด"),
  capacityMwp: z.number().min(0.01, "กำลังติดตั้งต้องมากกว่า 0"),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  status: z.string().optional(),

  gatewayName: z.string().min(2, "กรุณาระบุชื่อหรือรหัส Gateway"),
  protocol: z.literal("mqtt"),
  deviceId: z.string().optional(),
  mqttBrokerId: z.string().optional(),
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
  billingSetupPending = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string | null;
  billingSetupPending?: boolean;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const t = useT();
  const locale = useLocale();
  const [organization,setOrganization]=React.useState<OrganizationSelection|null>(null);
  const organizationCatalog=useOrganizationCatalog(open);
  const [tab,setTab]=React.useState("settings");
  React.useEffect(()=>{if(open)setTab(billingSetupPending?"payload":"settings");},[open,siteId,billingSetupPending]);
  const [registeredCodes,setRegisteredCodes]=React.useState<{siteId:string;externalSiteId:string|null;externalGatewayId:string|null}|null>(null);
  const [storedPayloadConfig,setPayloadConfig]=React.useState<PayloadConfig|null>(null);
  const payloadScope=React.useRef({open,siteId});
  payloadScope.current={open,siteId};
  const [payloadLoader]=React.useState(()=>createSitePayloadLoader(
    requestedSiteId=>apiClient.get<PayloadConfig|null>(`/v1/sites/${encodeURIComponent(requestedSiteId)}/payload-config`),
    ()=>payloadScope.current,
    setPayloadConfig,
  ));
  const refreshPayload=React.useCallback(()=>{void payloadLoader.refresh();},[payloadLoader]);
  React.useEffect(()=>{
    payloadLoader.activate(open?siteId:null);
    setPayloadConfig(null);
    if(open&&siteId)refreshPayload();
    return()=>payloadLoader.invalidate();
  },[open,siteId,payloadLoader,refreshPayload]);
  const payloadConfig=open&&storedPayloadConfig?.siteId===siteId?storedPayloadConfig:null;
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
      schoolName: "",
      status: "online",
      gatewayName: "",
      protocol: "mqtt",
      endpoint: "",
      deviceModel: "",
      deviceSerial: "",
    },
  });

  const formValues = watch();
  const selectOrganization=React.useCallback((selection:OrganizationSelection|null)=>{setOrganization(selection);setValue("schoolName",selection?.organization.name??"",{shouldValidate:true});},[setValue]);

  React.useEffect(() => {
    let active=true;
    const current=()=>active&&payloadScope.current.open&&payloadScope.current.siteId===siteId;
    if (open && siteId) {
      setFetching(true);
      apiClient.get<typeof meterPresets>("/v1/meter-presets").then(rows=>{if(current())setMeterPresets(rows);}).catch(()=>{if(current())setMeterPresets([]);});
      apiClient.get<typeof devices>(`/v1/sites/${siteId}/devices`).then(rows=>{if(current())setDevices(rows);}).catch(()=>{if(current())setDevices([]);});
      setPingStatus("idle");
      setPingMessage("");
      setPingLatency(null);

      apiClient.get<any>(`/v1/sites/${siteId}`)
        .then((siteData) => {
          if (current() && siteData) {
            setRegisteredCodes({siteId:siteData.id,externalSiteId:siteData.externalSiteId??null,externalGatewayId:siteData.externalGatewayId??null});
            setOrganization({kind:"existing",organization:{id:siteData.schoolId,name:siteData.schoolName||"",code:siteData.schoolCode||""}});
            reset({
              name: siteData.name || "",
              deviceId: siteData.deviceId,
              schoolName: siteData.schoolName || "",
              capacityMwp: Number(siteData.capacityMwp),
              latitude: siteData.latitude == null ? undefined : Number(siteData.latitude),
              longitude: siteData.longitude == null ? undefined : Number(siteData.longitude),
              status: siteData.status || "online",
              gatewayName: siteData.gatewayName || "",
              protocol: siteData.protocol || "mqtt",
              endpoint: siteData.endpoint || "",
              mqttBrokerId: siteData.mqttBrokerId || "",
              deviceModel: siteData.deviceModel || "",
              deviceSerial: siteData.deviceSerial || "",
            });
          }
        })
        .catch((err: any) => {
          if(!current())return;
          notify.error(err.message || "ไม่สามารถโหลดข้อมูลไซต์งานได้");
          onOpenChange(false);
        })
        .finally(() => {
          if(current())setFetching(false);
        });
    }
    return()=>{active=false;};
  }, [open, siteId, reset, onOpenChange, refreshPayload]);

  const handleTestPing = async () => {
    setPingStatus("testing");
    setPingMessage("");
    setPingLatency(null);

    try {
      const res = await apiClient.post<{
        status: "online" | "offline";
        protocol: string;
        endpoint: string;
        mqttBrokerId?: string | undefined;
        latencyMs: number | null;
        message: string;
      }>("/v1/sites/test-connection", {
        protocol: formValues.protocol,
        endpoint: formValues.endpoint,
        mqttBrokerId: formValues.mqttBrokerId,
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
      const {schoolName:_displayName,deviceId,deviceModel,deviceSerial,...siteValues}=values;
      const result = await apiClient.patch<{ configDelivery: string }>(`/v1/sites/${siteId}`, { ...siteValues,...(!payloadConfig?{deviceId,deviceModel,deviceSerial}:{}),...organizationSitePayload(organization),

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
      <DialogContent className="flex max-h-[90svh] flex-col gap-4 overflow-hidden sm:w-[80vw] sm:max-w-none sm:rounded-2xl sm:p-6 sm:overflow-hidden">
        <DialogHeader className="pb-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Edit className="size-5 text-primary" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold">
                {locale === "th" ? "แก้ไขข้อมูลไซต์งานและ Gateway" : "Edit Solar Site & Gateway"}
              </DialogTitle>
              <DialogDescription className="text-sm">
                {locale === "th"
                  ? "ปรับปรุงข้อมูลจุดติดตั้งโซลาร์เซลล์ การตั้งค่าเกตเวย์ และมิเตอร์ประจำไซต์"
                  : "Update solar site installation info, gateway parameters, and metering devices"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {fetching ? (
          <AppLoading fullPage={false} />
        ) : (
          <Tabs value={payloadConfig?tab:"settings"} onValueChange={setTab} className={`min-h-0 gap-4 overflow-hidden ${siteControlsClassName}`}>
            {payloadConfig && <TabsList className={siteTabsListClassName}><TabsTrigger value="settings" className={siteTabsTriggerClassName}>{locale === "th" ? "ข้อมูลไซต์และ Gateway" : "Site & Gateway"}</TabsTrigger><TabsTrigger value="payload" className={siteTabsTriggerClassName}>{locale === "th" ? "การเชื่อมต่อและ Preset" : "Connection & Preset"}</TabsTrigger></TabsList>}
            <TabsContent value="settings" className="min-h-0 overflow-y-auto px-1">
          <form onSubmit={handleSubmit(onSubmit)} className={siteFormClassName}>
            {/* Section 1: Site Info */}
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Cpu className="size-4 text-primary" />
                <span>{locale === "th" ? "ข้อมูลทั่วไปของไซต์งาน" : "General Site Info"}</span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-site-name" required className="text-sm font-medium">
                  {locale === "th" ? "ชื่อไซต์งาน" : "Site Name"}
                </Label>
                <Input
                  id="edit-site-name"
                  placeholder="เช่น Solar Site 020 - อาคารเรียน 1"
                  className="text-sm h-10"
                  {...register("name")}
                />
                {errors.name && (
                  <p className="text-[11px] text-destructive">{errors.name.message}</p>
                )}
              </div>

              {<div className="flex flex-col gap-2"><Label htmlFor="edit-site-id">{locale === "th" ? "รหัสไซต์งาน" : "Site ID"}</Label><Input placeholder={locale==='th'?'ยังไม่ได้ลงทะเบียนรหัส':'No registered code'} id="edit-site-id" value={(registeredCodes?.siteId===siteId?registeredCodes.externalSiteId:null)??''} readOnly/></div>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <OrganizationPicker {...organizationCatalog} value={organization} onChange={selectOrganization} locale={locale} canEdit={user?.role==="admin"} disabled={loading}/>
                {organizationCatalog.error&&<p role="alert" className="text-sm text-destructive">{organizationCatalog.error}</p>}
                {errors.schoolName&&<p className="text-sm text-destructive">{errors.schoolName.message}</p>}

                <div className="space-y-2">
                  <Label htmlFor="edit-capacity" required className="text-sm font-medium">
                    {locale === "th" ? "กำลังติดตั้ง (MWp)" : "Capacity (MWp)"}
                  </Label>
                  <Input
                    id="edit-capacity"
                  placeholder="0.48"
                    type="number"
                    step="0.01"
                    className="text-sm h-10"
                    {...register("capacityMwp", { valueAsNumber: true })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="edit-lat" className="text-sm font-medium">
                    {locale === "th" ? "ละติจูด" : "Latitude"}
                  </Label>
                  <Input
                    id="edit-lat"
                  placeholder="13.7563"
                    type="number"
                    step="0.0001"
                    className="text-sm h-10"
                    {...register("latitude", { setValueAs: optionalNumber })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-lng" className="text-sm font-medium">
                    {locale === "th" ? "ลองจิจูด" : "Longitude"}
                  </Label>
                  <Input
                    id="edit-lng"
                  placeholder="100.5018"
                    type="number"
                    step="0.0001"
                    className="text-sm h-10"
                    {...register("longitude", { setValueAs: optionalNumber })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-status" className="text-sm font-medium">
                    {locale === "th" ? "สถานะการทำงาน" : "Status"}
                  </Label>
                  <Select
                    value={formValues.status || "online"}
                    onValueChange={(val) => setValue("status", val)}
                  >
                    <SelectTrigger id="edit-status" className="text-sm h-10 w-full">
                      <SelectValue placeholder="สถานะ" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="online" className="text-sm">ออนไลน์ (Online)</SelectItem>
                      <SelectItem value="offline" className="text-sm">ออฟไลน์ (Offline)</SelectItem>
                      <SelectItem value="degraded" className="text-sm">ผิดปกติ (Degraded)</SelectItem>
                      <SelectItem value="archived" className="text-sm">ระงับใช้งาน (Archived)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Section 2: Gateway & Meter Config */}
            <section className="space-y-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><Radio className="size-4 text-primary"/>{locale === "th" ? "การตั้งค่า Gateway และมิเตอร์หลัก" : "Gateway & billing meter"}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="edit-gw-name" required className="text-sm font-medium">
                    {locale === "th" ? "ชื่อ Gateway" : "Gateway Name"}
                  </Label>
                  <Input
                    id="edit-gw-name"
                  placeholder="GW-020"
                    className="text-sm h-10 font-mono bg-card"
                    {...register("gatewayName", { onChange: (event) => { if (!formValues.endpoint || formValues.endpoint === `energy/${formValues.gatewayName}/#`) setValue("endpoint", `energy/${event.target.value}/#`); } })}
                  />
                </div>

                {<div className="flex flex-col gap-2"><Label htmlFor="edit-gateway-id">{locale === "th" ? "รหัส Gateway" : "Gateway ID"}</Label><Input placeholder={locale==='th'?'ยังไม่ได้ลงทะเบียนรหัส':'No registered code'} id="edit-gateway-id" value={(registeredCodes?.siteId===siteId?registeredCodes.externalGatewayId:null)??''} readOnly/></div>}
                <div className="space-y-2">
                  <Label htmlFor="edit-gw-proto" required className="text-sm font-medium">
                    {locale === "th" ? "โปรโตคอล" : "Protocol"}
                  </Label>
                  <Select
                    value={formValues.protocol}
                    onValueChange={(val) => setValue("protocol", val as "mqtt")}
                  >
                    <SelectTrigger id="edit-gw-proto" className="text-sm h-10 w-full bg-card">
                      <SelectValue placeholder="โปรโตคอล" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mqtt" className="text-sm">MQTT</SelectItem>

                    </SelectContent>
                  </Select>
                </div>
              <div className="space-y-2 min-w-0">
                <Label htmlFor="edit-gw-endpoint" required className="text-sm font-medium">
                  {locale === "th" ? "Endpoint / MQTT Topic" : "Telemetry Endpoint"}
                </Label>
                <Input
                  id="edit-gw-endpoint"
                  placeholder="solar/v1/sites/SITE-001/gateways/GW-001/devices/+/telemetry"
                  className="text-sm h-10 font-mono bg-card"
                  {...register("endpoint")}
                />
              </div>

              </div>

              {!payloadConfig&&<><div className="space-y-2"><Label htmlFor="edit-device">Meter Device</Label><ChoiceSelect id="edit-device" value={formValues.deviceId ?? ""} className="h-10 w-full rounded-md border bg-card" onChange={event => {
                const device = devices.find(item => item.id === event.target.value);
                if (device) { setValue("deviceId", device.id); setValue("deviceModel", device.model); setValue("deviceSerial", device.serialNumber); }
              }}>{devices.map(device => <option key={device.id} value={device.id}>{device.name} · {device.serialNumber}</option>)}</ChoiceSelect></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="edit-dev-model" className="text-sm font-medium">
                    {locale === "th" ? "รุ่นมิเตอร์" : "Meter Model"}
                  </Label>
                  <Input
                    id="edit-dev-model" placeholder="เช่น Pilot SPM91"
                    className="text-sm h-10 bg-card"
                    {...register("deviceModel")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-dev-serial" required className="text-sm font-medium">
                    {locale === "th" ? "รหัสซีเรียลมิเตอร์" : "Meter Serial Number"}
                  </Label>
                  <Input
                    id="edit-dev-serial" placeholder="ระบุซีเรียลบนตัวอุปกรณ์"
                    className="text-sm h-10 font-mono bg-card"
                    {...register("deviceSerial")}
                  />
                  {errors.deviceSerial && (
                    <p className="text-[11px] text-destructive">{errors.deviceSerial.message}</p>
                  )}
                </div>
              </div></>}
            </section>

            {!payloadConfig && <div className="space-y-2">
              <h3 className="text-sm font-semibold">เพิ่มมิเตอร์ใน Gateway นี้</h3>
              <div className="grid grid-cols-2 gap-2">
                <Input aria-label="New meter name" placeholder="Meter Name" value={newDevice.name} onChange={event => setNewDevice({ ...newDevice, name: event.target.value })} />
                <Input aria-label="New meter model" placeholder="Model" value={newDevice.model} onChange={event => setNewDevice({ ...newDevice, model: event.target.value })} />
                <Input aria-label="New meter serial" placeholder="Meter Serial Number" value={newDevice.serialNumber} onChange={event => setNewDevice({ ...newDevice, serialNumber: event.target.value })} />
                <Input aria-label="New meter slave ID" type="number" min={1} max={247} value={newDevice.slaveId} onChange={event => setNewDevice({ ...newDevice, slaveId: Number(event.target.value) })} />
              </div>
              <Label htmlFor="new-meter-preset">Meter Preset</Label>
              <ChoiceSelect id="new-meter-preset" className="h-10 w-full rounded-md border bg-card" value={newDevice.meterPresetId} onChange={event => { const preset = meterPresets.find(item => item.id === event.target.value); setNewDevice({ ...newDevice, meterPresetId: event.target.value, model: preset?.model ?? newDevice.model }); }}>
                <option value="">เลือก Register Preset</option>{meterPresets.map(preset => <option key={preset.id} value={preset.id}>{preset.model}</option>)}
              </ChoiceSelect>
              {newDevice.meterPresetId && <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-sm">{JSON.stringify(meterPresets.find(preset => preset.id === newDevice.meterPresetId)?.registers, null, 2)}</pre>}
              <AddButton type="button" variant="outline" disabled={addingDevice || !newDevice.meterPresetId} onClick={() => void addDevice()}>เพิ่มมิเตอร์</AddButton>
              <p className="text-sm text-muted-foreground">มิเตอร์เพิ่มเติมไม่เปลี่ยนมิเตอร์ที่ใช้คำนวณบิล</p>
            </div>
            }
            <BrokerSelect value={formValues.mqttBrokerId||""} onChange={id=>{setValue("mqttBrokerId",id);setPingStatus("idle");}}/>
            {/* Section 3: Connection Test */}
            <div className="rounded-xl border border-border p-3 bg-muted/30 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wifi className="size-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">
                    {locale === "th" ? "ทดสอบสัญญาณการเชื่อมต่อจริง" : "Connection Test"}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pingStatus === "testing"}
                  onClick={handleTestPing}
                  className="h-10 text-sm px-2.5 bg-card cursor-pointer"
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
                <div className="flex items-center gap-2 text-success bg-success/10 border border-success/20 rounded-lg p-2 text-sm">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span className="font-medium">
                    {locale === "th" ? "เชื่อมต่อ Broker สำเร็จ · ยังไม่ได้ยืนยันการรับข้อมูล" : "Broker connected · Data receipt not yet verified"}
                  </span>
                  {pingLatency !== null && (
                    <span className="text-sm bg-success/20 px-1.5 py-0.5 rounded font-mono ml-auto">
                      {pingLatency}ms
                    </span>
                  )}
                </div>
              ) : pingStatus === "offline" ? (
                <div className="flex flex-col gap-1 text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-2 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <XCircle className="size-4 shrink-0" />
                    <span>{locale === "th" ? "เชื่อมต่อไม่สำเร็จ (Offline)" : "Offline"}</span>
                  </div>
                  {pingMessage && (
                    <p className="text-sm text-muted-foreground break-all">{pingMessage}</p>
                  )}
                </div>
              ) : null}
            </div>

            <DialogFooter className="sticky bottom-0 z-10 mx-0 mb-0 rounded-lg bg-card border-t sm:mx-0 sm:mb-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="text-sm h-10 px-4 cursor-pointer"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={loading}
                className="text-sm h-10 px-5 font-semibold cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {loading ? t("common.saving") : locale === "th" ? "บันทึกการแก้ไข" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>{billingSetupPending&&!payloadConfig&&siteId&&<SiteBillingSource siteId={siteId} locale={locale} setupPending focusOnLoad/>}
            </TabsContent>
            {payloadConfig && <TabsContent value="payload" className="min-h-0 overflow-y-auto p-1"><PayloadConnectionCard showAdvanced={false} edgeToEdge config={payloadConfig} onRefresh={refreshPayload} editable focusBilling={billingSetupPending} billingSetupPending={billingSetupPending}/></TabsContent>}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
