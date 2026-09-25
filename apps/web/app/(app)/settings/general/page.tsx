"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bell,
  Check,
  ChevronLeft,
  Clock,
  Coins,
  Globe,
  Laptop,
  Moon,
  Palette,
  Sliders,
  Sun,
  Zap,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useLocale, useSetLocale, useT } from "../../../../providers/locale-provider";
import { apiClient } from "../../../../lib/api-client";
import { notify } from "../../../../components/feedback/notifications";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Label } from "../../../../components/ui/label";
import { Switch } from "../../../../components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/select";
import { Button } from "../../../../components/ui/button";

export default function GeneralSettingsPage() {
  const t = useT();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const { theme, setTheme } = useTheme();

  const [criticalEmailAlert, setCriticalEmailAlert] = React.useState(true);
  const [inAppNotification, setInAppNotification] = React.useState(true);
  const [meterOfflineAlert, setMeterOfflineAlert] = React.useState(true);
  const [energyUnit, setEnergyUnit] = React.useState("kWh");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    apiClient
      .get<{ criticalEmailAlert?: boolean; inAppNotification?: boolean }>("/v1/settings")
      .then((data) => {
        if (data) {
          if (typeof data.criticalEmailAlert === "boolean") {
            setCriticalEmailAlert(data.criticalEmailAlert);
          }
          if (typeof data.inAppNotification === "boolean") {
            setInAppNotification(data.inAppNotification);
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveNotifications = async (newEmail: boolean, newInApp: boolean) => {
    try {
      await apiClient.put("/v1/settings", {
        criticalEmailAlert: newEmail,
        inAppNotification: newInApp,
      });
      notify.success(locale === "th" ? "บันทึกการตั้งค่าเรียบร้อยแล้ว" : "Settings saved successfully");
    } catch {
      notify.error(locale === "th" ? "ไม่สามารถบันทึกการตั้งค่าได้" : "Failed to save settings");
    }
  };

  return (
    <main className="content">
      <div className="ops-content max-w-4xl space-y-5">
        {/* Navigation Back Link (Mobile Only) */}
        <div className="block md:hidden">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ChevronLeft className="size-4" />
            <span>{locale === "th" ? "การตั้งค่า" : "Settings"}</span>
          </Link>
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl flex items-center gap-2.5">
            <Sliders className="size-6 text-primary" />
            <span>{locale === "th" ? "การตั้งค่าทั่วไป" : "General Settings"}</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {locale === "th"
              ? "จัดการภาษา ธีมการแสดงผล การแจ้งเตือน และหน่วยการแสดงผล"
              : "Manage language, theme appearance, notifications, and unit preferences"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Card 1: Language & Region */}
          <Card className="panel">
            <CardHeader className="p-0 pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Globe className="size-4 text-primary" />
                <span>{locale === "th" ? "ภาษาและภูมิภาค" : "Language & Region"}</span>
              </CardTitle>
              <CardDescription className="text-xs">
                {locale === "th" ? "กำหนดภาษาหลักที่ใช้แสดงผลในระบบ" : "Select your preferred platform language"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 pt-3 space-y-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  {locale === "th" ? "เลือกภาษา (Language)" : "Language"}
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLocale("th")}
                    className={`flex items-center justify-between p-3 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                      locale === "th"
                        ? "border-[#EAB308] bg-[#EAB308]/10 text-foreground ring-1 ring-[#EAB308]"
                        : "border-border/60 bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">🇹🇭</span>
                      <span>ภาษาไทย (TH)</span>
                    </div>
                    {locale === "th" && <Check className="size-4 text-[#EAB308]" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setLocale("en")}
                    className={`flex items-center justify-between p-3 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                      locale === "en"
                        ? "border-[#EAB308] bg-[#EAB308]/10 text-foreground ring-1 ring-[#EAB308]"
                        : "border-border/60 bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">🇬🇧</span>
                      <span>English (EN)</span>
                    </div>
                    {locale === "en" && <Check className="size-4 text-[#EAB308]" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  {locale === "th" ? "เขตเวลา (Timezone)" : "Timezone"}
                </span>
                <span className="font-medium text-foreground">Asia/Bangkok (GMT+7)</span>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Theme & Appearance */}
          <Card className="panel">
            <CardHeader className="p-0 pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Palette className="size-4 text-primary" />
                <span>{locale === "th" ? "ธีมการแสดงผล" : "Appearance & Theme"}</span>
              </CardTitle>
              <CardDescription className="text-xs">
                {locale === "th" ? "เลือกโหมดการแสดงผลที่สบายตากับคุณ" : "Choose your preferred color theme"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 pt-3 space-y-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  {locale === "th" ? "โหมดสี (Theme Mode)" : "Theme Mode"}
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setTheme("light")}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                      theme === "light"
                        ? "border-[#EAB308] bg-[#EAB308]/10 text-foreground ring-1 ring-[#EAB308]"
                        : "border-border/60 bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Sun className="size-5" />
                    <span>{locale === "th" ? "โหมดสว่าง" : "Light"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTheme("dark")}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                      theme === "dark"
                        ? "border-[#EAB308] bg-[#EAB308]/10 text-foreground ring-1 ring-[#EAB308]"
                        : "border-border/60 bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Moon className="size-5" />
                    <span>{locale === "th" ? "โหมดมืด" : "Dark"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTheme("system")}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                      theme === "system"
                        ? "border-[#EAB308] bg-[#EAB308]/10 text-foreground ring-1 ring-[#EAB308]"
                        : "border-border/60 bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Laptop className="size-5" />
                    <span>{locale === "th" ? "ตามระบบ" : "System"}</span>
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Notification Preferences */}
          <Card className="panel">
            <CardHeader className="p-0 pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Bell className="size-4 text-primary" />
                <span>{locale === "th" ? "การตั้งค่าการแจ้งเตือน" : "Notification Preferences"}</span>
              </CardTitle>
              <CardDescription className="text-xs">
                {locale === "th"
                  ? "ควบคุมช่องทางการแจ้งเตือนเหตุการณ์สำคัญ"
                  : "Control channels for alerts and events"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 pt-3 space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="critical-email" className="text-xs font-medium cursor-pointer">
                    {locale === "th" ? "อีเมลแจ้งเตือนเหตุวิกฤต (Critical Email)" : "Critical Email Alerts"}
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    {locale === "th"
                      ? "ส่งอีเมลทันทีเมื่อมิเตอร์ขัดข้องหรือแรงดันไฟผิดปกติ"
                      : "Receive instant emails on critical inverter faults"}
                  </p>
                </div>
                <Switch
                  id="critical-email"
                  checked={criticalEmailAlert}
                  onCheckedChange={(checked) => {
                    setCriticalEmailAlert(checked);
                    handleSaveNotifications(checked, inAppNotification);
                  }}
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border/40">
                <div className="space-y-0.5">
                  <Label htmlFor="in-app" className="text-xs font-medium cursor-pointer">
                    {locale === "th" ? "การแจ้งเตือนในระบบ (In-App Alerts)" : "In-App Notifications"}
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    {locale === "th"
                      ? "แสดงป๊อปอัปและแบดจ์แจ้งเตือนที่ปุ่มกระดิ่ง"
                      : "Show notifications badge in header"}
                  </p>
                </div>
                <Switch
                  id="in-app"
                  checked={inAppNotification}
                  onCheckedChange={(checked) => {
                    setInAppNotification(checked);
                    handleSaveNotifications(criticalEmailAlert, checked);
                  }}
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border/40">
                <div className="space-y-0.5">
                  <Label htmlFor="meter-offline" className="text-xs font-medium cursor-pointer">
                    {locale === "th" ? "แจ้งเตือนมิเตอร์ออฟไลน์ (Offline Alert)" : "Meter Offline Alerts"}
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    {locale === "th"
                      ? "แจ้งเตือนเมื่ออุปกรณ์หยุดส่งข้อมูลเกิน 5 นาที"
                      : "Notify when device telemetry disconnects > 5m"}
                  </p>
                </div>
                <Switch
                  id="meter-offline"
                  checked={meterOfflineAlert}
                  onCheckedChange={(checked) => {
                    setMeterOfflineAlert(checked);
                    notify.info(
                      locale === "th"
                        ? checked
                          ? "เปิดการแจ้งเตือนมิเตอร์ออฟไลน์แล้ว"
                          : "ปิดการแจ้งเตือนมิเตอร์ออฟไลน์แล้ว"
                        : "Offline alert updated"
                    );
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Card 4: Units & Measurement */}
          <Card className="panel">
            <CardHeader className="p-0 pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Zap className="size-4 text-primary" />
                <span>{locale === "th" ? "หน่วยการแสดงผล" : "Units & Measurement"}</span>
              </CardTitle>
              <CardDescription className="text-xs">
                {locale === "th" ? "หน่วยวัดพลังงานและค่าเงินในแดชบอร์ด" : "Default power and currency units"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 pt-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium">
                    {locale === "th" ? "หน่วยพลังงานสะสม" : "Energy Unit"}
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    {locale === "th" ? "หน่วยแสดงผลบนกราฟและสถิติ" : "Display unit for chart and stats"}
                  </p>
                </div>
                <Select value={energyUnit} onValueChange={setEnergyUnit}>
                  <SelectTrigger className="w-28 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kWh" className="text-xs">kWh</SelectItem>
                    <SelectItem value="MWh" className="text-xs">MWh</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border/40">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium">
                    {locale === "th" ? "สกุลเงิน (Currency)" : "Currency"}
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    {locale === "th" ? "ใช้สำหรับคำนวณรายได้และค่าไฟฟ้า" : "Currency for billing calculation"}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md bg-muted border border-border/60">
                  <Coins className="size-3.5 text-primary" />
                  <span>THB (บาท)</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
