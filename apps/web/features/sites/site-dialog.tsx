"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Edit,
  Layers,
  Radio,
  Wifi,
  XCircle,
} from "lucide-react";

import { focusInvalidFields } from "../../lib/form-feedback";
import { FormErrorSummary } from "../../components/feedback/form-feedback";
import { resolveSiteIdentityDraft, type SiteIdentityDraft } from "./site-identity-draft";
import { OrganizationPicker, useOrganizationCatalog } from "../organization/organization-picker";
import { organizationSitePayload, type OrganizationSelection } from "../organization/organization-selection";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { siteControlsClassName, siteFormClassName, siteTabsListClassName, siteTabsTriggerClassName } from "./site-form-layout";
import { DeviceProfileEditor } from "./device-profile-editor";
import {
  newDeviceDraft,
  deviceProfilePayload,
  validateDeviceDraft,
  type DeviceDraft,
  emptySiteValues,
  optionalNumber,
} from "./site-form-values";
import { PayloadReceiveSettings } from "./payload-receive-settings";
import type { PayloadConfig, PayloadReceiveConfig, PayloadRevision } from "./payload-contracts";
import { createSitePayloadLoader } from "./site-payload-loader";
import { PayloadConnectionCard } from "./payload-connection-card";
import { ChoiceSelect } from "../../components/ui/choice-select";
import { AddButton } from "../../components/ui/add-button";
import { BrokerSelect } from "./broker-select";
import { PresetPicker } from "./preset-picker";
import { AppLoading } from "../../components/feedback/app-loading";
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

// Shared validation schema
export const siteDialogSchema = z.object({
  name: z.string().min(2, "ชื่อไซต์งานต้องมีอย่างน้อย 2 ตัวอักษร"),
  customerName: z.string().min(1, "กรุณากรอกชื่อองค์กร"),
  capacityMwp: z.number().min(0.01, "กำลังติดตั้งต้องมากกว่า 0"),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  status: z.string().optional(),
  gatewayName: z.string().min(2, "กรุณาระบุชื่อหรือรหัส Gateway"),
  protocol: z.string().refine((value) => value === "mqtt", "เลือกโปรโตคอล MQTT"),
  mqttBrokerId: z.string().optional(),
  endpoint: z.string().min(3, "กรุณาระบุ Endpoint หรือ MQTT Topic"),
  meterPresetId: z.string().optional(),
  payloadProfileRevisionId: z.string().optional(),
  externalSiteId: z.string().optional(),
  externalGatewayId: z.string().optional(),
  externalDeviceId: z.string().optional(),
  deviceId: z.string().optional(),
  deviceModel: z.string().optional(),
  deviceSerial: z.string().min(1, "กรุณาระบุรหัสซีเรียลมิเตอร์"),
});

export type SiteDialogFormValues = z.infer<typeof siteDialogSchema>;

export interface ConnectionTestState {
  status: "idle" | "testing" | "online" | "offline";
  message: string;
  latencyMs: number | null;
}

