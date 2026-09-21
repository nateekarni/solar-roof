"use client";

import { BellRing } from "lucide-react";
import * as React from "react";
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
import { Switch } from "../../components/ui/switch";
import { apiClient } from "../../lib/api-client";
import { useLocale, useT } from "../../providers/locale-provider";

export function NotificationSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [loading, setLoading] = React.useState(false);
  const [criticalEmail, setCriticalEmail] = React.useState(true);
  const [inApp, setInApp] = React.useState(true);
  const [emailAddress, setEmailAddress] = React.useState("admin@solar-roof.com");

  const handleSave = async () => {
    setLoading(true);
    try {
      await apiClient.put("/v1/notifications/settings", {
        criticalEmailAlert: criticalEmail,
        inAppNotification: inApp,
        emailAddress,
      });
      notify.success(
        locale === "th"
          ? "บันทึกการตั้งค่าการแจ้งเตือนเรียบร้อยแล้ว"
          : "Notification preferences saved successfully"
      );
      onOpenChange(false);
    } catch (err: any) {
      notify.error(err.message || "เกิดข้อผิดพลาดในการบันทึก");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <BellRing className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                {locale === "th" ? "ตั้งค่าการแจ้งเตือน" : "Notification Settings"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {locale === "th"
                  ? "กำหนดช่องทางการรับข่าวสารและ Alarm เตือนภัยระบบ"
                  : "Configure channels for alarm alerts and system updates"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="s-email-alert" className="text-xs font-semibold cursor-pointer">
                {locale === "th" ? "การแจ้งเตือนทางอีเมล" : "Email Alerts"}
              </Label>
              <p className="text-[11px] text-muted-foreground">
                {locale === "th" ? "ส่งอีเมลทันทีเมื่อมี Alarm ระดับวิกฤต" : "Send instant email on critical alarms"}
              </p>
            </div>
            <Switch
              id="s-email-alert"
              checked={criticalEmail}
              onCheckedChange={setCriticalEmail}
            />
          </div>

          {criticalEmail && (
            <div className="space-y-1.5 pl-1">
              <Label htmlFor="s-email" className="text-xs font-medium">
                {locale === "th" ? "อีเมลสำหรับรับการแจ้งเตือน" : "Notification Recipient Email"}
              </Label>
              <Input
                id="s-email"
                type="email"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                className="text-xs h-9"
              />
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="s-in-app" className="text-xs font-semibold cursor-pointer">
                {locale === "th" ? "การแจ้งเตือนภายในระบบ (In-App)" : "In-App Notifications"}
              </Label>
              <p className="text-[11px] text-muted-foreground">
                {locale === "th" ? "แสดงการแจ้งเตือนที่ปุ่มกระดิ่งมุมขวาบน" : "Show alerts on the top header bell icon"}
              </p>
            </div>
            <Switch
              id="s-in-app"
              checked={inApp}
              onCheckedChange={setInApp}
            />
          </div>
        </div>

        <DialogFooter className="pt-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs h-9"
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={loading}
            className="text-xs h-9 font-semibold"
          >
            {loading ? t("common.saving") : t("common.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
