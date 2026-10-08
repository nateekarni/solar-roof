"use client";
import { OrganizationPicker, useOrganizationCatalog } from "../organization/organization-picker";
import { organizationSitePayload, type OrganizationSelection } from "../organization/organization-selection";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { siteFormClassName, siteTabsListClassName, siteTabsTriggerClassName } from "./site-form-layout";
import {DeviceProfileEditor} from "./device-profile-editor";
import {newDeviceDraft,selectDevicePreset,deviceProfilePayload,validateDeviceDraft,type DeviceDraft} from "./site-form-values";
import { PayloadImportPanel } from "./payload-import-panel";
import { PayloadReceiveSettings } from "./payload-receive-settings";
import type { PayloadConfig, PayloadReceiveConfig } from "./payload-contracts";
import { AddButton } from "../../components/ui/add-button";
import { Trash2 } from "lucide-react";
import { BrokerSelect } from "./broker-select";
import { emptySiteValues, optionalNumber } from "./site-form-values";
import { type PayloadRevision } from "./payload-contracts";
import {PresetPicker} from "./preset-picker";
import { Field, FieldGroup, FieldLabel } from "../../components/ui/field";

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
  CheckCircle2,
  Cpu,
  Layers,
  Wifi,
  XCircle,
} from "lucide-react";
import { notify } from "../../components/feedback/notifications";
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from "../../components/ui/table";
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

const siteSchema = z.object({
  // Step 1: Site Info
  name: z.string().min(2, "ชื่อไซต์งานต้องมีอย่างน้อย 2 ตัวอักษร"),
  schoolName: z.string().min(1, "กรุณากรอกชื่อองค์กร"),
  capacityMwp: z.number().min(0.01, "กำลังติดตั้งต้องมากกว่า 0"),
  latitude: z.number().optional(),
  longitude: z.number().optional(),

  // Step 2: Gateway & Meter Config
  gatewayName: z.string().min(2, "กรุณาระบุชื่อหรือรหัส Gateway"),
  protocol: z.string().refine((value): boolean => value === "mqtt", "เลือกโปรโตคอล MQTT"),
  mqttBrokerId: z.string().optional(),
  endpoint: z.string().min(3, "กรุณาระบุ Endpoint หรือ MQTT Topic"),
  meterPresetId: z.string().optional(),
  payloadProfileRevisionId: z.string().optional(),
  externalSiteId: z.string().optional(),
  externalGatewayId: z.string().optional(),
  externalDeviceId: z.string().optional(),
  deviceModel: z.string().optional(),
  deviceSerial: z.string().min(1, "กรุณาระบุรหัสซีเรียลมิเตอร์"),

});

type SiteFormValues = z.infer<typeof siteSchema>;

interface MeterRegister {
  semanticField: string;
  nameTh: string;
  registerAddress: string;
  dataType: string;
  scale: number;
  unit: string;
}

interface MeterPresetOption {
  id: string;
  brand: string;
  model: string;
  deviceType: string;
  registers?: MeterRegister[];
}

