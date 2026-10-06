"use client";

import * as React from "react";
import {
  Activity,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  MapPin,
  Radio,
  School,
  Zap,
  AlertTriangle,
} from "lucide-react";
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
import { useLocale } from "../../../providers/locale-provider";
import { useRouter } from "next/navigation";

export interface SchoolItemData {
  id?: string;
  name?: string;
  code?: string;
  region?: string;
  capacityMwp?: number | string;
  sitesCount?: number | string;
  gatewaysCount?: number | string;
  status?: string;
  [key: string]: any;
}

export function SchoolDetailModal({
  open,
  onOpenChange,
  school,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  school: SchoolItemData | null;
}) {
  const locale = useLocale();
  const router = useRouter();
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  if (!school) return null;

  const copyToClipboard = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); } catch {
      notify.error(locale === "th" ? "คัดลอกไม่สำเร็จ" : "Could not copy to clipboard"); return;
    }
    setCopiedKey(key);
    notify.success(locale === "th" ? "คัดลอกลงคลิปบอร์ดแล้ว" : "Copied to clipboard");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const isWarning = school.status?.includes("ตรวจสอบ") || school.status?.includes("warning") || school.status?.includes("offline");

  const handleNavigateToSites = () => {
    onOpenChange(false);
    router.push(`/sites`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-sm:fixed max-sm:inset-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:rounded-none max-sm:p-4 max-sm:flex max-sm:flex-col sm:max-w-xl sm:rounded-2xl sm:p-6 sm:max-h-[85vh] overflow-hidden">
        {/* Header */}
        <DialogHeader className="shrink-0 pb-3 order/60">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <School className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-lg font-bold truncate">
                  {school.name || "รายละเอียดสถานศึกษา"}
                </DialogTitle>
                <Badge
                  variant={isWarning ? "destructive" : "default"}
                  className="text-xs shrink-0"
                >
                  {school.status || (locale === "th" ? "ไม่มีข้อมูลสถานะ" : "Status unavailable")}
                </Badge>
              </div>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 truncate">
                <MapPin className="size-3 shrink-0" />
                <span>{school.region || "—"}</span>
                {school.code && <span>• รหัสสถานศึกษา: {school.code}</span>}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4 text-sm my-2">
          {/* Key Metrics Overview */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="text-center space-y-1 border-t pt-4">
              <div className="text-[11px] text-muted-foreground flex items-center justify-center gap-1">
                <Zap className="size-3 text-amber-500" />
                <span>{locale === "th" ? "กำลังติดตั้ง" : "Capacity"}</span>
              </div>
              <div className="text-base font-bold text-foreground">
                {school.capacityMwp == null ? "—" : Number(school.capacityMwp).toFixed(3)}
              </div>
              <div className="text-[10px] text-muted-foreground">MWp</div>
            </div>

            <div className="text-center space-y-1 border-t pt-4">
              <div className="text-[11px] text-muted-foreground flex items-center justify-center gap-1">
                <Activity className="size-3 text-emerald-500" />
                <span>{locale === "th" ? "ไซต์ระบบ" : "Solar Sites"}</span>
              </div>
              <div className="text-base font-bold text-foreground">
                {school.sitesCount ?? "—"}
              </div>
              <div className="text-[10px] text-muted-foreground">{locale === "th" ? "จุดติดตั้ง" : "Sites"}</div>
            </div>

            <div className="text-center space-y-1 border-t pt-4">
              <div className="text-[11px] text-muted-foreground flex items-center justify-center gap-1">
                <Radio className="size-3 text-blue-500" />
                <span>{locale === "th" ? "IOT Gateway" : "Gateways"}</span>
              </div>
              <div className="text-base font-bold text-foreground">
                {school.gatewaysCount ?? "—"}
              </div>
              <div className="text-[10px] text-muted-foreground">{locale === "th" ? "ชุดอุปกรณ์" : "Units"}</div>
            </div>
          </div>

          {/* Attributes List */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-foreground uppercase tracking-wider px-1">
              {locale === "th" ? "ข้อมูลทั่วไปของสถานศึกษา" : "School Attributes"}
            </div>
            <div className="space-y-2.5 text-xs border-t pt-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{locale === "th" ? "รหัสสถานศึกษา (Code)" : "School Code"}</span>
                <span className="font-mono font-medium text-foreground">{school.code || "-"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{locale === "th" ? "ภูมิภาค" : "Region"}</span>
                <span className="font-medium text-foreground">{school.region || "-"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{locale === "th" ? "สถานะการดำเนินงาน" : "Status"}</span>
                <span className="font-medium text-foreground">{school.status || "—"}</span>
              </div>
            </div>
          </div>

          {/* Identifier Meta */}
          {school.id && (
            <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40 flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-mono truncate">ID: {school.id}</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-10 text-muted-foreground hover:text-foreground shrink-0"
                onClick={() => copyToClipboard(school.id!, "schoolId")}
              >
                {copiedKey === "schoolId" ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 pt-3 border-t border-border/60 flex flex-row items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5 text-primary border-primary/30 hover:bg-primary/5 cursor-pointer"
            onClick={handleNavigateToSites}
          >
            <span>{locale === "th" ? "ดูรายการไซต์พลังงาน" : "View Solar Sites"}</span>
            <ExternalLink className="size-3.5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
