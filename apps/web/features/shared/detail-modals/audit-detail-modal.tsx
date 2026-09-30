"use client";

import * as React from "react";
import { CheckCircle2, Clock, Copy, FileCode2, History, KeyRound, ShieldAlert, User, X } from "lucide-react";
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
import { useLocale } from "../../../providers/locale-provider";
import { notify } from "../../../components/feedback/notifications";

export interface AuditEventData {
  id?: string;
  time?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  actor?: string;
  status?: string;
  correlationId?: string;
  reason?: string;
  beforeJson?: any;
  afterJson?: any;
  [key: string]: any;
}

export function AuditDetailModal({
  open,
  onOpenChange,
  event,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: AuditEventData | null;
}) {
  const locale = useLocale();

  if (!event) return null;

  const copyToClipboard = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); } catch {
      notify.error(locale === "th" ? "คัดลอกไม่สำเร็จ" : "Could not copy to clipboard"); return;
    }
    notify.success(
      locale === "th" ? `คัดลอก ${label} แล้ว` : `Copied ${label} to clipboard`
    );
  };

  const action = event.action || "-";
  const isSecurityAction = action.includes("login") || action.includes("auth");
  const isBillingAction = action.includes("billing") || action.includes("payment");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-sm:fixed max-sm:inset-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:rounded-none max-sm:p-4 max-sm:flex max-sm:flex-col sm:max-w-2xl sm:rounded-2xl sm:p-6 sm:max-h-[85vh] overflow-hidden"
      >
        {/* Header */}
        <DialogHeader className="shrink-0 pb-3 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <History className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
                {locale === "th" ? "รายละเอียดประวัติการทำงาน (Audit Trail)" : "Audit Log Event Details"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5 truncate">
                ID: {event.id || "-"}
              </DialogDescription>
            </div>
            <Badge
              variant="outline"
              className="shrink-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-semibold"
            >
              <CheckCircle2 className="size-3 mr-1" />
              {event.status || (locale === "th" ? "ไม่มีข้อมูลผลลัพธ์" : "Outcome unavailable")}
            </Badge>
          </div>
        </DialogHeader>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 text-xs">
          {/* Key Facts 2-Column Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-muted/40 border border-border/60">
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
                <Clock className="size-3.5 text-muted-foreground" />
                {locale === "th" ? "วันเวลาที่เกิดเหตุการณ์" : "Occurred At"}
              </span>
              <p className="font-semibold text-foreground text-sm font-mono">
                {event.time || "-"}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
                <User className="size-3.5 text-muted-foreground" />
                {locale === "th" ? "ผู้ดำเนินการ (Actor)" : "Actor"}
              </span>
              <p className="font-semibold text-foreground text-sm truncate">
                {event.actor || "-"}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground font-medium">
                {locale === "th" ? "คำสั่งดำเนินการ (Action)" : "Action Executed"}
              </span>
              <div>
                <Badge
                  variant="secondary"
                  className={`font-mono text-xs font-semibold ${
                    isSecurityAction
                      ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                      : isBillingAction
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      : "bg-primary/15 text-primary"
                  }`}
                >
                  {action}
                </Badge>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground font-medium">
                {locale === "th" ? "ประเภทข้อมูล (Entity Type)" : "Entity Type"}
              </span>
              <p className="font-semibold text-foreground text-sm capitalize">
                {event.entityType || "-"}
              </p>
            </div>
          </div>

          {/* Reference IDs with Copy Action */}
          <div className="space-y-2 p-3.5 rounded-xl border border-border/60 bg-card">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[11px] text-muted-foreground font-medium block">
                  {locale === "th" ? "รหัสอ้างอิงข้อมูล (Entity ID)" : "Entity Reference ID"}
                </span>
                <span className="font-mono text-xs font-medium text-foreground block truncate">
                  {event.entityId || "-"}
                </span>
              </div>
              {event.entityId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => copyToClipboard(event.entityId!, "Entity ID")}
                  className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                  title="Copy Entity ID"
                >
                  <Copy className="size-3.5" />
                </Button>
              )}
            </div>

            {event.correlationId && (
              <div className="pt-2 border-t border-border/50 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[11px] text-muted-foreground font-medium block">
                    Correlation ID
                  </span>
                  <span className="font-mono text-xs text-muted-foreground block truncate">
                    {event.correlationId}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => copyToClipboard(event.correlationId!, "Correlation ID")}
                  className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                  title="Copy Correlation ID"
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            )}

            {event.reason && (
              <div className="pt-2 border-t border-border/50">
                <span className="text-[11px] text-muted-foreground font-medium block">
                  {locale === "th" ? "เหตุผล / หมายเหตุ" : "Reason"}
                </span>
                <p className="text-xs text-foreground mt-0.5">
                  {event.reason}
                </p>
              </div>
            )}
          </div>

          {/* Before & After JSON Changes Viewer */}
          {(event.beforeJson || event.afterJson) ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <FileCode2 className="size-4 text-primary" />
                <span>{locale === "th" ? "ข้อมูลการเปลี่ยนแปลง (Changes Diff)" : "Data Changes"}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Before */}
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground font-medium">
                    {locale === "th" ? "ก่อนแก้ไข (Before)" : "Before"}
                  </span>
                  <pre className="p-3 rounded-xl bg-muted/60 border border-border/60 text-[11px] font-mono overflow-x-auto max-h-48 text-foreground/80">
                    {event.beforeJson ? JSON.stringify(event.beforeJson, null, 2) : "null"}
                  </pre>
                </div>

                {/* After */}
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground font-medium">
                    {locale === "th" ? "หลังแก้ไข (After)" : "After"}
                  </span>
                  <pre className="p-3 rounded-xl bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/30 text-[11px] font-mono overflow-x-auto max-h-48 text-emerald-800 dark:text-emerald-300">
                    {event.afterJson ? JSON.stringify(event.afterJson, null, 2) : "null"}
                  </pre>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl border border-dashed border-border/80 bg-muted/20 text-center text-muted-foreground text-xs">
              {locale === "th"
                ? "เหตุการณ์นี้เป็นการบันทึกการทำงานแบบ Append-only ไม่มีการเปลี่ยนแปลงโครงสร้าง JSON ภายใน"
                : "This is an append-only event without structured state mutations."}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}