export function ConnectionTestBox({
  state,
  onTest,
  locale,
}: {
  state: ConnectionTestState;
  onTest: () => void;
  locale: string;
}) {
  return (
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
          disabled={state.status === "testing"}
          onClick={onTest}
          className="h-10 text-sm px-2.5 bg-card cursor-pointer"
        >
          {state.status === "testing" ? (
            <span className="flex items-center gap-1">
              <Activity className="size-3 animate-spin text-primary" />
              {locale === "th" ? "กำลังทดสอบ..." : "Testing..."}
            </span>
          ) : (
            locale === "th" ? "ทดสอบสัญญาณ" : "Test Connection"
          )}
        </Button>
      </div>

      {state.status === "online" ? (
        <div className="flex items-center gap-2 text-success bg-success/10 border border-success/20 rounded-lg p-2 text-sm">
          <CheckCircle2 className="size-4 shrink-0" />
          <span className="font-medium">
            {locale === "th"
              ? "เชื่อมต่อ Broker สำเร็จ · ยังไม่ได้ยืนยันการรับข้อมูล"
              : "Broker connected · Data receipt not yet verified"}
          </span>
          {state.latencyMs !== null && (
            <span className="text-sm bg-success/20 px-1.5 py-0.5 rounded font-mono ml-auto">
              {state.latencyMs}ms
            </span>
          )}
        </div>
      ) : state.status === "offline" ? (
        <div className="flex flex-col gap-1 text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-2 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <XCircle className="size-4 shrink-0" />
            <span>{locale === "th" ? "เชื่อมต่อไม่สำเร็จ (Offline)" : "Offline"}</span>
          </div>
          {state.message && (
            <p className="text-sm text-muted-foreground break-all">{state.message}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export type SiteDialogProps =
  | {
      mode: "create";
      open: boolean;
      onOpenChange: (open: boolean) => void;
      onCreated?: (siteId: string) => void;
    }
  | {
      mode: "edit";
      open: boolean;
      onOpenChange: (open: boolean) => void;
      siteId: string | null;
      billingSetupPending?: boolean;
    };

export function SiteDialog(props: SiteDialogProps) {
  if (props.mode === "create") {
    return <SiteFormDialogInternal {...props} />;
  }
  return <SiteEditDialogInternal {...props} />;
}

// Internal Create Flow
function SiteFormDialogInternal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (siteId: string) => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const t = useT();
  const locale = useLocale();
  const [organization, setOrganization] = React.useState<OrganizationSelection | null>(null);
  const organizationCatalog = useOrganizationCatalog(open);
  const [step, setStep] = React.useState<1 | 3>(1);
  const [loading, setLoading] = React.useState(false);
  const [pingState, setPingState] = React.useState<ConnectionTestState>({
    status: "idle",
    message: "",
    latencyMs: null,
  });
  const [dataFormat, setDataFormat] = React.useState("payload");
  const [payloadMode, setPayloadMode] = React.useState(true);
  const [mainDevice, setMainDevice] = React.useState<DeviceDraft>(newDeviceDraft);
  const [payloadPresets, setPayloadPresets] = React.useState<PayloadRevision[]>([]);
  const [receiveConfig, setReceiveConfig] = React.useState<PayloadReceiveConfig | null>({
    messagesPath: "payloads",
    fieldPaths: {},
    deviceAliases: [],
  });
  const [additionalDevices, setAdditionalDevices] = React.useState<DeviceDraft[]>([]);
  const [formError, setFormError] = React.useState("");
  const payloadModeRef = React.useRef(false);
  const [presets, setPresets] = React.useState<any[]>([]);

  const {
    register,
    getFieldState,
    handleSubmit,
    setValue,
    watch,
    trigger,
    reset,
    formState: { errors },
  } = useForm<SiteDialogFormValues>({
    resolver: zodResolver(siteDialogSchema) as any,
    defaultValues: emptySiteValues() as any,
  });

  const formValues = watch();
  const selectOrganization = React.useCallback(
    (selection: OrganizationSelection | null) => {
      setOrganization(selection);
      setValue("customerName", selection?.organization.name ?? "", { shouldValidate: true });
    },
    [setValue]
  );

  React.useEffect(() => {
    if (open) {
      setStep(1);
      setAdditionalDevices([]);
      setReceiveConfig({ messagesPath: "payloads", fieldPaths: {}, deviceAliases: [] });
      setFormError("");
      setOrganization(null);
      apiClient
        .get<PayloadRevision[]>("/v1/settings/payload-presets")
        .then(setPayloadPresets)
        .catch((e) => setFormError(e.message));
      setPingState({ status: "idle", message: "", latencyMs: null });
      reset(emptySiteValues() as any);
      setPayloadMode(true);
      setDataFormat("payload");
      payloadModeRef.current = true;
      setMainDevice(newDeviceDraft());
      apiClient
        .get<any[]>("/v1/meter-presets")
        .then((list) => setPresets(list.filter((p) => p.deviceType === "meter")))
        .catch(() => setPresets([]));
    }
  }, [open, setValue, reset]);

  const changeMainDevice = (device: DeviceDraft) => {
    setMainDevice(device);
    setValue("deviceModel", device.model);
    setValue("deviceSerial", device.serialNumber);
    setValue("externalDeviceId", device.externalDeviceId);
    setValue("payloadProfileRevisionId", device.payloadProfileRevisionId);
  };

  const draftConfig: PayloadConfig = React.useMemo(
    () => ({
      siteId: "draft",
      gatewayId: "draft",
      externalSiteId: formValues.externalSiteId ?? "",
      externalGatewayId: formValues.externalGatewayId ?? "",
      subscriptionTopic: formValues.endpoint,
      ackTopic:
        formValues.externalSiteId && formValues.externalGatewayId
          ? `solar/v1/sites/${formValues.externalSiteId}/gateways/${formValues.externalGatewayId}/dataAcept`
          : null,
      receiveRevision: {
        id: null,
        version: 0,
        createdAt: null,
        config: receiveConfig ?? { messagesPath: "payloads", fieldPaths: {}, deviceAliases: [] },
      },
      bundleFixture: null,
      rejections: [],
      unmappedMessages: [],
      devices: [mainDevice, ...additionalDevices].map((d) => ({
        id: d.key,
        name: d.name,
        externalDeviceId: d.externalDeviceId,
        profileRevisionId: d.payloadProfileRevisionId,
        profileId: d.config.id,
        profileVersion: d.config.version,
        profileConfig: d.config,
        sourceProfileId: d.config.sourceProfile?.id ?? d.config.id,
        sourceProfileVersion: d.config.sourceProfile?.version ?? d.config.version,
        fixture: {},
        telemetryTopic: `solar/v1/sites/${formValues.externalSiteId}/gateways/${formValues.externalGatewayId}/devices/${d.externalDeviceId}/telemetry`,
      })),
    }),
    [formValues.externalSiteId, formValues.externalGatewayId, formValues.endpoint, mainDevice, additionalDevices, receiveConfig]
  );

  const handleGatewayNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const gw = e.target.value;
    setValue("gatewayName", gw, { shouldValidate: true });
    if (gw && !payloadMode && (!formValues.endpoint || formValues.endpoint === `energy/${formValues.gatewayName}/#`)) {
      setValue("endpoint", `energy/${gw}/#`, { shouldValidate: true });
    }
  };

  const generatedEndpoint = React.useRef("");
  React.useEffect(() => {
    if (payloadMode && formValues.externalSiteId && formValues.externalGatewayId && (!formValues.endpoint || formValues.endpoint === generatedEndpoint.current)) {
      setValue(
        "endpoint",
        `solar/v1/sites/${formValues.externalSiteId || ""}/gateways/${formValues.externalGatewayId || ""}/devices/+/telemetry`
      );
    }
    generatedEndpoint.current = `solar/v1/sites/${formValues.externalSiteId || ""}/gateways/${formValues.externalGatewayId || ""}/devices/+/telemetry`;
  }, [payloadMode, formValues.externalSiteId, formValues.externalGatewayId, setValue]);

  const validatePayload = (allowBlankCode = false) => {
    if (!payloadMode) return true;
    if (
      ![formValues.externalSiteId, formValues.externalGatewayId, formValues.externalDeviceId].every(
        (v) => (allowBlankCode && !v?.trim()) || (typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v))
      )
    ) {
      setFormError(
        locale === "th"
          ? "ระบุ Site ID, Gateway ID และ Device ID (1–128 ตัว: A–Z, a–z, 0–9, _ หรือ -)"
          : "Enter Site ID, Gateway ID and Device ID (1–128 letters, digits, _ or -)."
      );
      return false;
    }
    if (!receiveConfig) {
      setFormError(locale === "th" ? "การจับคู่ตำแหน่งฟิลด์ต้องเป็น JSON object ที่ถูกต้อง" : "Field paths must be a valid JSON object.");
      return false;
    }
    for (const [index, device] of [mainDevice, ...additionalDevices].entries()) {
      const problem = validateDeviceDraft(device, index === 0, locale, allowBlankCode);
      if (problem) {
        setFormError(problem);
        return false;
      }
    }
    const ids = [formValues.externalDeviceId, ...additionalDevices.map((d) => d.externalDeviceId)];
    if (new Set(ids.filter(Boolean)).size !== ids.filter(Boolean).length) {
      setFormError(locale === "th" ? "รหัสอุปกรณ์ต้องไม่ซ้ำกัน" : "Device IDs must be unique.");
      return false;
    }
    setFormError("");
    return true;
  };

  const handleNextStep = async () => {
    const valid = await trigger([
      "name",
      "customerName",
      "capacityMwp",
      "latitude",
      "longitude",
      "gatewayName",
      "protocol",
      "deviceSerial",
    ]);
    if (!valid) {
      setStep(1);
      requestAnimationFrame(() => {
        const fields = [
          "name",
          "customerName",
          "capacityMwp",
          "latitude",
          "longitude",
          "gatewayName",
          "protocol",
          "deviceSerial",
        ] as const;
        focusInvalidFields(Object.fromEntries(fields.map((name) => [name, getFieldState(name).error])));
      });
      return;
    }
    if (valid && validatePayload(true)) {
      setLoading(true);
      try {
        const resolved = await resolveSiteIdentityDraft(
          {
            externalSiteId: formValues.externalSiteId ?? "",
            externalGatewayId: formValues.externalGatewayId ?? "",
            externalDeviceId: payloadMode ? mainDevice.externalDeviceId : formValues.externalDeviceId ?? "",
            additionalDevices: (payloadMode ? additionalDevices : []).map((d) => ({
              externalDeviceId: d.externalDeviceId,
            })),
            endpoint: formValues.endpoint,
            protocolMode: payloadMode ? "standard" : "legacy",
          },
          (draft) => apiClient.post<SiteIdentityDraft>("/v1/sites/identity-draft", draft)
        );
        setValue("externalSiteId", resolved.externalSiteId);
        setValue("externalGatewayId", resolved.externalGatewayId);
        setValue("externalDeviceId", resolved.externalDeviceId);
        setValue("endpoint", resolved.endpoint, { shouldValidate: true });
        setMainDevice((current) => ({ ...current, externalDeviceId: resolved.externalDeviceId }));
        if (payloadMode) {
          setAdditionalDevices((current) =>
            current.map((d, i) => ({ ...d, externalDeviceId: resolved.additionalDevices[i]!.externalDeviceId }))
          );
        }
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "Unable to resolve codes");
        return;
      } finally {
        setLoading(false);
      }
      setStep(3);
      setPingState({ status: "idle", message: "", latencyMs: null });
    }
  };

  const handleTestPing = async () => {
    setPingState({ status: "testing", message: "", latencyMs: null });
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
      setPingState({ status: res.status, message: res.message, latencyMs: res.latencyMs });
    } catch (err: any) {
      setPingState({
        status: "offline",
        message: err.message || "ไม่สามารถติดต่อเซิร์ฟเวอร์เพื่อทดสอบสัญญาณได้",
        latencyMs: null,
      });
    }
  };

  const onSubmit = async (values: SiteDialogFormValues) => {
    if (!validatePayload(false)) return;
    setLoading(true);
    setFormError("");
    try {
      const { customerName: _c, ...siteFields } = values;
      const res = await apiClient.post<{ site: { id: string; name: string } }>("/v1/sites", {
        ...siteFields,
        ...organizationSitePayload(organization),
        protocolMode: payloadMode ? "standard" : "legacy",
        devices: [mainDevice, ...additionalDevices].map((d) => deviceProfilePayload(d)),
        receiveConfig,
      });
      notify.success(
        locale === "th"
          ? `สร้างไซต์งาน "${res.site?.name ?? values.name}" เรียบร้อยแล้ว`
          : `Solar Site "${res.site?.name ?? values.name}" created successfully`
      );
      onCreated?.(res.site.id);
      onOpenChange(false);
      router.refresh();
    } catch (err: any) {
      setFormError(err.message || "เกิดข้อผิดพลาดในการบันทึกไซต์งาน");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] flex-col gap-4 overflow-hidden sm:w-[80vw] sm:max-w-none sm:rounded-2xl sm:p-6 sm:overflow-hidden">
        <DialogHeader className="pb-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Cpu className="size-5 text-primary" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold">
                {locale === "th" ? "เพิ่มไซต์งานและตั้งค่าระบบ" : "Add Solar Site & Gateway"}
              </DialogTitle>
              <DialogDescription className="text-sm">
                {step === 1
                  ? locale === "th"
                    ? "ขั้นตอนที่ 1/2: กรอกข้อมูลทั่วไปและอุปกรณ์เชื่อมต่อ"
                    : "Step 1/2: Site Information & Gateway Settings"
                  : locale === "th"
                  ? "ขั้นตอนที่ 2/2: ทดสอบสัญญาณและการรับข้อมูล"
                  : "Step 2/2: Connection Test & Final Setup"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit, (errs) => focusInvalidFields(errs))} className={siteFormClassName}>
          {formError && <FormErrorSummary>{formError}</FormErrorSummary>}

          {step === 1 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="site-name" required className="text-sm font-medium">
                    {locale === "th" ? "ชื่อไซต์งาน" : "Site Name"}
                  </Label>
                  <Input id="site-name" placeholder="เช่น Solar Site 001" className="text-sm h-10" {...register("name")} />
                  {errors.name && <p className="text-[11px] text-destructive">{errors.name.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="capacity" required className="text-sm font-medium">
                    {locale === "th" ? "กำลังติดตั้ง (MWp)" : "Capacity (MWp)"}
                  </Label>
                  <Input
                    id="capacity"
                    placeholder="0.5"
                    type="number"
                    step="0.01"
                    className="text-sm h-10"
                    {...register("capacityMwp", { valueAsNumber: true })}
                  />
                  {errors.capacityMwp && <p className="text-[11px] text-destructive">{errors.capacityMwp.message}</p>}
                </div>
              </div>

              <OrganizationPicker
                {...organizationCatalog}
                value={organization}
                onChange={selectOrganization}
                locale={locale}
                canEdit={user?.role === "admin"}
                disabled={loading}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="gw-name" required className="text-sm font-medium">
                    {locale === "th" ? "ชื่อ Gateway" : "Gateway Name"}
                  </Label>
                  <Input
                    id="gw-name"
                    placeholder="GW-001"
                    className="text-sm h-10 font-mono"
                    {...register("gatewayName", { onChange: handleGatewayNameChange })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dev-serial" required className="text-sm font-medium">
                    {locale === "th" ? "รหัสซีเรียลมิเตอร์" : "Meter Serial Number"}
                  </Label>
                  <Input
                    id="dev-serial"
                    placeholder="SN-123456"
                    className="text-sm h-10 font-mono"
                    {...register("deviceSerial", {
                      onChange: (e) => setMainDevice((prev) => ({ ...prev, serialNumber: e.target.value })),
                    })}
                  />
                </div>
              </div>

              <BrokerSelect
                value={formValues.mqttBrokerId || ""}
                onChange={(id) => {
                  setValue("mqttBrokerId", id);
                  setPingState((p) => ({ ...p, status: "idle" }));
                }}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <ConnectionTestBox state={pingState} onTest={handleTestPing} locale={locale} />
            </div>
          )}

          <DialogFooter className="sticky bottom-0 z-10 mx-0 mb-0 rounded-lg bg-card border-t pt-2 sm:mx-0 sm:mb-0">
            {step === 1 ? (
              <Button type="button" onClick={handleNextStep} disabled={loading} className="ml-auto">
                {locale === "th" ? "ถัดไป" : "Next"} <ArrowRight className="ml-1 size-4" />
              </Button>
            ) : (
              <div className="flex justify-between w-full">
                <Button type="button" variant="outline" onClick={() => setStep(1)} disabled={loading}>
                  <ArrowLeft className="mr-1 size-4" /> {locale === "th" ? "ย้อนกลับ" : "Back"}
                </Button>
                <Button type="submit" disabled={loading} className="bg-primary text-primary-foreground">
                  {loading ? (locale === "th" ? "กำลังบันทึก..." : "Saving...") : locale === "th" ? "สร้างไซต์งาน" : "Create Site"}
                </Button>
              </div>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Internal Edit Flow
function SiteEditDialogInternal({
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
  const [organization, setOrganization] = React.useState<OrganizationSelection | null>(null);
  const organizationCatalog = useOrganizationCatalog(open);
  const [tab, setTab] = React.useState("settings");
  React.useEffect(() => {
    if (open) setTab(billingSetupPending ? "payload" : "settings");
  }, [open, siteId, billingSetupPending]);

  const [registeredCodes, setRegisteredCodes] = React.useState<{
    siteId: string;
    externalSiteId: string | null;
    externalGatewayId: string | null;
  } | null>(null);
  const [storedPayloadConfig, setPayloadConfig] = React.useState<PayloadConfig | null>(null);
  const payloadScope = React.useRef({ open, siteId });
  payloadScope.current = { open, siteId };

  const [payloadLoader] = React.useState(() =>
    createSitePayloadLoader(
      (requestedSiteId) => apiClient.get<PayloadConfig | null>(`/v1/sites/${encodeURIComponent(requestedSiteId)}/payload-config`),
      () => payloadScope.current,
      setPayloadConfig
    )
  );

  const refreshPayload = React.useCallback(() => {
    void payloadLoader.refresh();
  }, [payloadLoader]);

  React.useEffect(() => {
    payloadLoader.activate(open ? siteId : null);
    setPayloadConfig(null);
    if (open && siteId) refreshPayload();
    return () => payloadLoader.invalidate();
  }, [open, siteId, payloadLoader, refreshPayload]);

  const payloadConfig = open && storedPayloadConfig?.siteId === siteId ? storedPayloadConfig : null;
  const [meterPresets, setMeterPresets] = React.useState<Array<{ id: string; model: string; registers: unknown[] }>>([]);
  const [devices, setDevices] = React.useState<Array<{ id: string; name: string; model: string; serialNumber: string }>>([]);
  const [loading, setLoading] = React.useState(false);
  const [fetching, setFetching] = React.useState(false);
  const [pingState, setPingState] = React.useState<ConnectionTestState>({
    status: "idle",
    message: "",
    latencyMs: null,
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<SiteDialogFormValues>({
    resolver: zodResolver(siteDialogSchema) as any,
    defaultValues: {
      name: "",
      customerName: "",
      status: "online",
      gatewayName: "",
      protocol: "mqtt",
      endpoint: "",
      deviceModel: "",
      deviceSerial: "",
    } as any,
  });

  const formValues = watch();
  const selectOrganization = React.useCallback(
    (selection: OrganizationSelection | null) => {
      setOrganization(selection);
      setValue("customerName", selection?.organization.name ?? "", { shouldValidate: true });
    },
    [setValue]
  );

  React.useEffect(() => {
    let active = true;
    const current = () => active && payloadScope.current.open && payloadScope.current.siteId === siteId;
    if (open && siteId) {
      setFetching(true);
      apiClient
        .get<typeof meterPresets>("/v1/meter-presets")
        .then((rows) => {
          if (current()) setMeterPresets(rows);
        })
        .catch(() => {
          if (current()) setMeterPresets([]);
        });
      apiClient
        .get<typeof devices>(`/v1/sites/${siteId}/devices`)
        .then((rows) => {
          if (current()) setDevices(rows);
        })
        .catch(() => {
          if (current()) setDevices([]);
        });
      setPingState({ status: "idle", message: "", latencyMs: null });

      apiClient
        .get<any>(`/v1/sites/${siteId}`)
        .then((siteData) => {
          if (current() && siteData) {
            setRegisteredCodes({
              siteId: siteData.id,
              externalSiteId: siteData.externalSiteId ?? null,
              externalGatewayId: siteData.externalGatewayId ?? null,
            });
            setOrganization({
              kind: "existing",
              organization: {
                id: siteData.customerId,
                name: siteData.customerName || "",
                code: siteData.customerCode || "",
              },
            });
            reset({
              name: siteData.name || "",
              deviceId: siteData.deviceId,
              customerName: siteData.customerName || "",
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
            } as any);
          }
        })
        .catch((err: any) => {
          if (!current()) return;
          notify.error(err.message || "ไม่สามารถโหลดข้อมูลไซต์งานได้");
          onOpenChange(false);
        })
        .finally(() => {
          if (current()) setFetching(false);
        });
    }
    return () => {
      active = false;
    };
  }, [open, siteId, reset, onOpenChange, refreshPayload]);

  const handleTestPing = async () => {
    setPingState({ status: "testing", message: "", latencyMs: null });
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
      setPingState({ status: res.status, message: res.message, latencyMs: res.latencyMs });
    } catch (err: any) {
      setPingState({
        status: "offline",
        message: err.message || "ไม่สามารถติดต่อเซิร์ฟเวอร์เพื่อทดสอบสัญญาณได้",
        latencyMs: null,
      });
    }
  };

  const onSubmit = async (values: SiteDialogFormValues) => {
    if (!siteId) return;
    setLoading(true);
    try {
      const { customerName: _displayName, deviceId, deviceModel, deviceSerial, ...siteValues } = values;
      const result = await apiClient.patch<{ configDelivery: string }>(`/v1/sites/${siteId}`, {
        ...siteValues,
        ...(!payloadConfig ? { deviceId, deviceModel, deviceSerial } : {}),
        ...organizationSitePayload(organization),
      });
      if (result.configDelivery === "pending") {
        notify.error("บันทึกแล้ว แต่ MQTT config ยังส่งไม่สำเร็จ กรุณาลองอีกครั้ง");
      }
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
          <Tabs
            value={payloadConfig ? tab : "settings"}
            onValueChange={setTab}
            className={`min-h-0 gap-4 overflow-hidden ${siteControlsClassName}`}
          >
            {payloadConfig && (
              <TabsList className={siteTabsListClassName}>
                <TabsTrigger value="settings" className={siteTabsTriggerClassName}>
                  {locale === "th" ? "ข้อมูลไซต์และ Gateway" : "Site & Gateway"}
                </TabsTrigger>
                <TabsTrigger value="payload" className={siteTabsTriggerClassName}>
                  {locale === "th" ? "การเชื่อมต่อและ Preset" : "Connection & Preset"}
                </TabsTrigger>
              </TabsList>
            )}
            <TabsContent value="settings" className="min-h-0 overflow-y-auto p-1">
              <form onSubmit={handleSubmit(onSubmit, (errors) => focusInvalidFields(errors))} className={siteFormClassName}>
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Cpu className="size-4 text-primary" />
                    <span>{locale === "th" ? "ข้อมูลทั่วไปของไซต์งาน" : "General Site Info"}</span>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-site-name" required className="text-sm font-medium">
                      {locale === "th" ? "ชื่อไซต์งาน" : "Site Name"}
                    </Label>
                    <Input id="edit-site-name" placeholder="เช่น Solar Site 020" className="text-sm h-10" {...register("name")} />
                    {errors.name && <p className="text-[11px] text-destructive">{errors.name.message}</p>}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <OrganizationPicker
                      {...organizationCatalog}
                      value={organization}
                      onChange={selectOrganization}
                      locale={locale}
                      canEdit={user?.role === "admin"}
                      disabled={loading}
                    />
                    <div className="space-y-2">
                      <Label htmlFor="edit-capacity" required className="text-sm font-medium">
                        {locale === "th" ? "กำลังติดตั้ง (MWp)" : "Capacity (MWp)"}
                      </Label>
                      <Input
                        id="edit-capacity"
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
                      <Select value={formValues.status || "online"} onValueChange={(val) => setValue("status", val)}>
                        <SelectTrigger id="edit-status" className="text-sm h-10 w-full">
                          <SelectValue placeholder="สถานะ" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="online">ออนไลน์ (Online)</SelectItem>
                          <SelectItem value="offline">ออฟไลน์ (Offline)</SelectItem>
                          <SelectItem value="degraded">ผิดปกติ (Degraded)</SelectItem>
                          <SelectItem value="archived">ระงับใช้งาน (Archived)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Radio className="size-4 text-primary" />
                    {locale === "th" ? "การตั้งค่า Gateway และมิเตอร์หลัก" : "Gateway & billing meter"}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="edit-gw-name" required className="text-sm font-medium">
                        {locale === "th" ? "ชื่อ Gateway" : "Gateway Name"}
                      </Label>
                      <Input id="edit-gw-name" className="text-sm h-10 font-mono bg-card" {...register("gatewayName")} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-gw-endpoint" required className="text-sm font-medium">
                        {locale === "th" ? "Endpoint / MQTT Topic" : "Telemetry Endpoint"}
                      </Label>
                      <Input id="edit-gw-endpoint" className="text-sm h-10 font-mono bg-card" {...register("endpoint")} />
                    </div>
                  </div>

                  <BrokerSelect
                    value={formValues.mqttBrokerId || ""}
                    onChange={(id) => {
                      setValue("mqttBrokerId", id);
                      setPingState((p) => ({ ...p, status: "idle" }));
                    }}
                  />
                  <ConnectionTestBox state={pingState} onTest={handleTestPing} locale={locale} />
                </div>

                <DialogFooter className="sticky bottom-0 z-10 mx-0 mb-0 rounded-lg bg-card border-t sm:mx-0 sm:mb-0">
                  <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                    {t("common.cancel")}
                  </Button>
                  <Button type="submit" size="sm" disabled={loading} className="bg-primary text-primary-foreground">
                    {loading ? t("common.saving") : locale === "th" ? "บันทึกการแก้ไข" : "Save Changes"}
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>

            {payloadConfig && (
              <TabsContent value="payload" className="min-h-0 overflow-y-auto p-1">
                <PayloadConnectionCard
                  showAdvanced={false}
                  edgeToEdge
                  config={payloadConfig}
                  onRefresh={refreshPayload}
                  editable
                  focusBilling={billingSetupPending}
                  billingSetupPending={billingSetupPending}
                />
              </TabsContent>
            )}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Re-export adapters for backward compatibility
export function SiteFormDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (siteId: string) => void;
}) {
  return <SiteDialog mode="create" {...props} />;
}

export function SiteEditDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string | null;
  billingSetupPending?: boolean;
}) {
  return <SiteDialog mode="edit" {...props} />;
}
