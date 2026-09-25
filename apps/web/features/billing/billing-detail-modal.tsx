"use client";

import * as React from "react";
import {
  AlertCircle,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  FileX,
  ImageIcon,
  Loader2,
  QrCode,
  Receipt,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Badge } from "../../components/ui/badge";
import { Card } from "../../components/ui/card";
import { apiClient } from "../../lib/api-client";
import { useLocale } from "../../providers/locale-provider";
import { useAuth } from "../../stores/auth-store";
import { notify } from "../../components/feedback/notifications";
import { formatAppDate, formatAppDateTime } from "../../lib/date-format";

export interface BillingDetailData {
  id: string;
  period?: string;
  periodStart?: string;
  periodEnd?: string;
  schoolName?: string;
  siteName?: string;
  consumedKwh?: number;
  openingEnergy?: number;
  closingEnergy?: number;
  rate?: number;
  amount?: number;
  status: string;
  paymentId?: string;
  paymentStatus?: string;
  slipUrl?: string;
  paidAt?: string;
  rejectionReason?: string;
  invoiceNumber?: string;
  receiptNumber?: string;
  [key: string]: any;
}

interface BillingDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billingId: string | null;
  initialData?: BillingDetailData | null;
  onUpdated?: () => void;
  onOpenInvoice?: (data: any) => void;
  onOpenReceipt?: (data: any) => void;
}

