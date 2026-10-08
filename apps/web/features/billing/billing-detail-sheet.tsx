"use client";
import { AppLoading } from "../../components/feedback/app-loading";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "../../components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { useLocale } from "../../providers/locale-provider";
import { formatAppDate, formatAppDateTime } from "../../lib/date-format";
import { apiClient } from "../../lib/api-client";
import { notify } from "../../components/feedback/notifications";
import {
  CheckCircle,
  XCircle,
  Pencil,
  FileText,
  Send,
  Calendar,
  Zap,
  Building,
  AlertTriangle,
  Receipt,
  RotateCcw,
} from "lucide-react";

export interface BillingCycleDetail {
  id: string;
  siteId?: string;
  siteName?: string;
  schoolId?: string;
  schoolName?: string;
  periodStart?: string;
  periodEnd?: string;
  cutoffTime?: string;
  status: string;
  quality?: string;
  openingEnergy?: number;
  closingEnergy?: number;
  consumedKwh?: number;
  rate?: number;
  amount?: number;
  invoiceId?: string;
  invoiceNumber?: string;
  invoiceStatus?: string;
  paymentId?: string;
  paymentStatus?: string;
  paidAmount?: number;
}

interface BillingDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billingId: string | null;
  onUpdated?: () => void;
  onOpenInvoice?: (detail: BillingCycleDetail) => void;
}

