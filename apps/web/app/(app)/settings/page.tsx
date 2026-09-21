"use client";

import { useLocale, useT } from "../../../providers/locale-provider";
import * as React from "react";
import { ConfirmAction } from "../../../components/feedback/confirm-action";
import { notify } from "../../../components/feedback/notifications";
import { apiClient } from "../../../lib/api-client";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Switch } from "../../../components/ui/switch";

export default function SettingsPage() {
  const t = useT();
  const locale = useLocale();
  const [loading, setLoading] = React.useState(false);

  const [form, setForm] = React.useState({
    invoicePrefix: "INV-{year}-",
    receiptPrefix: "RCT-{year}-",
    defaultUnitPriceThb: 4.5,
    defaultFetchFrequencySec: 60,
    rawTelemetryRetentionYears: 2,
    aggregateRetentionYears: 7,
    language: "th",
    criticalEmailAlert: true,
    inAppNotification: true,
  });

  React.useEffect(() => {
    apiClient
      .get<Partial<typeof form>>("/v1/settings")
      .then((data) => {
        if (data) setForm((prev) => ({ ...prev, ...data }));
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    setLoading(true);
    try {
      await apiClient.put("/v1/settings", form);
      notify.success(t("settings.saveSuccess"));
    } catch {
      notify.error(t("settings.saveError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="content">
      <div className="ops-content">
        <div className="page-heading">
          <div>
            <span className="eyebrow">{t("settings.eyebrow")}</span>
            <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
              {t("settings.title")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("settings.description")}
            </p>
          </div>
          <ConfirmAction
            trigger={
              <Button
                type="button"
                size="sm"
                className="font-semibold shadow-xs"
                disabled={loading}
              >
                {loading ? "กำลังบันทึก..." : t("common.save")}
              </Button>
            }
            title={t("settings.saveConfirmTitle")}
            description={t("settings.saveConfirmDesc")}
            confirmLabel={t("common.save")}
            onConfirm={save}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Card: System Defaults */}
          <Card className="panel h-full">
            <CardHeader className="p-0 pb-3">
              <CardDescription className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                SYSTEM DEFAULTS
              </CardDescription>
              <CardTitle className="text-sm font-semibold text-foreground">
                {t("navigation.systemDefaults")}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 p-0 pt-1">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="unit-price" className="text-xs">
                  ราคาต่อหน่วยตั้งต้น (THB / kWh)
                </Label>
                <Input
                  id="unit-price"
                  type="number"
                  step="0.01"
                  value={form.defaultUnitPriceThb}
                  onChange={(e) =>
                    setForm({ ...form, defaultUnitPriceThb: Number(e.target.value) })
                  }
                  className="h-9 text-xs"
                />
                <span className="text-[10px] text-muted-foreground">
                  ใช้ Auto-fill ในการทำสัญญาและคำนวณบิล
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fetch-freq" className="text-xs">
                  ความถี่ดึงข้อมูลมิเตอร์ตั้งต้น (วินาที)
                </Label>
                <Input
                  id="fetch-freq"
                  type="number"
                  min="10"
                  max="3600"
                  value={form.defaultFetchFrequencySec}
                  onChange={(e) =>
                    setForm({ ...form, defaultFetchFrequencySec: Number(e.target.value) })
                  }
                  className="h-9 text-xs"
                />
                <span className="text-[10px] text-muted-foreground">
                  Default สำหรับ Gateway & MQTT polling (60 วินาที)
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Card 1: Document Series */}
          <Card className="panel h-full">
            <CardHeader className="p-0 pb-3">
              <CardDescription className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                DOCUMENT SERIES
              </CardDescription>
              <CardTitle className="text-sm font-semibold text-foreground">
                {t("settings.documentSeries")}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 p-0 pt-1">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invoice-prefix" className="text-xs">
                  {t("settings.invoicePrefix")}
                </Label>
                <Input
                  id="invoice-prefix"
                  value={form.invoicePrefix}
                  onChange={(e) =>
                    setForm({ ...form, invoicePrefix: e.target.value })
                  }
                  className="h-9 text-xs"
                />
                <span className="text-[10px] text-muted-foreground">
                  {locale === "th"
                    ? "ใช้ {year} สำหรับแทนปี ค.ศ. ปัจจุบันอัตโนมัติ"
                    : "Use {year} to auto-fill current year"}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="receipt-prefix" className="text-xs">
                  {t("settings.receiptPrefix")}
                </Label>
                <Input
                  id="receipt-prefix"
                  value={form.receiptPrefix}
                  onChange={(e) =>
                    setForm({ ...form, receiptPrefix: e.target.value })
                  }
                  className="h-9 text-xs"
                />
                <span className="text-[10px] text-muted-foreground">
                  {locale === "th"
                    ? "ใช้ {year} สำหรับแทนปี ค.ศ. ปัจจุบันอัตโนมัติ"
                    : "Use {year} to auto-fill current year"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Data Retention */}
          <Card className="panel h-full">
            <CardHeader className="p-0 pb-3">
              <CardDescription className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                RETENTION
              </CardDescription>
              <CardTitle className="text-sm font-semibold text-foreground">
                {t("settings.retention")}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 p-0 pt-1">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">{t("settings.rawTelemetry")}</Label>
                <Select
                  value={`${form.rawTelemetryRetentionYears}`}
                  onValueChange={(val) =>
                    setForm({
                      ...form,
                      rawTelemetryRetentionYears: Number(val),
                    })
                  }
                >
                  <SelectTrigger
                    className="h-9 text-xs"
                    aria-label={t("settings.rawTelemetry")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="1" className="text-xs">
                        1 ปี
                      </SelectItem>
                      <SelectItem value="2" className="text-xs">
                        2 ปี
                      </SelectItem>
                      <SelectItem value="3" className="text-xs">
                        3 ปี
                      </SelectItem>
                      <SelectItem value="5" className="text-xs">
                        5 ปี
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">
                  {t("settings.aggregateDocuments")}
                </Label>
                <Select
                  value={`${form.aggregateRetentionYears}`}
                  onValueChange={(val) =>
                    setForm({
                      ...form,
                      aggregateRetentionYears: Number(val),
                    })
                  }
                >
                  <SelectTrigger
                    className="h-9 text-xs"
                    aria-label={t("settings.aggregateDocuments")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="5" className="text-xs">
                        5 ปี
                      </SelectItem>
                      <SelectItem value="7" className="text-xs">
                        7 ปี
                      </SelectItem>
                      <SelectItem value="10" className="text-xs">
                        10 ปี
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Locale & Alerts */}
          <Card className="panel h-full">
            <CardHeader className="p-0 pb-3">
              <CardDescription className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                LOCALE & ALERTS
              </CardDescription>
              <CardTitle className="text-sm font-semibold text-foreground">
                {t("settings.localeAlerts")}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 p-0 pt-1">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">{t("settings.language")}</Label>
                <Select
                  value={form.language}
                  onValueChange={(val) => setForm({ ...form, language: val })}
                >
                  <SelectTrigger
                    className="h-9 text-xs"
                    aria-label={t("settings.language")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="th" className="text-xs">
                        {t("settings.thai")}
                      </SelectItem>
                      <SelectItem value="en" className="text-xs">
                        {t("settings.english")}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2.5 pt-1">
                <Switch
                  id="critical-email"
                  checked={form.criticalEmailAlert}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, criticalEmailAlert: checked })
                  }
                />
                <Label
                  htmlFor="critical-email"
                  className="text-xs cursor-pointer"
                >
                  {t("settings.criticalEmail")}
                </Label>
              </div>
              <div className="flex items-center gap-2.5">
                <Switch
                  id="in-app"
                  checked={form.inAppNotification}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, inAppNotification: checked })
                  }
                />
                <Label htmlFor="in-app" className="text-xs cursor-pointer">
                  {t("settings.inApp")}
                </Label>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