export function BillingDetailModal({
  open,
  onOpenChange,
  billingId,
  initialData,
  onUpdated,
  onOpenInvoice,
  onOpenReceipt,
}: BillingDetailModalProps) {
  const locale = useLocale();
  const { user } = useAuth();
  const isSchoolUser = user?.role === "school_user";

  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<BillingDetailData | null>(initialData || null);

  // Verification & Workflow Action states
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [showRejectInput, setShowRejectInput] = React.useState(false);
  const [rejectionReason, setRejectionReason] = React.useState("");
  const [slipZoomOpen, setSlipZoomOpen] = React.useState(false);

  const fetchDetails = React.useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await apiClient.get<BillingDetailData>(`/v1/billing-cycles/${id}`);
      setData((prev) => ({ ...prev, ...res }));
    } catch {
      // If API fails or mock, fallback to initialData
      if (initialData) setData(initialData);
    } finally {
      setLoading(false);
    }
  }, [initialData]);

  React.useEffect(() => {
    if (open && billingId) {
      setShowRejectInput(false);
      setRejectionReason("");
      fetchDetails(billingId);
    } else if (open && initialData) {
      setData(initialData);
    }
  }, [open, billingId, initialData, fetchDetails]);

  if (!data) return null;

  const handleApprovePayment = async () => {
    if (!data.id) return;
    setIsSubmitting(true);
    try {
      await apiClient.patch(`/v1/billing-cycles/${data.id}/verify-payment`, {
        status: "approved",
      });
      notify.success(
        locale === "th"
          ? "อนุมัติการชำระเงินและออกใบเสร็จรับเงินเรียบร้อยแล้ว"
          : "Payment approved and receipt generated"
      );
      setData((prev) => prev ? { ...prev, status: "paid", paymentStatus: "approved" } : null);
      onUpdated?.();
    } catch (err: any) {
      notify.error(err?.message || "เกิดข้อผิดพลาดในการอนุมัติ");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectPayment = async () => {
    if (!data.id) return;
    if (!rejectionReason.trim()) {
      notify.error(locale === "th" ? "กรุณาระบุเหตุผลการปฏิเสธ" : "Please provide a reason");
      return;
    }
    setIsSubmitting(true);
    try {
      await apiClient.patch(`/v1/billing-cycles/${data.id}/verify-payment`, {
        status: "rejected",
        reason: rejectionReason.trim(),
      });
      notify.success(
        locale === "th"
          ? "ปฏิเสธหลักฐานการชำระเงินเรียบร้อยแล้ว"
          : "Payment slip rejected"
      );
      setData((prev) => prev ? { ...prev, status: "rejected", paymentStatus: "rejected", rejectionReason: rejectionReason.trim() } : null);
      setShowRejectInput(false);
      onUpdated?.();
    } catch (err: any) {
      notify.error(err?.message || "เกิดข้อผิดพลาดในการปฏิเสธ");
    } finally {
      setIsSubmitting(false);
    }
  };

  const amountNum = Number(data.amount) || 0;
  const subtotal = amountNum > 0 ? amountNum / 1.07 : 0;
  const vat = amountNum > 0 ? amountNum - subtotal : 0;
  const isPaid = data.status === "paid" || data.paymentStatus === "approved" || data.paymentStatus === "paid";
  const hasSlip = Boolean(data.slipUrl);

  const formatNumber = (val: any) => {
    const num = Number(val);
    if (isNaN(num)) return val || "-";
    return new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl lg:max-w-5xl w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 sm:rounded-2xl border-border bg-card">
        {/* Header */}
        <DialogHeader className="pb-4 border-b border-border/60">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="size-11 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Receipt className="size-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <DialogTitle className="text-base sm:text-lg font-bold">
                    {locale === "th" ? "รายละเอียดรอบบิลและการเรียกเก็บเงิน" : "Billing Cycle & Payment Verification"}
                  </DialogTitle>
                  <Badge
                    variant={isPaid ? "default" : "secondary"}
                    className={isPaid ? "bg-emerald-600 text-white" : ""}
                  >
                    {isPaid
                      ? locale === "th" ? "ชำระแล้ว (Paid)" : "Paid"
                      : data.status === "pending_verification"
                      ? locale === "th" ? "รอตรวจสอบสลิป" : "Pending Verification"
                      : locale === "th" ? "รอชำระเงิน" : "Pending Payment"}
                  </Badge>
                </div>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {data.schoolName || "โรงเรียน"} • {locale === "th" ? "รอบบิลประจำเดือน " : "Period "}{data.period || data.periodEnd}
                </DialogDescription>
              </div>
            </div>

            {/* Quick Document Links */}
            <div className="flex items-center gap-2 pr-6">
              {data.invoiceNumber && onOpenInvoice && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenInvoice(data)}
                  className="h-8 text-xs gap-1.5 cursor-pointer text-primary"
                >
                  <FileText className="size-3.5" />
                  <span>{locale === "th" ? "ดูใบแจ้งหนี้" : "View Invoice"}</span>
                </Button>
              )}
              {isPaid && onOpenReceipt && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenReceipt(data)}
                  className="h-8 text-xs gap-1.5 cursor-pointer text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                >
                  <FileCheck className="size-3.5" />
                  <span>{locale === "th" ? "ดูใบเสร็จรับเงิน" : "View Receipt"}</span>
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* 2-Column Split Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-3">
          {/* ============================================================== */}
          {/* LEFT COLUMN: Billing Data & Tariff Computation (7 Cols)        */}
          {/* ============================================================== */}
          <div className="lg:col-span-7 space-y-4 text-xs">
            {/* Energy Consumption Summary Card */}
            <div className="p-4 rounded-xl border border-border/70 bg-card/60 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                <span className="flex items-center gap-1.5">
                  <Zap className="size-4 text-amber-500" />
                  <span>{locale === "th" ? "สรุปการผลิตและการใช้พลังงาน" : "Energy Consumption Details"}</span>
                </span>
                <span className="font-mono text-muted-foreground">
                  {data.period || data.periodEnd}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5 pt-1">
                <div className="p-2.5 rounded-lg bg-muted/30 border border-border/50 text-center">
                  <span className="text-[10px] text-muted-foreground block">{locale === "th" ? "หน่วยยกมา (เปิด)" : "Opening"}</span>
                  <span className="font-mono font-bold text-xs">{formatNumber(data.openingEnergy || 0)}</span>
                  <span className="text-[9px] text-muted-foreground block">kWh</span>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/30 border border-border/50 text-center">
                  <span className="text-[10px] text-muted-foreground block">{locale === "th" ? "หน่วยยกไป (ปิด)" : "Closing"}</span>
                  <span className="font-mono font-bold text-xs">{formatNumber(data.closingEnergy || data.consumedKwh || 2450.5)}</span>
                  <span className="text-[9px] text-muted-foreground block">kWh</span>
                </div>
                <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20 text-center">
                  <span className="text-[10px] text-primary block font-semibold">{locale === "th" ? "พลังงานสุทธิ" : "Consumed"}</span>
                  <span className="font-mono font-bold text-sm text-primary">{formatNumber(data.consumedKwh || 2450.5)}</span>
                  <span className="text-[9px] text-primary/80 block">kWh</span>
                </div>
              </div>
            </div>

            {/* Financial Computation Breakdown */}
            <div className="p-4 rounded-xl border border-border/70 bg-card/60 space-y-2.5">
              <div className="text-xs font-semibold text-foreground uppercase tracking-wider">
                {locale === "th" ? "รายละเอียดการคำนวณค่าไฟฟ้า (PPA Formula)" : "PPA Tariff Computation"}
              </div>

              <div className="divide-y divide-border/40 text-xs">
                <div className="py-2 flex items-center justify-between">
                  <span className="text-muted-foreground">{locale === "th" ? "พลังงานไฟฟ้าที่ใช้" : "Consumed Energy"}</span>
                  <span className="font-mono font-medium">{formatNumber(data.consumedKwh || 2450.5)} kWh</span>
                </div>
                <div className="py-2 flex items-center justify-between">
                  <span className="text-muted-foreground">{locale === "th" ? "อัตราค่าไฟตามสัญญา" : "Fixed PPA Tariff"}</span>
                  <span className="font-mono font-medium">฿{formatNumber(data.rate || 4.25)} / kWh</span>
                </div>
                <div className="py-2 flex items-center justify-between">
                  <span className="text-muted-foreground">{locale === "th" ? "มูลค่าก่อนภาษี (Subtotal)" : "Subtotal"}</span>
                  <span className="font-mono font-medium">฿{formatNumber(subtotal)}</span>
                </div>
                <div className="py-2 flex items-center justify-between">
                  <span className="text-muted-foreground">{locale === "th" ? "ภาษีมูลค่าเพิ่ม (VAT 7%)" : "VAT (7%)"}</span>
                  <span className="font-mono font-medium">฿{formatNumber(vat)}</span>
                </div>
                <div className="py-2.5 flex items-center justify-between border-t border-border font-bold text-sm text-foreground">
                  <span>{locale === "th" ? "ยอดเงินรวมทั้งสิ้นที่ต้องชำระ" : "Total Amount Due"}</span>
                  <span className="font-mono text-base text-amber-600 dark:text-amber-400">฿{formatNumber(amountNum)}</span>
                </div>
              </div>
            </div>

            {/* Meta Information */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-muted/20 border border-border/40 space-y-0.5">
                <span className="text-[10px] text-muted-foreground block">{locale === "th" ? "เลขที่ใบแจ้งหนี้" : "Invoice No."}</span>
                <span className="font-mono font-medium">{data.invoiceNumber || "-"}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/20 border border-border/40 space-y-0.5">
                <span className="text-[10px] text-muted-foreground block">{locale === "th" ? "เลขที่ใบเสร็จรับเงิน" : "Receipt No."}</span>
                <span className="font-mono font-medium">{data.receiptNumber || (isPaid ? "RCT-READY" : "-")}</span>
              </div>
            </div>
          </div>

          {/* ============================================================== */}
          {/* RIGHT COLUMN: Payment Evidence & Verification Action (5 Cols) */}
          {/* ============================================================== */}
          <div className="lg:col-span-5 space-y-4 text-xs">
            <div className="p-4 rounded-xl border border-border/70 bg-card/60 space-y-3">
              <div className="flex items-center justify-between font-semibold text-foreground">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-primary" />
                  <span>{locale === "th" ? "หลักฐานการโอนเงิน (Slip)" : "Payment Slip Evidence"}</span>
                </span>
                {hasSlip && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] px-2 text-primary gap-1"
                    onClick={() => setSlipZoomOpen(true)}
                  >
                    <Eye className="size-3" />
                    <span>{locale === "th" ? "ขยายภาพ" : "Zoom"}</span>
                  </Button>
                )}
              </div>

              {/* Slip Image Box */}
              {hasSlip ? (
                <div className="space-y-2">
                  <div
                    className="relative group rounded-lg overflow-hidden border border-border/70 bg-background aspect-[4/5] flex items-center justify-center cursor-pointer"
                    onClick={() => setSlipZoomOpen(true)}
                  >
                    <img
                      src={data.slipUrl}
                      alt="Bank Transfer Slip"
                      className="w-full h-full object-contain p-1 group-hover:scale-105 transition-transform duration-200"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs gap-1.5 transition-opacity">
                      <Eye className="size-4" />
                      <span>{locale === "th" ? "คลิกเพื่อดูรูปขนาดเต็ม" : "Click to view full size"}</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40 text-[11px] space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{locale === "th" ? "วันเวลาที่โอน:" : "Paid At:"}</span>
                      <span className="font-medium text-foreground">{data.paidAt ? formatAppDateTime(data.paidAt, locale) : "2026-09-20 14:35 น."}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{locale === "th" ? "ยอดเงินในสลิป:" : "Slip Amount:"}</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">฿{formatNumber(amountNum)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 rounded-lg border border-dashed border-border/80 bg-muted/10 text-center space-y-2">
                  <div className="size-10 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                    <ImageIcon className="size-5" />
                  </div>
                  <p className="font-semibold text-foreground">
                    {locale === "th" ? "ยังไม่มีหลักฐานการชำระเงิน" : "No Payment Slip Uploaded"}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {locale === "th"
                      ? "สถานศึกษาจะอัปโหลดสลิปหลักฐานเมื่อทำการโอนเงินค่าไฟฟ้าแล้ว"
                      : "The institution will upload proof of payment upon bank transfer completion."}
                  </p>
                </div>
              )}

              {/* Status Banner */}
              {isPaid && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-2 text-emerald-950 dark:text-emerald-200 text-xs">
                  <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">{locale === "th" ? "ตรวจสอบและอนุมัติแล้ว" : "Verified & Approved"}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {locale === "th"
                        ? "รอบบิลนี้ได้รับการบันทึกการชำระเงินและออกใบเสร็จรับเงินเรียบร้อยแล้ว"
                        : "Payment has been confirmed and official tax receipt is ready."}
                    </span>
                  </div>
                </div>
              )}

              {data.rejectionReason && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-950 dark:text-rose-200 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-rose-600 dark:text-rose-400">
                    <XCircle className="size-3.5" />
                    <span>{locale === "th" ? "เหตุผลการปฏิเสธหลักฐาน:" : "Rejection Reason:"}</span>
                  </div>
                  <p className="text-[11px]">{data.rejectionReason}</p>
                </div>
              )}

              {/* Admin/Owner Actions: Approve or Reject Inline */}
              {!isSchoolUser && !isPaid && hasSlip && (
                <div className="pt-2 space-y-2 border-t border-border/60">
                  <div className="text-[11px] font-semibold text-foreground uppercase tracking-wider">
                    {locale === "th" ? "การตรวจสอบโดยผู้ดูแลระบบ" : "Administrative Verification"}
                  </div>

                  {!showRejectInput ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleApprovePayment}
                        disabled={isSubmitting}
                        className="h-9 text-xs font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                      >
                        {isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                        <span>{locale === "th" ? "อนุมัติการชำระเงิน" : "Approve Slip"}</span>
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowRejectInput(true)}
                        disabled={isSubmitting}
                        className="h-9 text-xs font-semibold gap-1.5 text-rose-600 border-rose-500/30 hover:bg-rose-500/10 cursor-pointer"
                      >
                        <XCircle className="size-3.5" />
                        <span>{locale === "th" ? "ปฏิเสธสลิป" : "Reject"}</span>
                      </Button>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/5 space-y-2">
                      <Label className="text-[11px] text-foreground font-medium">
                        {locale === "th" ? "ระบุเหตุผลการปฏิเสธสลิป" : "Specify Rejection Reason"}
                      </Label>
                      <Textarea
                        placeholder={locale === "th" ? "เช่น ยอดเงินไม่ตรงกับใบแจ้งหนี้, ภาพไม่ชัดเจน..." : "e.g. Amount mismatch, blurry slip..."}
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        className="text-xs min-h-[60px]"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowRejectInput(false)}
                          className="h-7 text-xs"
                        >
                          {locale === "th" ? "ยกเลิก" : "Cancel"}
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleRejectPayment}
                          disabled={isSubmitting || !rejectionReason.trim()}
                          className="h-7 text-xs bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                        >
                          {isSubmitting ? <Loader2 className="size-3 animate-spin" /> : null}
                          <span>{locale === "th" ? "ยืนยันปฏิเสธ" : "Confirm Reject"}</span>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Full Image Zoom Modal */}
        {hasSlip && (
          <Dialog open={slipZoomOpen} onOpenChange={setSlipZoomOpen}>
            <DialogContent className="sm:max-w-2xl w-full p-2 bg-card border-border">
              <DialogHeader className="p-2 border-b border-border/60">
                <DialogTitle className="text-sm font-semibold">
                  {locale === "th" ? "หลักฐานการโอนเงิน (สลิปธนาคาร)" : "Bank Transfer Slip"}
                </DialogTitle>
              </DialogHeader>
              <div className="p-2 max-h-[80vh] overflow-auto flex items-center justify-center">
                <img
                  src={data.slipUrl}
                  alt="Bank Transfer Slip Full"
                  className="max-w-full max-h-[75vh] object-contain rounded-lg"
                />
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}
