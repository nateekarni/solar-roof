"use client";

import * as React from "react";
import { AlertCircle, AlertOctagon, AlertTriangle, BellRing, Check, CheckCircle2, Clock, Info, Wrench } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { notify } from "../../../components/feedback/notifications";
import { apiClient } from "../../../lib/api-client";
import { useLocale } from "../../../providers/locale-provider";
import { useRouter } from "next/navigation";

export interface AlertItemData {
  id?: string;
  alertId?: string;
  title?: string;
  detail?: string;
  severity?: "critical" | "warning" | "info" | string;
  occurredAt?: string;
  status?: string;
  [key: string]: any;
}

export function AlertDetailModal({
  open,
  onOpenChange,
  alert,
  onAcknowledged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alert: AlertItemData | null;
  onAcknowledged?: () => void;
}) {
  const locale = useLocale();
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  if (!alert) return null;

  const severity = alert.severity?.toLowerCase() || "warning";
  const isCritical = severity.includes("critical") || severity.includes("วิกฤต");
  const isWarning = severity.includes("warning") || severity.includes("เตือน");
  const isResolved = alert.status === "resolved" || alert.status === "acknowledged" || alert.status === "รับทราบแล้ว";

  const handleAcknowledge = async () => {
    setLoading(true);
    try {
      await apiClient.put(`/v1/alerts/acknowledge-all`);
      notify.success(
        locale === "th"
          ? `รับทราบการแจ้งเตือน ${alert.alertId || ""} เรียบร้อยแล้ว`
          : `Alert acknowledged successfully`
      );
      if (onAcknowledged) {
        onAcknowledged();
      } else {
        router.refresh();
      }
      onOpenChange(false);
    } catch (err: any) {
      notify.error(err.message || "เกิดข้อผิดพลาดในการรับทราบการแจ้งเตือน");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-sm:fixed max-sm:inset-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:rounded-none max-sm:p-4 max-sm:flex max-sm:flex-col sm:max-w-xl sm:rounded-2xl sm:p-6 sm:max-h-[85vh] overflow-hidden"
      >
        {/* Header */}
        <DialogHeader className="shrink-0 pb-3 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div
              className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${
                isCritical
                  ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                  : isWarning
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
              }`}
            >
              {isCritical ? (
                <AlertOctagon className="size-5" />
              ) : isWarning ? (
                <AlertTriangle className="size-5" />
              ) : (
                <Info className="size-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
                {alert.title || (locale === "th" ? "รายละเอียดการแจ้งเตือน" : "Alert Details")}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5 font-mono">
                {alert.alertId || alert.id || "-"}
              </DialogDescription>
            </div>
            <Badge
              variant="outline"
              className={`shrink-0 font-semibold ${
                isCritical
                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                  : isWarning
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                  : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
              }`}
            >
              {isCritical
                ? (locale === "th" ? "วิกฤต (Critical)" : "Critical")
                : isWarning
                ? (locale === "th" ? "เฝ้าระวัง (Warning)" : "Warning")
                : (locale === "th" ? "ข้อมูลทั่วไป (Info)" : "Info")}
            </Badge>
          </div>
        </DialogHeader>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 text-xs">
          {/* Key Facts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-muted/40 border border-border/60">
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
                <Clock className="size-3.5 text-muted-foreground" />
                {locale === "th" ? "เวลาที่ตรวจพบ" : "Occurred At"}
              </span>
              <p className="font-semibold text-foreground text-sm font-mono">
                {alert.occurredAt || alert.time || "-"}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-muted-foreground" />
                {locale === "th" ? "สถานะการตรวจสอบ" : "Resolution Status"}
              </span>
              <div>
                <Badge
                  variant={isResolved ? "outline" : "secondary"}
                  className={
                    isResolved
                      ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  }
                >
                  {isResolved
                    ? (locale === "th" ? "รับทราบ / ตรวจสอบแล้ว" : "Resolved / Acknowledged")
                    : (locale === "th" ? "รอดำเนินการ (Open)" : "Open")}
                </Badge>
              </div>
            </div>
          </div>

          {/* Technical Detail Description */}
          <div className="space-y-2 p-3.5 rounded-xl border border-border/60 bg-card">
            <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider block">
              {locale === "th" ? "รายละเอียดข้อผิดพลาดทางเทคนิค" : "Technical Diagnostics"}
            </span>
            <p className="text-sm text-foreground leading-relaxed">
              {alert.detail || (locale === "th" ? "ไม่มีรายละเอียดเพิ่มเติมสำหรับเหตุการณ์นี้" : "No technical details available.")}
            </p>
          </div>

          {/* Recommended Operational Action */}
          <div className="p-3.5 rounded-xl bg-blue-500/5 dark:bg-blue-950/20 border border-blue-500/20 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
              <Wrench className="size-3.5" />
              <span>{locale === "th" ? "คำแนะนำสำหรับทีมวิศวกร / ผู้ดูแลระบบ" : "Operational Guideline"}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-normal">
              {locale === "th"
                ? "ตรวจสอบการเชื่อมต่อ Modbus RS485 หรือสัญญาณอินเทอร์เน็ตของ Gateway ประจำไซต์ หากสัญญาณยังขาดหายเกิน 15 นาที ให้ติดต่อช่างเทคนิคหน้างานทันที"
                : "Check Modbus RS485 connection and gateway cellular/ethernet uplink. Dispatch field engineer if connection remains unreachable."}
            </p>
          </div>
        </div>

        {/* Footer */}
        {!isResolved && (
          <DialogFooter className="shrink-0 pt-3 border-t border-border/60 flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={handleAcknowledge}
              disabled={loading}
              className="w-full sm:w-auto h-10 px-5 text-xs font-semibold gap-1.5 bg-primary text-primary-foreground cursor-pointer"
            >
              <Check className="size-4" />
              <span>{loading ? (locale === "th" ? "กำลังบันทึก..." : "Saving...") : (locale === "th" ? "รับทราบการแจ้งเตือนนี้" : "Acknowledge Alert")}</span>
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
