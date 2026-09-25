"use client";

import * as React from "react";
import {
  Calendar,
  Download,
  FileCheck,
  FileSpreadsheet,
  FileText,
  Filter,
  HardDrive,
  Layers,
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

export interface ReportItemData {
  id?: string;
  title?: string;
  category?: string;
  scope?: string;
  format?: string;
  status?: string;
  fileSize?: string;
  generatedAt?: string;
  description?: string;
  [key: string]: any;
}

export function ReportDetailModal({
  open,
  onOpenChange,
  report,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: ReportItemData | null;
}) {
  const locale = useLocale();
  const [downloading, setDownloading] = React.useState(false);

  if (!report) return null;

  const handleDownload = () => {
    setDownloading(true);
    setTimeout(() => {
      // Create a mock download blob trigger
      const element = document.createElement("a");
      const file = new Blob(
        [
          `Solar Roof Operations Report: ${report.title}\nCategory: ${report.category}\nScope: ${report.scope}\nGenerated: ${report.generatedAt || new Date().toISOString()}`,
        ],
        { type: "text/plain;charset=utf-8" }
      );
      element.href = URL.createObjectURL(file);
      element.download = `${(report.title || "report").replace(/[^a-zA-Z0-9\u0E00-\u0E7F]/g, "_")}.txt`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);

      notify.success(
        locale === "th"
          ? `เริ่มดาวน์โหลดรายงาน ${report.title} เรียบร้อยแล้ว`
          : `Download started for ${report.title}`
      );
      setDownloading(false);
    }, 600);
  };

  const isSpreadsheet = report.format?.includes("CSV") || report.format?.includes("XLSX");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-sm:fixed max-sm:inset-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:rounded-none max-sm:p-4 max-sm:flex max-sm:flex-col sm:max-w-xl sm:rounded-2xl sm:p-6 sm:max-h-[85vh] overflow-hidden">
        {/* Header */}
        <DialogHeader className="shrink-0 pb-3 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              {isSpreadsheet ? (
                <FileSpreadsheet className="size-6" />
              ) : (
                <FileText className="size-6" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-lg font-bold truncate">
                  {report.title || "รายละเอียดรายงาน"}
                </DialogTitle>
                <Badge variant="outline" className="text-xs shrink-0 font-medium">
                  {report.category || "ทั่วไป"}
                </Badge>
              </div>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 truncate">
                <Layers className="size-3 shrink-0" />
                <span>{report.scope || "ทุกไซต์งาน"}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4 text-sm my-2">
          {/* Report Description */}
          <div className="p-3.5 rounded-xl border border-border/70 bg-card/60 space-y-1.5">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <FileCheck className="size-3.5 text-primary" />
              <span>{locale === "th" ? "คำอธิบายขอบเขตรายงาน" : "Report Description"}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {report.description ||
                (locale === "th"
                  ? "รายงานฉบับนี้รวบรวมข้อมูลโทรมาตร สถิติ และสรุปผลการดำเนินงานสำหรับใช้ในการประเมินประสิทธิภาพและการตรวจสอบความถูกต้อง"
                  : "This report consolidates system metrics, generation statistics, and operational records for audit and compliance.")}
            </p>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Layers className="size-3.5 text-primary" />
                <span>{locale === "th" ? "หมวดหมู่ข้อมูล" : "Category"}</span>
              </div>
              <div className="font-medium text-xs text-foreground">
                {report.category || "-"}
              </div>
            </div>

            <div className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Filter className="size-3.5 text-primary" />
                <span>{locale === "th" ? "รูปแบบไฟล์" : "Export Format"}</span>
              </div>
              <div className="font-medium text-xs text-foreground font-mono">
                {report.format || "CSV / PDF"}
              </div>
            </div>

            <div className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Calendar className="size-3.5 text-primary" />
                <span>{locale === "th" ? "ประมวลผลล่าสุด" : "Generated Date"}</span>
              </div>
              <div className="font-medium text-xs text-foreground">
                {report.generatedAt || "2026-09-22 06:00"}
              </div>
            </div>

            <div className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <HardDrive className="size-3.5 text-primary" />
                <span>{locale === "th" ? "ขนาดไฟล์โดยประมาณ" : "Estimated File Size"}</span>
              </div>
              <div className="font-medium text-xs text-foreground">
                {report.fileSize || "1.5 MB"}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 pt-3 border-t border-border/60 flex flex-row items-center justify-end gap-2">
          <Button
            variant="default"
            size="sm"
            className="text-xs gap-1.5 cursor-pointer"
            onClick={handleDownload}
            disabled={downloading}
          >
            <Download className="size-3.5" />
            <span>
              {downloading
                ? locale === "th"
                  ? "กำลังเตรียมดาวน์โหลด..."
                  : "Preparing Download..."
                : locale === "th"
                ? "ดาวน์โหลดรายงาน"
                : "Download Report"}
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