export function SiteFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const t = useT();
  const locale = useLocale();
  const [organization,setOrganization]=React.useState<OrganizationSelection|null>(null);
  const organizationCatalog=useOrganizationCatalog(open);
  const [step, setStep] = React.useState<1 | 3>(1);
  const [loading, setLoading] = React.useState(false);
  const [pingStatus, setPingStatus] = React.useState<"idle" | "testing" | "online" | "offline">("idle");
  const [pingMessage, setPingMessage] = React.useState<string>("");
  const [pingLatency, setPingLatency] = React.useState<number | null>(null);
  const [dataFormat, setDataFormat] = React.useState("payload");
  const [payloadMode, setPayloadMode] = React.useState(true);
  const [mainDevice,setMainDevice]=React.useState<DeviceDraft>(newDeviceDraft);
  const [payloadPresets, setPayloadPresets] = React.useState<PayloadRevision[]>([]);
  const [receiveConfig,setReceiveConfig]=React.useState<PayloadReceiveConfig|null>({messagesPath:'payloads',fieldPaths:{},deviceAliases:[]});
  const [additionalDevices,setAdditionalDevices]=React.useState<DeviceDraft[]>([]);
  const [importVersion,setImportVersion]=React.useState(0);
  const [sampleInput,setSampleInput]=React.useState("");
  const [importReport,setImportReport]=React.useState("");
  const [formError, setFormError] = React.useState("");
  const payloadModeRef = React.useRef(false);
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
    resolver: zodResolver(siteSchema) as any,
    defaultValues: emptySiteValues(),
  });

  const formValues = watch();
  const selectOrganization=React.useCallback((selection:OrganizationSelection|null)=>{setOrganization(selection);setValue("schoolName",selection?.organization.name??"",{shouldValidate:true});},[setValue]);

  React.useEffect(() => {
    if (open) {
      setSampleInput("");setStep(1);setImportVersion(0);setImportReport("");setAdditionalDevices([]);setReceiveConfig({messagesPath:'payloads',fieldPaths:{},deviceAliases:[]});
      setFormError("");setOrganization(null);
      apiClient.get<PayloadRevision[]>("/v1/settings/payload-presets").then(setPayloadPresets).catch(e => setFormError(e.message));
      setPingStatus("idle");
      setPingMessage("");
      setPingLatency(null);

      reset(emptySiteValues());
      setPayloadMode(true); setDataFormat("payload"); payloadModeRef.current = true;setMainDevice(newDeviceDraft());
      apiClient.get<MeterPresetOption[]>("/v1/meter-presets").then(list => setPresets(list.filter(p => p.deviceType === "meter"))).catch(() => setPresets([]));
    }
  }, [open, setValue]);

  const changeMainDevice=(device:DeviceDraft)=>{setMainDevice(device);setValue('deviceModel',device.model);setValue('deviceSerial',device.serialNumber);setValue('externalDeviceId',device.externalDeviceId);setValue('payloadProfileRevisionId',device.payloadProfileRevisionId);};
  const importedDevice=(device:{name:string;model:string;serialNumber:string;externalDeviceId:string;payloadProfileRevisionId:string})=>({...selectDevicePreset(newDeviceDraft(),payloadPresets.find(r=>r.id===device.payloadProfileRevisionId),true)!,...device});
  const draftConfig:PayloadConfig=React.useMemo(()=>({siteId:'draft',gatewayId:'draft',externalSiteId:formValues.externalSiteId??'',externalGatewayId:formValues.externalGatewayId??'',subscriptionTopic:formValues.endpoint,ackTopic:null,receiveRevision:{id:null,version:0,createdAt:null,config:receiveConfig??{messagesPath:'payloads',fieldPaths:{},deviceAliases:[]}},bundleFixture:null,rejections:[],unmappedMessages:[],devices:[mainDevice,...additionalDevices].map(d=>({id:d.key,name:d.name,externalDeviceId:d.externalDeviceId,profileRevisionId:d.payloadProfileRevisionId,profileId:d.config.id,profileVersion:d.config.version,profileConfig:d.config,sourceProfileId:d.config.sourceProfile?.id??d.config.id,sourceProfileVersion:d.config.sourceProfile?.version??d.config.version,fixture:{},telemetryTopic:`solar/v1/sites/${formValues.externalSiteId}/gateways/${formValues.externalGatewayId}/devices/${d.externalDeviceId}/telemetry`}))}),[formValues.externalSiteId,formValues.externalGatewayId,formValues.endpoint,mainDevice,additionalDevices,receiveConfig]);

  // Auto-generate suggested gateway and endpoint when site name changes
  const handleSiteNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setValue("name", val);


  };

  const handleGatewayNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const gw = e.target.value;
    setValue("gatewayName", gw, { shouldValidate: true });
    if (gw && !payloadMode && (!formValues.endpoint || formValues.endpoint === `energy/${formValues.gatewayName}/#`)) {
      setValue("endpoint", `energy/${gw}/#`, { shouldValidate: true });
    }
  };

  const generatedEndpoint = React.useRef("");
  React.useEffect(() => {
    if (payloadMode && formValues.externalSiteId && formValues.externalGatewayId && (!formValues.endpoint || formValues.endpoint === generatedEndpoint.current)) setValue("endpoint", `solar/v1/sites/${formValues.externalSiteId || ""}/gateways/${formValues.externalGatewayId || ""}/devices/+/telemetry`);
    generatedEndpoint.current = `solar/v1/sites/${formValues.externalSiteId || ""}/gateways/${formValues.externalGatewayId || ""}/devices/+/telemetry`;
  }, [payloadMode, formValues.externalSiteId, formValues.externalGatewayId, setValue]);


  const validatePayload = () => {
    if (!payloadMode) return true;
    if (![formValues.externalSiteId, formValues.externalGatewayId, formValues.externalDeviceId].every(v => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v))) { setFormError(locale==='th'?"ระบุ Site ID, Gateway ID และ Device ID (1–128 ตัว: A–Z, a–z, 0–9, _ หรือ -)":"Enter Site ID, Gateway ID and Device ID (1–128 letters, digits, _ or -)."); return false; }
    if(!receiveConfig){setFormError(locale==='th'?'การจับคู่ตำแหน่งฟิลด์ต้องเป็น JSON object ที่ถูกต้อง':'Field paths must be a valid JSON object.');return false;}
    for(const [index,device] of [mainDevice,...additionalDevices].entries()){const problem=validateDeviceDraft(device,index===0,locale);if(problem){setFormError(problem);return false;}}
    const ids=[formValues.externalDeviceId,...additionalDevices.map(d=>d.externalDeviceId)];
    if(new Set(ids).size!==ids.length){setFormError(locale==='th'?'รหัสอุปกรณ์ต้องไม่ซ้ำกัน':'Device IDs must be unique.');return false;}
    if(receiveConfig.deviceAliases.some(a=>!a.source.trim()||!ids.includes(a.target)||(a.profileAlias&&(!a.profileAlias.sourceId.trim()||!a.profileAlias.sourceVersion.trim())))){setFormError(locale==='th'?'กรอกการจับคู่รหัสและเวอร์ชันให้ครบ':'Complete the device aliases and profile versions.');return false;}
    setFormError(""); return true;
  };
  const handleNextStep = async () => {
    const valid = await trigger(["name", "schoolName", "capacityMwp", "latitude", "longitude", "gatewayName", "protocol", "endpoint", "deviceSerial"]);
    if (!dataFormat || (!payloadMode && !formValues.meterPresetId)) {
      setFormError(!dataFormat ? "เลือก Preset มิเตอร์หลัก หรือเพิ่ม Preset ด้วยตัวเอง" : "เลือกแม่แบบมิเตอร์หลักก่อนดำเนินการต่อ");
      return;
    }
    if (valid && validatePayload()) {
      setStep(3);
      setPingStatus("idle");
      setPingMessage("");
      setPingLatency(null);
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

  const onSubmit = async (values: SiteFormValues) => {
    if (step !== 3 || loading || !validatePayload()) return;
    if(payloadMode && !receiveConfig){setFormError("การจับคู่ฟิลด์ต้องเป็น JSON object ที่ถูกต้อง");return;}
    setLoading(true);
    try {
      const finalStatus = "offline";
      const created = await apiClient.post<{ configDelivery: string }>("/v1/sites", {
        name: values.name,
        ...organizationSitePayload(organization),
        capacityMwp: values.capacityMwp,
        latitude: values.latitude,
        longitude: values.longitude,
        gatewayName: values.gatewayName,
        protocol: values.protocol,
        endpoint: values.endpoint,
        mqttBrokerId: values.mqttBrokerId,
        deviceName: payloadMode?mainDevice.name:undefined,
        deviceModel: values.deviceModel,
        deviceSerial: values.deviceSerial,
        meterPresetId: payloadMode ? undefined : values.meterPresetId,
        ...(payloadMode ? {receiveConfig,additionalDevices:additionalDevices.map(d=>({name:d.name,model:d.model,serialNumber:d.serialNumber,externalDeviceId:d.externalDeviceId,...deviceProfilePayload(d)})),...deviceProfilePayload(mainDevice), externalSiteId: values.externalSiteId, externalGatewayId: values.externalGatewayId, externalDeviceId: values.externalDeviceId} : {}),
        status: finalStatus,
      });

      if (created.configDelivery === "pending") notify.error("สร้างไซต์งานแล้ว แต่ MQTT config ยังส่งไม่สำเร็จ กรุณาส่งอีกครั้งเมื่อ Broker พร้อม");
      notify.success(
        locale === "th"
          ? `เพิ่มไซต์งาน "${values.name}" เรียบร้อยแล้ว รอข้อมูลจาก Gateway`
          : `Solar Site "${values.name}" created successfully (Status: ${finalStatus})`
      );
      reset();
      setPayloadMode(true); setDataFormat("payload"); payloadModeRef.current = true;setMainDevice(newDeviceDraft());
      onOpenChange(false);
      router.refresh();
    } catch (err: any) {
      setFormError(err.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
      notify.error(err.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    } finally {
      setLoading(false);
    }
  };

  if (user?.role !== "admin") return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:w-[80vw] sm:max-w-none sm:rounded-2xl sm:p-6 max-h-[90svh] overflow-y-auto">
        <DialogHeader className="pb-1">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Cpu className="size-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                {locale === "th" ? "เพิ่มไซต์งานและกำหนดค่า Gateway" : "Add Solar Site & Configure Gateway"}
              </DialogTitle>
              <DialogDescription className="text-sm">
                {locale === "th"
                  ? "สร้างไซต์งานติดตั้งโซลาร์และเชื่อมโยงเกตเวย์เพื่อดึงข้อมูล Telemetry เข้าสู่ระบบ"
                  : "Register a solar site, configure IoT gateway, and connect telemetry"}
              </DialogDescription>
            </div>
          </div>

        </DialogHeader>

        <form
          onSubmit={event => event.preventDefault()}
          onKeyDown={(e) => {
            // Prevent accidental form submission on Enter key in Step 1 or 2
            if (e.key === "Enter" && step !== 3 && e.target instanceof HTMLElement && e.target.closest('[role="dialog"]') === e.currentTarget.closest('[role="dialog"]')) {
              e.preventDefault();
              handleNextStep();
            }
          }}
          className={siteFormClassName}
        >
          {formError && <p role="alert" className="text-destructive">{formError}</p>}
          <Tabs value={step === 1 ? "settings" : "test"} onValueChange={value => { if (value === "settings") setStep(1); else void handleNextStep(); }}>
            <TabsList className={siteTabsListClassName}>
              <TabsTrigger value="settings" className={siteTabsTriggerClassName}>{locale === "th" ? "การตั้งค่าไซต์งานและ Gateway" : "Site & Gateway settings"}</TabsTrigger>
              <TabsTrigger value="test" className={siteTabsTriggerClassName}>{locale === "th" ? "ทดสอบการใช้งาน" : "Test configuration"}</TabsTrigger>
            </TabsList>
          {/* Site and gateway settings stay mounted to retain draft editor values. */}
          <TabsContent value="settings" forceMount hidden={step !== 1} className="space-y-5 pt-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Cpu className="size-4 text-primary"/>ข้อมูลไซต์งาน</h3>
          {(
            <div className="space-y-3.5">
              <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="site-name" required className="text-sm font-medium">
                  {locale === "th" ? "ชื่อไซต์งาน" : "Site Name"}
                </Label>
                <Input
                  id="site-name"
                  placeholder={locale === "th" ? "เช่น Solar Site 020 - อาคารเรียน 1" : "e.g. Solar Site 020 - Building 1"}
                  className="text-sm h-10"
                  value={formValues.name}
                  onChange={handleSiteNameChange}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>

              <Field><FieldLabel htmlFor="site-id">Site ID</FieldLabel><Input id="site-id" {...register("externalSiteId")}/></Field>
              <OrganizationPicker {...organizationCatalog} value={organization} onChange={selectOrganization} locale={locale} canEdit={user?.role==="admin"} disabled={loading}/>
              {organizationCatalog.error&&<p role="alert" className="text-sm text-destructive">{organizationCatalog.error}</p>}
              {errors.schoolName&&<p className="text-sm text-destructive">{errors.schoolName.message}</p>}

              </div>
              <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="capacity" required className="text-sm font-medium">
                  {locale === "th" ? "กำลังการผลิตติดตั้ง (MWp)" : "Installed Capacity (MWp)"}
                </Label>
                <Input
                  id="capacity"
                  type="number"
                  step="0.01"
                  placeholder="0.48"
                  className="text-sm h-10"
                  {...register("capacityMwp", { setValueAs: optionalNumber })}
                />
                {errors.capacityMwp && (
                  <p className="text-sm text-destructive">{errors.capacityMwp.message}</p>
                )}
              </div>

                <div className="space-y-2">
                  <Label htmlFor="lat" className="text-sm font-medium">
                    {locale === "th" ? "ละติจูด (Latitude)" : "Latitude"}
                  </Label>
                  <Input
                    id="lat"
                    type="number"
                    step="0.0001"
                    placeholder="13.7563"
                    className="text-sm h-10"
                    {...register("latitude", { setValueAs: optionalNumber })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lng" className="text-sm font-medium">
                    {locale === "th" ? "ลองจิจูด (Longitude)" : "Longitude"}
                  </Label>
                  <Input
                    id="lng"
                    type="number"
                    step="0.0001"
                    placeholder="100.5018"
                    className="text-sm h-10"
                    {...register("longitude", { setValueAs: optionalNumber })}
                  />
                </div>
              </div>
            </div>
          )}

          <section className="space-y-3 border-t pt-5"><h3 className="flex items-center gap-2 text-sm font-semibold"><Wifi className="size-4 text-primary"/>MQTT Broker</h3><BrokerSelect value={formValues.mqttBrokerId||""} onChange={id=>{setValue("mqttBrokerId",id);setPingStatus("idle");}}/></section>
          <PayloadImportPanel revisions={payloadPresets} onSample={setSampleInput} onDraft={(plan,billingId)=>{
            const main=plan.devices.find(d=>d.sourceId===billingId)??plan.devices[0];if(!main)return;
            setDataFormat('payload');setPayloadMode(true);payloadModeRef.current=true;setValue('meterPresetId','');
            setValue('externalSiteId',plan.siteId);setValue('externalGatewayId',plan.gatewayId);setValue('gatewayName',plan.gatewayId);setValue('protocol','mqtt');setValue('endpoint',plan.topic);
            setValue('externalDeviceId',main.externalDeviceId);setValue('payloadProfileRevisionId',main.payloadProfileRevisionId);setValue('deviceModel',main.model);setValue('deviceSerial',main.serialNumber);setMainDevice(importedDevice(main));
            setAdditionalDevices(plan.devices.filter(d=>d!==main).map(({sourceId,sourceProfileId,sourceProfileVersion,...device})=>importedDevice(device)));setReceiveConfig(plan.receiveConfig);setFormError('');setPingStatus('idle');setImportReport('');setImportVersion(v=>v+1);
          }} onApply={(plan,billingId)=>{
            const main=plan.devices.find(d=>d.sourceId===billingId);if(!main)throw Error('เลือกมิเตอร์หลัก');
            setDataFormat('payload');setPayloadMode(true);payloadModeRef.current=true;setValue('meterPresetId','');
            setValue('externalSiteId',plan.siteId);setValue('externalGatewayId',plan.gatewayId);setValue('gatewayName',plan.gatewayId);setValue('protocol','mqtt');setValue('endpoint',plan.topic);
            setValue('externalDeviceId',main.externalDeviceId);setValue('payloadProfileRevisionId',main.payloadProfileRevisionId);setValue('deviceModel',main.model);setValue('deviceSerial',main.serialNumber);setMainDevice(importedDevice(main));
            setAdditionalDevices(plan.devices.filter(d=>d!==main).map(({sourceId,sourceProfileId,sourceProfileVersion,...device})=>importedDevice(device)));setReceiveConfig(plan.receiveConfig);setImportVersion(v=>v+1);setImportReport(`ตรวจ Payload ตัวอย่างผ่าน · ${plan.devices.length} อุปกรณ์ · ข้อมูลต้นทางอาจเป็นข้อมูลย้อนหลัง`);setFormError('');setPingStatus('idle');
          }}/>
          <section className="space-y-5 border-t pt-5">
          { <FieldGroup>
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Wifi className="size-4 text-primary"/>การเชื่อมต่อและ Preset</h3>

          </FieldGroup>}
          {/* STEP 2: Gateway & Meter Config */}
          { (
            <div className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="gw-name" required className="text-sm font-medium">
                    {locale === "th" ? "ชื่อ Gateway" : "Gateway Name"}
                  </Label>
                  <Input
                    id="gw-name"
                    placeholder="GW-020"
                    className="text-sm h-10 font-mono"
                    value={formValues.gatewayName}
                    onChange={handleGatewayNameChange}
                  />
                  {errors.gatewayName && (
                    <p className="text-sm text-destructive">{errors.gatewayName.message}</p>
                  )}
                </div>

                {payloadMode&&<Field><FieldLabel htmlFor="gateway-id">Gateway ID</FieldLabel><Input id="gateway-id" {...register("externalGatewayId")}/></Field>}
                <div className="space-y-2">
                  <Label htmlFor="gw-protocol" required className="text-sm font-medium">
                    {locale === "th" ? "โปรโตคอลการเชื่อมต่อ" : "Protocol"}
                  </Label>
                  <Select
                    value={formValues.protocol}
                    onValueChange={(val) => setValue("protocol", val as "mqtt", { shouldValidate: true })}
                  >
                    <SelectTrigger id="gw-protocol" className="text-sm h-10 w-full">
                      <SelectValue placeholder="เลือกโปรโตคอล" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mqtt" className="text-sm">
                        MQTT (Standard Telemetry Ingestion)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="gw-endpoint" required className="text-sm font-medium">
                    {locale === "th" ? "Endpoint / Topic รับข้อมูล (Subscribe)" : "Endpoint / Subscription topic"}
                  </Label>
                  <Input
                    id="gw-endpoint"
                    placeholder={payloadMode ? "solar/v1/sites/SITE-001/gateways/GW-001/devices/+/telemetry" : "energy/GW-020/#"}
                    className="text-sm h-10 font-mono"
                    {...register("endpoint")}
                  />
                  {errors.endpoint && (
                    <p className="text-sm text-destructive">{errors.endpoint.message}</p>
                  )}
                  <p className="text-sm text-muted-foreground">{payloadMode ? 'โปรไฟล์ข้อมูล: Topic ต้องตรงกับรหัส Site ID และ Gateway ID ด้านบน เลือกอุปกรณ์ด้วย Device ID หรือ +' : 'ชุดรีจิสเตอร์: ใช้ energy/{ชื่อ Gateway}/# หากรับ solar/v1/... ให้เลือกรูปแบบข้อมูลเป็นโปรไฟล์ข้อมูล'}</p>
                  <span className="text-sm text-muted-foreground">
                    {locale === "th"
                      ? `Subscribe: ${formValues.endpoint}`
                      : `Subscribe: ${formValues.endpoint}`}
                  </span>

                </div>

              </div>

              <h3 className="text-sm font-semibold">{locale==='th'?'มิเตอร์หลัก':'Main meter'}</h3>
              {payloadMode?<DeviceProfileEditor value={mainDevice} onChange={changeMainDevice} revisions={payloadPresets} onCatalogChange={setPayloadPresets} locale={locale} billing/>:<FieldGroup><PresetPicker revisions={[]} value="" legacyPresets={presets} legacyValue={formValues.meterPresetId??''} onChange={()=>{}} onLegacyChange={id=>{setValue('meterPresetId',id);setValue('deviceModel',presets.find(p=>p.id===id)?.model??'');}}/><Field><FieldLabel htmlFor="meter-model">{locale==='th'?'รุ่นมิเตอร์':'Meter model'}</FieldLabel><Input id="meter-model" {...register('deviceModel')}/></Field><Field><FieldLabel htmlFor="meter-serial">{locale==='th'?'ซีเรียลจริง':'Actual serial'}</FieldLabel><Input id="meter-serial" {...register('deviceSerial')}/></Field></FieldGroup>}
              <Button type="button" variant="ghost" onClick={()=>{setPayloadMode(!payloadMode);setDataFormat(payloadMode?'legacy':'payload');setValue('meterPresetId','');setValue('endpoint','');if(!payloadMode)changeMainDevice(mainDevice);}}>{payloadMode?'Register preset':'JSON / Manual'}</Button>
            </div>
          )}

          </section>
          {payloadMode && <section className="space-y-4 border-t pt-5">
            <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-semibold"><Cpu className="size-4 text-primary"/>อุปกรณ์เพิ่มเติม</h3><AddButton type="button" variant="outline" disabled={additionalDevices.length>=31} onClick={()=>setAdditionalDevices([...additionalDevices,newDeviceDraft()])}>เพิ่มอุปกรณ์</AddButton></div>
            <p className="text-sm text-muted-foreground">เพิ่มอุปกรณ์ทุกตัวที่ส่งข้อมูล เช่น SmartLogger โดยมิเตอร์หลักด้านบนใช้คำนวณบิล</p>
            {additionalDevices.map((device,index)=><section key={device.key} className="flex flex-col gap-3 border-t pt-4"><DeviceProfileEditor value={device} onChange={next=>setAdditionalDevices(current=>current.map((d,i)=>i===index?next:d))} revisions={payloadPresets} onCatalogChange={setPayloadPresets} locale={locale}/><Button type="button" variant="ghost" onClick={()=>setAdditionalDevices(current=>current.filter((_,i)=>i!==index))}><Trash2/>{locale==='th'?'ลบอุปกรณ์':'Remove device'}</Button></section>)}
          </section>}
          <section>

                {/* Meter Register Mapping Preview */}
                {(() => {
                  const selectedPreset = presets.find((p) => p.id === formValues.meterPresetId);
                  if (!selectedPreset?.registers || selectedPreset.registers.length === 0) return null;
                  return (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">
                          {locale === "th" ? "ตารางการจับคู่ Register (Register Mapping)" : "Register Mapping"}
                        </span>
                        <span className="text-sm text-muted-foreground font-mono">
                          {selectedPreset.registers.length} registers
                        </span>
                      </div>
                      <div className="max-h-36 overflow-y-auto rounded-lg border border-border bg-card">
                        <Table className="w-full text-left text-sm">
                          <TableHeader className="bg-muted/70 sticky top-0 border-b border-border text-sm font-semibold text-muted-foreground uppercase">
                            <TableRow>
                              <TableHead className="p-1.5 pl-2">ฟิลด์</TableHead>
                              <TableHead className="p-1.5">ชื่อ</TableHead>
                              <TableHead className="p-1.5 font-mono">Register</TableHead>
                              <TableHead className="p-1.5">Type</TableHead>
                              <TableHead className="p-1.5">Scale</TableHead>
                              <TableHead className="p-1.5 pr-2">หน่วย</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody className="divide-y divide-border/50 font-mono text-sm">
                            {selectedPreset.registers.map((reg, rIdx) => (
                              <TableRow key={rIdx} className="hover:bg-muted/30">
                                <TableCell className="p-1.5 pl-2 font-sans font-medium text-foreground">{reg.semanticField}</TableCell>
                                <TableCell className="p-1.5 font-sans text-muted-foreground truncate max-w-[110px]">{reg.nameTh}</TableCell>
                                <TableCell className="p-1.5 text-primary">{reg.registerAddress}</TableCell>
                                <TableCell className="p-1.5 text-muted-foreground">{reg.dataType}</TableCell>
                                <TableCell className="p-1.5 text-muted-foreground">{reg.scale}</TableCell>
                                <TableCell className="p-1.5 pr-2 font-sans text-muted-foreground">{reg.unit || "-"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  );
                })()}


          {payloadMode && <section className="space-y-4">
            <PayloadReceiveSettings key={importVersion} config={draftConfig} draft advancedOnly onDraftChange={setReceiveConfig} onRefresh={()=>{}}/>
          </section>}

          </section>
          </TabsContent>
          {/* Review and connection test */}
          <TabsContent value="test" className="space-y-3.5">
            {payloadMode&&<PayloadReceiveSettings config={draftConfig} draft testOnly sampleInput={sampleInput} onRefresh={()=>{}}/>}
            {importReport&&<section className="space-y-2"><h3 className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="size-4 text-primary"/>ผลตรวจ Payload ที่นำเข้า</h3><p className="text-sm">{importReport}</p><p className="text-sm text-muted-foreground">หากแก้การตั้งค่าหลังนำเข้า ให้กลับไปตรวจ JSON อีกครั้งก่อนบันทึก การรับข้อมูลจริงจะยืนยันหลัง Publish</p></section>}
            <div className="space-y-3.5">
              <div className="space-y-2.5 text-sm border-t pt-4">
                <h4 className="font-semibold text-foreground flex items-center gap-1.5">
                  <Layers className="size-4 text-primary" />
                  <span>{locale === "th" ? "สรุปการตั้งค่าไซต์งานและเกตเวย์" : "Site & Gateway Summary"}</span>
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">{locale === "th" ? "ชื่อไซต์งาน:" : "Site Name:"}</span>{" "}
                    <strong className="text-foreground">{formValues.name}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{locale === "th" ? "องค์กร:" : "Organization:"}</span>{" "}
                    <strong className="text-foreground">{formValues.schoolName}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{locale === "th" ? "กำลังติดตั้ง:" : "Capacity:"}</span>{" "}
                    <strong className="text-foreground">{formValues.capacityMwp} MWp</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Gateway:</span>{" "}
                    <strong className="text-foreground font-mono">{formValues.gatewayName}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{locale === "th" ? "โปรโตคอล:" : "Protocol:"}</span>{" "}
                    <strong className="text-foreground uppercase">{formValues.protocol}</strong>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Endpoint/Topic:</span>{" "}
                    <code className="text-foreground font-mono bg-muted/60 px-1 py-0.5 rounded break-all">
                      {formValues.endpoint}
                    </code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{locale === "th" ? "รุ่นมิเตอร์:" : "Meter Model:"}</span>{" "}
                    <strong className="text-foreground">{formValues.deviceModel || "—"}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{locale === "th" ? "รหัสซีเรียลมิเตอร์:" : "Serial No.:"}</span>{" "}
                    <strong className="text-foreground font-mono">{formValues.deviceSerial}</strong>
                  </div>
                </div>
              </div>

              {/* Ping / Connectivity Test Card */}
              <div className="rounded-xl border border-border p-3.5 bg-muted/30 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wifi className="size-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">
                      {locale === "th" ? "ตรวจการเชื่อมต่อ MQTT Broker" : "Real Connection Test"}
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
                        กำลังตรวจสอบสัญญาณ...
                      </span>
                    ) : (
                      "ตรวจ Broker"
                    )}
                  </Button>
                </div>

                {pingStatus === "online" ? (
                  <div className="flex flex-col gap-1 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5 text-sm">
                    <div className="flex items-center gap-2 font-medium">
                      <CheckCircle2 className="size-4 shrink-0" />
                      <span>
                        {locale === "th"
                          ? "เชื่อมต่อ Broker สำเร็จ · ยังไม่ได้ยืนยันการรับข้อมูล"
                          : "Broker connected · telemetry receipt has not been verified"}
                      </span>
                      {pingLatency !== null && (
                        <span className="text-sm bg-emerald-500/20 px-1.5 py-0.5 rounded font-mono ml-auto">
                          {pingLatency}ms
                        </span>
                      )}
                    </div>
                    {pingMessage && (
                      <p className="text-sm text-emerald-700/80 dark:text-emerald-300/80 pl-6">
                        {pingMessage}
                      </p>
                    )}
                  </div>
                ) : pingStatus === "offline" ? (
                  <div className="flex flex-col gap-1.5 text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-2.5 text-sm">
                    <div className="flex items-start gap-2 font-medium">
                      <XCircle className="size-4 shrink-0 mt-0.5" />
                      <div>
                        <span>
                          {locale === "th"
                            ? "เชื่อมต่อ Broker ไม่สำเร็จ"
                            : "Broker connection failed"}
                        </span>
                        {pingMessage && (
                          <p className="text-sm text-muted-foreground font-normal mt-0.5 break-all">
                            {pingMessage}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded p-1.5">
                      <AlertTriangle className="size-3 shrink-0" />
                      <span>
                        {locale === "th"
                          ? "คุณยังสามารถกดบันทึกเพื่อลงทะเบียนไซต์งานล่วงหน้าได้ โดยระบบจะบันทึกสถานะเป็น 'ออฟไลน์ (Offline)'"
                          : "You can still save to pre-register the site. Status will be saved as 'Offline'."}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {locale === "th"
                      ? "ตรวจว่าเซิร์ฟเวอร์เชื่อมต่อ Broker ได้ การรับข้อมูลจาก Gateway จะยืนยันหลังสร้างไซต์และได้รับ Payload"
                      : "Click to ping test real connectivity based on your configured protocol and endpoint"}
                  </p>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Footer Navigation Buttons */}
          <DialogFooter>
            {step === 1 ? (
              <>
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
                  type="button"
                  size="sm"
                  onClick={event => { event.preventDefault(); void handleNextStep(); }}
                  className="text-sm h-10 px-5 font-semibold gap-1 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <span>ทดสอบการใช้งาน</span>
                  <ArrowRight className="size-3.5" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setStep(1)}
                  className="text-sm h-10 px-4 gap-1 cursor-pointer"
                >
                  <ArrowLeft className="size-3.5" />
                  <span>ย้อนกลับ</span>
                </Button>
                <Button
                  key="save-site"
                  type="button"
                  onClick={handleSubmit(onSubmit)}
                  size="sm"
                  disabled={loading}
                  className="text-sm h-10 px-5 font-semibold cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs"
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
          </Tabs>
        </form>
      </DialogContent>
    </Dialog>
  );
}