export function BillingDetailSheet({
  open,
  onOpenChange,
  billingId,
  onUpdated,
  onOpenInvoice,
}: BillingDetailSheetProps) {
  const locale = useLocale();

  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<BillingCycleDetail | null>(null);

  // Workflow Dialog States
  const [actionLoading, setActionLoading] = React.useState(false);
  const [rejectModalOpen, setRejectModalOpen] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");

  const [adjustModalOpen, setAdjustModalOpen] = React.useState(false);
  const [adjustKwh, setAdjustKwh] = React.useState<number>(0);
  const [adjustRate, setAdjustRate] = React.useState<number>(4.25);
  const [adjustNote, setAdjustNote] = React.useState("");

  const fetchDetails = React.useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await apiClient.get<BillingCycleDetail>(`/v1/billing-cycles/${id}`);
      setData(res);
      setAdjustKwh(res.consumedKwh || 0);
      setAdjustRate(res.rate || 4.25);
    } catch {
      notify.error(locale === "th" ? "ไม่สามารถโหลดข้อมูลรอบบิลได้" : "Failed to load billing details");
    } finally {
      setLoading(false);
    }
  }, [locale]);

  React.useEffect(() => {
    if (open && billingId) {
      fetchDetails(billingId);
    } else {
      setData(null);
    }
  }, [open, billingId, fetchDetails]);

  const formatNumber = (val: any) => {
    const num = Number(val);
    if (isNaN(num)) return val || "-";
    return new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", {
      maximumFractionDigits: 2,
    }).format(num);
  };

  const handleUpdateStatus = async (newStatus: "pending_review" | "approved" | "rejected", reason?: string) => {
    if (!billingId) return;
    setActionLoading(true);
    try {
      await apiClient.patch(`/v1/billing-cycles/${billingId}/status`, {
        status: newStatus,
        reason,
      });

      const message =
        newStatus === "approved"
          ? (locale === "th" ? "อนุมัติรอบบิลเรียบร้อยแล้ว" : "Billing cycle approved successfully")
          : newStatus === "rejected"
          ? (locale === "th" ? "ส่งกลับแก้ไขรอบบิลเรียบร้อยแล้ว" : "Billing cycle rejected")
          : (locale === "th" ? "ส่งเข้ารอการตรวจสอบเรียบร้อยแล้ว" : "Submitted for review");

      notify.success(message);
      setRejectModalOpen(false);
      setRejectReason("");
      fetchDetails(billingId);
      onUpdated?.();
    } catch {
      notify.error(locale === "th" ? "เกิดข้อผิดพลาดในการดำเนินการ" : "Action failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveAdjustment = async () => {
    if (!billingId) return;
    setActionLoading(true);
    try {
      const computedAmount = Number((adjustKwh * adjustRate).toFixed(2));
      await apiClient.patch(`/v1/billing-cycles/${billingId}/adjust`, {
        consumedKwh: adjustKwh,
        rate: adjustRate,
        amount: computedAmount,
        note: adjustNote,
      });
      notify.success(locale === "th" ? "ปรับปรุงข้อมูลบิลสำเร็จและส่งเข้ารอตรวจสอบ" : "Billing adjusted successfully");
      setAdjustModalOpen(false);
      fetchDetails(billingId);
      onUpdated?.();
    } catch {
      notify.error(locale === "th" ? "ไม่สามารถบันทึกข้อมูลที่ปรับแก้ได้" : "Failed to adjust billing");
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status?: string) => {
    const s = String(status || "").toLowerCase();
    if (s === "approved" || s === "อนุมัติแล้ว") {
      return (
        <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
          <CheckCircle className="size-3 mr-1" />
          {locale === "th" ? "อนุมัติแล้ว" : "Approved"}
        </Badge>
      );
    }
    if (s === "pending_review" || s === "รอตรวจสอบ" || s === "review" || s === "ต้องตรวจสอบ") {
      return (
        <Badge variant="secondary" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
          <AlertTriangle className="size-3 mr-1" />
          {locale === "th" ? "รอตรวจสอบ" : "Pending Review"}
        </Badge>
      );
    }
    if (s === "rejected" || s === "ปฏิเสธ") {
      return (
        <Badge variant="destructive">
          <XCircle className="size-3 mr-1" />
          {locale === "th" ? "ปฏิเสธ / ส่งกลับแก้ไข" : "Rejected"}
        </Badge>
      );
    }
    if (s === "paid" || s === "ชำระแล้ว") {
      return (
        <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
          {locale === "th" ? "ชำระแล้ว" : "Paid"}
        </Badge>
      );
    }
    return (
      <Badge variant="secondary">
        {locale === "th" ? "ฉบับร่าง" : "Draft"}
      </Badge>
    );
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl flex flex-col p-0 bg-card border-l border-border">
          {/* Header */}
          <SheetHeader className="p-5 order/60 bg-muted/20">
            <div className="flex items-center justify-between gap-3 pr-6">
              <div>
                <SheetTitle className="text-base font-bold text-foreground">
                  {locale === "th" ? "รายละเอียดรอบบิลและการเรียกเก็บ" : "Billing Cycle Details"}
                </SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground mt-0.5">
                  {data?.schoolName || (locale === "th" ? "ข้อมูลรอบบิลการใช้ไฟฟ้า" : "Energy billing cycle")}
                </SheetDescription>
              </div>
              <div>{getStatusBadge(data?.status)}</div>
            </div>
          </SheetHeader>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
            {loading ? (
              <AppLoading fullPage={false} />
            ) : data ? (
              <>
                {/* School & Site Info Card */}
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center gap-2 font-semibold text-foreground text-xs">
                    <Building className="size-4 text-primary" />
                    <span>{locale === "th" ? "ข้อมูลสถานที่ติดตั้ง" : "Site Information"}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-1 border-t border-border/40">
                    <div>
                      <span className="text-muted-foreground">{locale === "th" ? "โรงเรียน" : "School"}:</span>
                      <p className="font-semibold text-foreground text-sm mt-0.5">{data.schoolName}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{locale === "th" ? "ไซต์งาน" : "Site"}:</span>
                      <p className="font-semibold text-foreground text-sm mt-0.5">{data.siteName}</p>
                    </div>
                  </div>
                </div>

                {/* Billing Period Card */}
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center gap-2 font-semibold text-foreground text-xs">
                    <Calendar className="size-4 text-primary" />
                    <span>{locale === "th" ? "รอบเวลาและกำหนดการ" : "Period & Timestamps"}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-1 border-t border-border/40">
                    <div>
                      <span className="text-muted-foreground">{locale === "th" ? "วันเริ่มต้นรอบบิล" : "Period Start"}:</span>
                      <p className="font-medium text-foreground mt-0.5">
                        {data.periodStart ? formatAppDate(data.periodStart, locale) : "-"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{locale === "th" ? "วันสิ้นสุดรอบบิล" : "Period End"}:</span>
                      <p className="font-medium text-foreground mt-0.5">
                        {data.periodEnd ? formatAppDate(data.periodEnd, locale) : "-"}
                      </p>
                    </div>
                    {data.cutoffTime && (
                      <div className="col-span-2 pt-1 border-t border-border/30">
                        <span className="text-muted-foreground">{locale === "th" ? "เวลาตัดรอบข้อมูลมิเตอร์" : "Cutoff Time"}:</span>
                        <p className="font-medium text-foreground mt-0.5">{data.cutoffTime}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Meter & Energy Readings */}
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold text-foreground text-xs">
                      <Zap className="size-4 text-solar" />
                      <span>{locale === "th" ? "ข้อมูลมิเตอร์และพลังงาน" : "Energy & Consumption"}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAdjustModalOpen(true)}
                      className="h-10 text-[11px] gap-1 px-2 border-border cursor-pointer hover:bg-accent"
                    >
                      <Pencil className="size-3" />
                      <span>{locale === "th" ? "ปรับแก้ข้อมูล" : "Adjust"}</span>
                    </Button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/40 text-center">
                    <div className="flex items-center justify-between gap-2 border-t pt-3">
                      <span className="text-[11px] text-muted-foreground block">{locale === "th" ? "มิเตอร์เริ่มต้น" : "Opening"}</span>
                      <strong className="font-mono text-xs text-foreground mt-0.5 block">
                        {formatNumber(data.openingEnergy)}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t pt-3">
                      <span className="text-[11px] text-muted-foreground block">{locale === "th" ? "มิเตอร์สิ้นสุด" : "Closing"}</span>
                      <strong className="font-mono text-xs text-foreground mt-0.5 block">
                        {formatNumber(data.closingEnergy)}
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20">
                      <span className="text-[11px] text-primary font-semibold block">{locale === "th" ? "พลังงานสุทธิ (kWh)" : "Consumed (kWh)"}</span>
                      <strong className="font-mono text-xs text-primary font-bold mt-0.5 block">
                        {formatNumber(data.consumedKwh)}
                      </strong>
                    </div>
                  </div>

                  {/* Financial calculation */}
                  <div className="pt-2 border-t border-border/40 space-y-1.5">
                    <div className="flex justify-between text-muted-foreground">
                      <span>{locale === "th" ? "อัตราค่าบริการไฟฟ้าตามสัญญา:" : "Contract Electricity Rate:"}</span>
                      <strong className="font-mono text-foreground">฿{formatNumber(data.rate)} / kWh</strong>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-border/40">
                      <span className="font-bold text-sm text-foreground">{locale === "th" ? "ยอดเงินที่ต้องเรียกเก็บ:" : "Total Billing Amount:"}</span>
                      <strong className="font-mono font-bold text-base text-primary">
                        ฿{formatNumber(data.amount)}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Documents & Invoicing Card */}
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center gap-2 font-semibold text-foreground text-xs">
                    <Receipt className="size-4 text-primary" />
                    <span>{locale === "th" ? "เอกสารที่เกี่ยวข้อง" : "Associated Documents"}</span>
                  </div>
                  <div className="pt-2 border-t border-border/40 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-muted-foreground block">{locale === "th" ? "เลขที่ใบแจ้งหนี้" : "Invoice Number"}</span>
                      <strong className="font-mono text-xs text-foreground">
                        {data.invoiceNumber || (locale === "th" ? "ยังไม่ได้สร้างใบแจ้งหนี้" : "No invoice generated")}
                      </strong>
                    </div>
                    {data.invoiceNumber && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenInvoice?.(data)}
                        className="h-10 text-[11px] gap-1 px-2 border-border cursor-pointer hover:bg-accent"
                      >
                        <FileText className="size-3" />
                        <span>{locale === "th" ? "เปิดดูใบแจ้งหนี้" : "View Invoice"}</span>
                      </Button>
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </div>

          {/* Workflow Actions Footer */}
          <SheetFooter className="p-4 border-t border-border/60 bg-muted/20 flex-row items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-10 text-xs cursor-pointer"
            >
              {locale === "th" ? "ปิด" : "Close"}
            </Button>

            <div className="flex items-center gap-2">
              {/* If Draft or Rejected -> Allow Submit for Review */}
              {(data?.status === "draft" || data?.status === "rejected") && (
                <Button
                  size="sm"
                  disabled={actionLoading}
                  onClick={() => handleUpdateStatus("pending_review")}
                  className="h-10 gap-1.5 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                >
                  <Send className="size-3.5" />
                  <span>{locale === "th" ? "ส่งตรวจสอบ" : "Submit for Review"}</span>
                </Button>
              )}

              {/* If Pending Review -> Show Approve and Reject Actions */}
              {(data?.status === "pending_review" || data?.status === "review" || data?.status === "ต้องตรวจสอบ") && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionLoading}
                    onClick={() => setRejectModalOpen(true)}
                    className="h-10 gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 cursor-pointer"
                  >
                    <XCircle className="size-3.5" />
                    <span>{locale === "th" ? "ปฏิเสธ / ส่งกลับ" : "Reject"}</span>
                  </Button>
                  <Button
                    size="sm"
                    disabled={actionLoading}
                    onClick={() => handleUpdateStatus("approved")}
                    className="h-10 gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                  >
                    <CheckCircle className="size-3.5" />
                    <span>{locale === "th" ? "อนุมัติรอบบิล" : "Approve Cycle"}</span>
                  </Button>
                </>
              )}
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Reject Modal Dialog */}
      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent className="sm:max-w-md sm:rounded-2xl sm:p-6 border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-foreground">
              {locale === "th" ? "ระบุเหตุผลในการปฏิเสธ / ส่งกลับแก้ไข" : "Reason for Rejection"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {locale === "th"
                ? "ข้อความนี้จะถูกบันทึกใน Audit Log และส่งแจ้งเตือนไปยังผู้ดูแลระบบ"
                : "This note will be recorded in the audit log."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="reject-note" className="text-xs">
              {locale === "th" ? "เหตุผลหรือข้อแนะนำในการปรับปรุง" : "Comments / Feedback"}
            </Label>
            <Textarea
              id="reject-note"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={locale === "th" ? "เช่น ค่าพลังงานมิเตอร์สิ้นสุดไม่ตรงกับบิลการไฟฟ้า..." : "Enter reason..."}
              className="text-xs min-h-[80px]"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRejectModalOpen(false)}
              className="h-10 text-xs cursor-pointer"
            >
              {locale === "th" ? "ยกเลิก" : "Cancel"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={actionLoading || !rejectReason.trim()}
              onClick={() => handleUpdateStatus("rejected", rejectReason)}
              className="h-10 text-xs font-semibold cursor-pointer"
            >
              {actionLoading ? "กำลังดำเนินการ..." : (locale === "th" ? "ยืนยันการปฏิเสธ" : "Confirm Reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust Data Modal Dialog */}
      <Dialog open={adjustModalOpen} onOpenChange={setAdjustModalOpen}>
        <DialogContent className="sm:max-w-md sm:rounded-2xl sm:p-6 border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-foreground">
              {locale === "th" ? "ปรับแก้ข้อมูลรอบบิล" : "Adjust Billing Data"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {locale === "th"
                ? "แก้ไขปริมาณพลังงานหรืออัตราค่าไฟ ระบบจะคำนวณยอดเงินรวมใหม่ และเปลี่ยนสถานะเป็นรอตรวจสอบ"
                : "Modify energy or rate values. Total will be recalculated automatically."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-2">
              <Label htmlFor="adjust-kwh" className="text-xs">
                {locale === "th" ? "พลังงานไฟฟ้าสุทธิ (kWh)" : "Consumed Energy (kWh)"}
              </Label>
              <Input
                id="adjust-kwh"
                type="number"
                step="0.01"
                value={adjustKwh}
                onChange={(e) => setAdjustKwh(Number(e.target.value))}
                className="h-10 text-xs"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="adjust-rate" className="text-xs">
                {locale === "th" ? "อัตราค่าไฟ (บาท / kWh)" : "Tariff Rate (THB / kWh)"}
              </Label>
              <Input
                id="adjust-rate"
                type="number"
                step="0.01"
                value={adjustRate}
                onChange={(e) => setAdjustRate(Number(e.target.value))}
                className="h-10 text-xs"
              />
            </div>

            <div className="flex items-center justify-between gap-2 border-t pt-3">
              <span className="font-semibold text-muted-foreground">{locale === "th" ? "ยอดรวมที่คำนวณใหม่:" : "Recalculated Total:"}</span>
              <strong className="font-mono text-sm text-primary">
                ฿{formatNumber(adjustKwh * adjustRate)}
              </strong>
            </div>

            <div className="space-y-2">
              <Label htmlFor="adjust-note" className="text-xs">
                {locale === "th" ? "เหตุผลในการปรับปรุงยอด" : "Adjustment Reason / Note"}
              </Label>
              <Textarea
                id="adjust-note"
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                placeholder={locale === "th" ? "เช่น ชดเชยกรณีมิเตอร์หยุดสื่อสาร 2 วัน..." : "Enter reason..."}
                className="text-xs min-h-[60px]"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAdjustModalOpen(false)}
              className="h-10 text-xs cursor-pointer"
            >
              {locale === "th" ? "ยกเลิก" : "Cancel"}
            </Button>
            <Button
              size="sm"
              disabled={actionLoading || adjustKwh <= 0}
              onClick={handleSaveAdjustment}
              className="h-10 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
            >
              {actionLoading ? "กำลังบันทึก..." : (locale === "th" ? "บันทึกการปรับปรุง" : "Save Adjustment")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
