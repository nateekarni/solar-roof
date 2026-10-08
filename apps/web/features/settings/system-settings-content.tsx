"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, Edit2, Sliders } from "lucide-react";
import { useLocale, useT } from "../../providers/locale-provider";
import { apiClient } from "../../lib/api-client";
import { AppLoading } from "../../components/feedback/app-loading";
import { notify } from "../../components/feedback/notifications";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";

export type SettingsForm = {
  invoicePrefix: string;
  receiptPrefix: string;
  defaultUnitPriceThb: number;
  defaultFetchFrequencySec: number;
  rawTelemetryRetentionYears: number;
  aggregateRetentionYears: number;
  language: string;
  criticalEmailAlert: boolean;
  inAppNotification: boolean;
};

interface SystemSettingsContentProps {
  showBackLink?: boolean;
}

export function SystemSettingsContent({ showBackLink = false }: SystemSettingsContentProps) {
  const t = useT();
  const locale = useLocale();

  const [form, setForm] = React.useState<SettingsForm>({
    invoicePrefix: "INV{year}{month}",
    receiptPrefix: "RCT{year}{month}",
    defaultUnitPriceThb: 4.5,
    defaultFetchFrequencySec: 60,
    rawTelemetryRetentionYears: 2,
    aggregateRetentionYears: 7,
    language: "th",
    criticalEmailAlert: true,
    inAppNotification: true,
  });

  const [editingCard, setEditingCard] = React.useState<string | null>(null);
  const [cardDraft, setCardDraft] = React.useState<SettingsForm>({ ...form });
  const [saving, setSaving] = React.useState(false);
  const [loading,setLoading] = React.useState(true);
  const [loadError,setLoadError] = React.useState(false);

  React.useEffect(() => {
    apiClient
      .get<Partial<SettingsForm>>("/v1/settings")
      .then((data) => {
        if (data) {
          setForm((prev) => {
            const updated = { ...prev, ...data };
            setCardDraft(updated);
            return updated;
          });
        }
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  const handleStartEdit = (cardKey: string) => {
    setCardDraft({ ...form });
    setEditingCard(cardKey);
  };

  const handleCancel = () => {
    setCardDraft({ ...form });
    setEditingCard(null);
  };

  const handleSaveCard = async () => {
    setSaving(true);
    try {
      await apiClient.put("/v1/settings", cardDraft);
      setForm({ ...cardDraft });
      notify.success(t("settings.saveSuccess"));
      setEditingCard(null);
    } catch {
      notify.error(t("settings.saveError"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="ops-content"><AppLoading message={locale === "th" ? "กำลังโหลดการตั้งค่า…" : "Loading settings…"} /></div>;
  if (loadError) return <div className="ops-content text-sm" role="alert">{locale === "th" ? "ไม่สามารถโหลดการตั้งค่าระบบ" : "Unable to load system settings"}</div>;
  return (
    <div className="ops-content">
      {/* Mobile Back Button (Mobile Only) */}
      {showBackLink && (
        <div className="block md:hidden mb-3">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="size-4" />
            <span>{locale === "th" ? "การตั้งค่า" : "Settings"}</span>
          </Link>
        </div>
      )}

      {/* Page Heading */}
      <div className="mb-4">
        <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl flex items-center gap-2">
          <span>{t("navigation.systemDefaults")}</span>
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {(locale === "th" ? "กำหนดค่าระบบ เลขที่เอกสาร และการเก็บรักษาข้อมูล" : t("settings.description"))}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
        {/* Card 1: System Defaults */}
        <Card className="panel h-full flex flex-col justify-between">
          <div>
            <CardHeader className="p-0 pb-1.5 flex flex-row items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <CardTitle className="text-sm font-semibold text-foreground">
                  {t("navigation.systemDefaults")}
                </CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  {locale === "th"
                    ? "กำหนดราคาต่อหน่วยและความถี่ดึงข้อมูลมิเตอร์ตั้งต้น"
                    : "Set the default unit price and meter data fetch frequency."}
                </CardDescription>
              </div>
              {editingCard !== "defaults" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleStartEdit("defaults")}
                  className="h-10 shrink-0 gap-1.5 text-xs"
                >
                  <Edit2 className="size-3.5" />
                  <span>{locale === "th" ? "แก้ไข" : "Edit"}</span>
                </Button>
              )}
            </CardHeader>

            <CardContent className="flex flex-col p-0 pt-1">
              {editingCard === "defaults" ? (
                <div className="flex flex-col gap-2.5 pt-1">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="unit-price" className="text-xs">
                      {locale === "th" ? "ราคาต่อหน่วยตั้งต้น (THB / kWh)" : "Default Unit Price (THB / kWh)"}
                    </Label>
                    <Input
                      id="unit-price"
                      type="number"
                      step="0.01"
                      value={cardDraft.defaultUnitPriceThb}
                      onChange={(e) =>
                        setCardDraft({
                          ...cardDraft,
                          defaultUnitPriceThb: Number(e.target.value),
                        })
                      }
                      className="h-10 text-xs"
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {locale === "th"
                        ? "ใช้กรอกสัญญาอัตโนมัติและคำนวณบิล"
                        : "Used to auto-fill contracts and calculate bills"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="fetch-freq" className="text-xs">
                      {locale === "th"
                        ? "ความถี่ดึงข้อมูลมิเตอร์ตั้งต้น (sec)"
                        : "Default Meter Fetch Frequency (sec)"}
                    </Label>
                    <Input
                      id="fetch-freq"
                      type="number"
                      min="10"
                      max="3600"
                      value={cardDraft.defaultFetchFrequencySec}
                      onChange={(e) =>
                        setCardDraft({
                          ...cardDraft,
                          defaultFetchFrequencySec: Number(e.target.value),
                        })
                      }
                      className="h-10 text-xs"
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {locale === "th"
                        ? "ค่าตั้งต้นสำหรับเกตเวย์และการดึงข้อมูล MQTT (60 sec)"
                        : "Default for Gateway & MQTT polling (60 sec)"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-xs">
                  <div className="flex flex-col gap-1 py-2">
                    <span className="text-muted-foreground">
                      {locale === "th" ? "ราคาต่อหน่วยตั้งต้น" : "Default Unit Price"}
                    </span>
                    <strong className="text-foreground font-semibold">
                      {form.defaultUnitPriceThb} THB / kWh
                    </strong>
                  </div>
                  <div className="flex flex-col gap-1 py-2">
                    <span className="text-muted-foreground">
                      {locale === "th" ? "ความถี่ดึงข้อมูลมิเตอร์" : "Fetch Frequency"}
                    </span>
                    <strong className="text-foreground font-semibold">
                      {form.defaultFetchFrequencySec} sec
                    </strong>
                  </div>
                </div>
              )}
            </CardContent>
          </div>

          {editingCard === "defaults" && (
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60 mt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                className="h-10 text-xs"
              >
                {locale === "th" ? "ยกเลิก" : "Cancel"}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saving}
                onClick={handleSaveCard}
                className="h-10 text-xs font-semibold bg-[#EAB308] text-[#0F172A] hover:bg-[#EAB308]/90"
              >
                {saving ? (locale === "th" ? "กำลังบันทึก..." : "Saving...") : (locale === "th" ? "บันทึก" : "Save")}
              </Button>
            </div>
          )}
        </Card>

        {/* Card 2: Document Series */}
        <Card className="panel h-full flex flex-col justify-between">
          <div>
            <CardHeader className="p-0 pb-1.5 flex flex-row items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <CardTitle className="text-sm font-semibold text-foreground">
                  {t("settings.documentSeries")}
                </CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  {locale === "th"
                    ? "กำหนดคำนำหน้าเลขที่ใบแจ้งหนี้และใบเสร็จ"
                    : "Configure invoice and receipt number prefixes."}
                </CardDescription>
              </div>
              {editingCard !== "documents" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleStartEdit("documents")}
                  className="h-10 shrink-0 gap-1.5 text-xs"
                >
                  <Edit2 className="size-3.5" />
                  <span>{locale === "th" ? "แก้ไข" : "Edit"}</span>
                </Button>
              )}
            </CardHeader>

            <CardContent className="flex flex-col p-0 pt-1">
              {editingCard === "documents" ? (
                <div className="flex flex-col gap-2.5 pt-1">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="invoice-prefix" className="text-xs">
                      {(locale === "th" ? "คำนำหน้าเลขที่ใบแจ้งหนี้" : t("settings.invoicePrefix"))}
                    </Label>
                    <Input
                      id="invoice-prefix"
                      value={cardDraft.invoicePrefix}
                      onChange={(e) =>
                        setCardDraft({ ...cardDraft, invoicePrefix: e.target.value })
                      }
                      className="h-10 text-xs"
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {locale === "th"
                        ? "ใช้ {year} แทนปี ค.ศ. (เช่น 2026) และ {month} แทนเดือน 2 หลัก (เช่น 08, 09) ต่อด้วยเลขรัน 4 หลัก 0001-9999 เช่น INV2026080001"
                        : "Use {year} for year (e.g. 2026) and {month} for month (e.g. 08), followed by 4-digit sequence 0001-9999"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="receipt-prefix" className="text-xs">
                      {(locale === "th" ? "คำนำหน้าเลขที่ใบเสร็จ" : t("settings.receiptPrefix"))}
                    </Label>
                    <Input
                      id="receipt-prefix"
                      value={cardDraft.receiptPrefix}
                      onChange={(e) =>
                        setCardDraft({ ...cardDraft, receiptPrefix: e.target.value })
                      }
                      className="h-10 text-xs"
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {locale === "th"
                        ? "ใช้ {year} แทนปี ค.ศ. (เช่น 2026) และ {month} แทนเดือน 2 หลัก (เช่น 08, 09) ต่อด้วยเลขรัน 4 หลัก 0001-9999 เช่น RCT2026080001"
                        : "Use {year} for year (e.g. 2026) and {month} for month (e.g. 08), followed by 4-digit sequence 0001-9999"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-xs">
                  <div className="flex flex-col gap-1 py-2">
                    <span className="text-muted-foreground">{(locale === "th" ? "คำนำหน้าเลขที่ใบแจ้งหนี้" : t("settings.invoicePrefix"))}</span>
                    <strong className="text-foreground font-mono font-semibold">
                      {form.invoicePrefix}
                    </strong>
                  </div>
                  <div className="flex flex-col gap-1 py-2">
                    <span className="text-muted-foreground">{(locale === "th" ? "คำนำหน้าเลขที่ใบเสร็จ" : t("settings.receiptPrefix"))}</span>
                    <strong className="text-foreground font-mono font-semibold">
                      {form.receiptPrefix}
                    </strong>
                  </div>
                </div>
              )}
            </CardContent>
          </div>

          {editingCard === "documents" && (
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60 mt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                className="h-10 text-xs"
              >
                {locale === "th" ? "ยกเลิก" : "Cancel"}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saving}
                onClick={handleSaveCard}
                className="h-10 text-xs font-semibold bg-[#EAB308] text-[#0F172A] hover:bg-[#EAB308]/90"
              >
                {saving ? (locale === "th" ? "กำลังบันทึก..." : "Saving...") : (locale === "th" ? "บันทึก" : "Save")}
              </Button>
            </div>
          )}
        </Card>

        {/* Card 3: Retention */}
        <Card className="panel h-full flex flex-col justify-between">
          <div>
            <CardHeader className="p-0 pb-1.5 flex flex-row items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <CardTitle className="text-sm font-semibold text-foreground">
                  {t("settings.retention")}
                </CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  {locale === "th"
                    ? "กำหนดระยะเวลาเก็บข้อมูลมิเตอร์ดิบ ข้อมูลสรุป และเอกสาร"
                    : "Set how long raw meter data, summaries and documents are retained."}
                </CardDescription>
              </div>
              {editingCard !== "retention" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleStartEdit("retention")}
                  className="h-10 shrink-0 gap-1.5 text-xs"
                >
                  <Edit2 className="size-3.5" />
                  <span>{locale === "th" ? "แก้ไข" : "Edit"}</span>
                </Button>
              )}
            </CardHeader>

            <CardContent className="flex flex-col p-0 pt-1">
              {editingCard === "retention" ? (
                <div className="flex flex-col gap-2.5 pt-1">
                  <div className="flex flex-col gap-2">
                    <Label className="text-xs">{(locale === "th" ? "ข้อมูลมิเตอร์ดิบ" : t("settings.rawTelemetry"))}</Label>
                    <Select
                      value={`${cardDraft.rawTelemetryRetentionYears}`}
                      onValueChange={(val) =>
                        setCardDraft({
                          ...cardDraft,
                          rawTelemetryRetentionYears: Number(val),
                        })
                      }
                    >
                      <SelectTrigger className="h-10 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="1" className="text-xs">1 {locale === "th" ? "ปี" : "Year"}</SelectItem>
                          <SelectItem value="2" className="text-xs">2 {locale === "th" ? "ปี" : "Years"}</SelectItem>
                          <SelectItem value="3" className="text-xs">3 {locale === "th" ? "ปี" : "Years"}</SelectItem>
                          <SelectItem value="5" className="text-xs">5 {locale === "th" ? "ปี" : "Years"}</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label className="text-xs">
                      {(locale === "th" ? "ข้อมูลสรุปและเอกสาร" : t("settings.aggregateDocuments"))}
                    </Label>
                    <Select
                      value={`${cardDraft.aggregateRetentionYears}`}
                      onValueChange={(val) =>
                        setCardDraft({
                          ...cardDraft,
                          aggregateRetentionYears: Number(val),
                        })
                      }
                    >
                      <SelectTrigger className="h-10 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="5" className="text-xs">5 {locale === "th" ? "ปี" : "Years"}</SelectItem>
                          <SelectItem value="7" className="text-xs">7 {locale === "th" ? "ปี" : "Years"}</SelectItem>
                          <SelectItem value="10" className="text-xs">10 {locale === "th" ? "ปี" : "Years"}</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="text-xs">
                  <div className="flex flex-col gap-1 py-2">
                    <span className="text-muted-foreground">{(locale === "th" ? "ข้อมูลมิเตอร์ดิบ" : t("settings.rawTelemetry"))}</span>
                    <strong className="text-foreground font-semibold">
                      {form.rawTelemetryRetentionYears} {locale === "th" ? "ปี" : "Years"}
                    </strong>
                  </div>
                  <div className="flex flex-col gap-1 py-2">
                    <span className="text-muted-foreground">{(locale === "th" ? "ข้อมูลสรุปและเอกสาร" : t("settings.aggregateDocuments"))}</span>
                    <strong className="text-foreground font-semibold">
                      {form.aggregateRetentionYears} {locale === "th" ? "ปี" : "Years"}
                    </strong>
                  </div>
                </div>
              )}
            </CardContent>
          </div>

          {editingCard === "retention" && (
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60 mt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                className="h-10 text-xs"
              >
                {locale === "th" ? "ยกเลิก" : "Cancel"}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saving}
                onClick={handleSaveCard}
                className="h-10 text-xs font-semibold bg-[#EAB308] text-[#0F172A] hover:bg-[#EAB308]/90"
              >
                {saving ? (locale === "th" ? "กำลังบันทึก..." : "Saving...") : (locale === "th" ? "บันทึก" : "Save")}
              </Button>
            </div>
          )}
        </Card>
        <Card className="panel space-y-4">
          <CardHeader className="p-0 flex flex-row items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <CardTitle className="text-sm font-semibold">
                {locale === "th" ? "การแจ้งเตือน" : "Notifications"}
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                {locale === "th"
                  ? "เปิดหรือปิดอีเมลแจ้งเตือนสำคัญและการแจ้งเตือนในระบบ"
                  : "Turn critical email alerts and in-app notifications on or off."}
              </CardDescription>
            </div>
            {editingCard !== "notifications" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleStartEdit("notifications")}
                className="h-10 shrink-0 gap-1.5 text-xs"
              >
                <Edit2 className="size-3.5" />
                <span>{locale === "th" ? "แก้ไข" : "Edit"}</span>
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0 space-y-4">
          {editingCard === 'notifications' ? <div className="space-y-4">{([['criticalEmailAlert','อีเมลแจ้งเตือนสำคัญ','Critical email alerts'],['inAppNotification','การแจ้งเตือนในระบบ','In-app notifications']] as const).map(([key,th,en])=><div key={key} className="space-y-2"><Label htmlFor={key}>{locale === 'th' ? th : en}</Label><Switch id={key} checked={cardDraft[key]} onCheckedChange={checked=>setCardDraft({...cardDraft,[key]:checked})}/></div>)}<div className="flex gap-2"><Button variant="outline" disabled={saving} onClick={handleCancel}>{locale === 'th' ? 'ยกเลิก' : 'Cancel'}</Button><Button disabled={saving} onClick={handleSaveCard}>{locale === 'th' ? 'บันทึก' : 'Save'}</Button></div></div> : <><dl className="space-y-4">{([['criticalEmailAlert','อีเมลแจ้งเตือนสำคัญ','Critical email alerts'],['inAppNotification','การแจ้งเตือนในระบบ','In-app notifications']] as const).map(([key,th,en])=><div key={key} className="space-y-1"><dt className="text-sm text-muted-foreground">{locale === 'th' ? th : en}</dt><dd className="text-sm font-medium">{form[key] ? locale === 'th' ? 'เปิด' : 'On' : locale === 'th' ? 'ปิด' : 'Off'}</dd></div>)}</dl></>}
        </CardContent></Card>
      </div>
    </div>
  );
}
