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
  Mail,
  QrCode,
  Receipt,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  UploadCloud,
  XCircle,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { useFinancialCapabilities } from "../../lib/financial-capabilities";
import { useSessionUser } from "../../providers/session-user-provider";
import { notify } from "../../components/feedback/notifications";
import { formatAppDate, formatAppDateTime } from "../../lib/date-format";
import { PaymentHistory,type TransferHistoryRow } from "./payment-history";
import { formatTransferAmount } from "./payment-input";

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
  payments?: TransferHistoryRow[];
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
  const user = useSessionUser();
  const financial = useFinancialCapabilities();
  const isSchoolUser = user?.role === "school_user";

  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<BillingDetailData | null>(initialData || null);

  // Verification & Workflow Action states
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [showRejectInput, setShowRejectInput] = React.useState(false);
  const [rejectionReason, setRejectionReason] = React.useState("");
  const [slipZoomOpen, setSlipZoomOpen] = React.useState(false);

  // Email invoice states
  const [emailModalOpen, setEmailModalOpen] = React.useState(false);
  const [recipientEmail, setRecipientEmail] = React.useState("");
  const [isSendingEmail, setIsSendingEmail] = React.useState(false);

  // Drag and drop slip upload states
  const [isDragging, setIsDragging] = React.useState(false);
  const [isUploadingSlip, setIsUploadingSlip] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleSendEmail = async () => {
    if (!data?.id || !recipientEmail.trim()) return;
    setIsSendingEmail(true);
    try {
      await apiClient.post(`/v1/billing-cycles/${data.id}/send-email`, {
        recipientEmail: recipientEmail.trim(),
      });
      notify.success(
        locale === "th"
          ? `ส่งอีเมลใบแจ้งหนี้ไปยัง ${recipientEmail} สำเร็จ`
          : `Invoice email sent to ${recipientEmail} successfully`
      );
      setEmailModalOpen(false);
    } catch (err: any) {
      notify.error(err?.message || "ไม่สามารถส่งอีเมลใบแจ้งหนี้ได้");
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file || !data?.id) return;
    if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      notify.error("Choose a PNG, JPEG or PDF file no larger than 10 MB");
      return;
    }
    setIsUploadingSlip(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        try {
          await apiClient.post(`/v1/billing-cycles/${data.id}/pay`, {
            amount: data.amount,
            slipUrl: dataUrl,
            paidAt: new Date().toISOString(),
            note: "Uploaded via Billing Detail Modal",
          });
          notify.success(
            locale === "th"
              ? "อัปโหลดสลิปหลักฐานสำเร็จ อยู่ระหว่างรอตรวจสอบ"
              : "Payment slip uploaded successfully"
          );
          setData((prev) => (prev ? { ...prev, slipUrl: dataUrl, status: "pending_verification" } : null));
          await fetchDetails(data.id);
          onUpdated?.();
        } catch (err: any) {
          notify.error(err?.message || "เกิดข้อผิดพลาดในการบันทึกสลิป");
        } finally {
          setIsUploadingSlip(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setIsUploadingSlip(false);
      notify.error("ไม่สามารถอ่านไฟล์ได้");
    }
  };

  const fetchDetails = React.useCallback(async (id: string) => {
    setLoading(true);
    try {
      const {row:res} = await apiClient.get<{row:BillingDetailData}>(`/v1/operations/billing/${id}`);
      setData((prev) => ({ ...prev, ...res }));
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Unable to load billing details");
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
      await fetchDetails(data.id);
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
      await fetchDetails(data.id);
      onUpdated?.();
    } catch (err: any) {
      notify.error(err?.message || "เกิดข้อผิดพลาดในการปฏิเสธ");
    } finally {
      setIsSubmitting(false);
    }
  };

  const amountNum = Number(data.amount) || 0;
  const isPaid = data.status === "paid" || data.paymentStatus === "approved" || data.paymentStatus === "paid";
  const hasSlip = Boolean(data.slipUrl);
  const payments=data.payments??[];
  const hasPendingTransfers=payments.some(payment=>payment.status==="pending_verification");

  const formatNumber = (val: any) => {
    if (val === undefined || val === null || val === "") return "—";
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
        <DialogHeader className="pb-4 order/60">
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

            {/* Quick Document Links & Email Dispatch */}
            <div className="flex items-center gap-2 pr-6">
              {financial.actions.includes("send") && <Button
                variant="outline"
                size="sm"
                onClick={() => setEmailModalOpen(true)}
                className="h-10 text-xs gap-1.5 cursor-pointer text-foreground border-border hover:bg-accent"
              >
                <Mail className="size-3.5 text-primary" />
                <span>{locale === "th" ? "ส่งอีเมลใบแจ้งหนี้" : "Email Invoice"}</span>
              </Button>}
              {onOpenInvoice && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenInvoice(data)}
                  className="h-10 text-xs gap-1.5 cursor-pointer text-primary"
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
                  className="h-10 text-xs gap-1.5 cursor-pointer text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
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
            <div className="space-y-3 border-t pt-4">
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
                  <span className="font-mono font-bold text-xs">{formatNumber(data.openingEnergy)}</span>
                  <span className="text-[9px] text-muted-foreground block">kWh</span>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/30 border border-border/50 text-center">
                  <span className="text-[10px] text-muted-foreground block">{locale === "th" ? "หน่วยยกไป (ปิด)" : "Closing"}</span>
                  <span className="font-mono font-bold text-xs">{formatNumber(data.closingEnergy)}</span>
                  <span className="text-[9px] text-muted-foreground block">kWh</span>
                </div>
                <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20 text-center">
                  <span className="text-[10px] text-primary block font-semibold">{locale === "th" ? "พลังงานสุทธิ" : "Consumed"}</span>
                  <span className="font-mono font-bold text-sm text-primary">{formatNumber(data.consumedKwh)}</span>
                  <span className="text-[9px] text-primary/80 block">kWh</span>
                </div>
              </div>
            </div>

            {/* Financial Computation Breakdown */}
            <div className="space-y-2.5 border-t pt-4">
              <div className="text-xs font-semibold text-foreground uppercase tracking-wider">
                {locale === "th" ? "รายละเอียดค่าไฟฟ้า" : "Electricity charges"}
              </div>

              <div className="divide-y divide-border/40 text-xs">
                <div className="py-2 flex items-center justify-between">
                  <span className="text-muted-foreground">{locale === "th" ? "พลังงานไฟฟ้าที่ใช้" : "Consumed Energy"}</span>
                  <span className="font-mono font-medium">{formatNumber(data.consumedKwh)} kWh</span>
                </div>
                <div className="py-2 flex items-center justify-between">
                  <span className="text-muted-foreground">{locale === "th" ? "อัตราค่าไฟตามสัญญา" : "Fixed PPA Tariff"}</span>
                  <span className="font-mono font-medium">฿{formatNumber(data.rate)} / kWh</span>
                </div>
                <div className="py-2.5 flex items-center justify-between border-t border-border font-bold text-sm text-foreground">
                  <span>{locale === "th" ? "ยอดเงินรวมทั้งสิ้นที่ต้องชำระ" : "Total Amount Due"}</span>
                  <span className="font-mono text-base text-amber-600 dark:text-amber-400">฿{formatNumber(amountNum)}</span>
                </div>
              </div>
            </div>

            {/* Meta Information */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="space-y-0.5 border-t pt-4">
                <span className="text-[10px] text-muted-foreground block">{locale === "th" ? "เลขที่ใบแจ้งหนี้" : "Invoice No."}</span>
                <span className="font-mono font-medium">{data.invoiceNumber || "-"}</span>
              </div>
              <div className="space-y-0.5 border-t pt-4">
                <span className="text-[10px] text-muted-foreground block">{locale === "th" ? "เลขที่ใบเสร็จรับเงิน" : "Receipt No."}</span>
                <span className="font-mono font-medium">{data.receiptNumber || "—"}</span>
              </div>
            </div>
          </div>

          {/* ============================================================== */}
          {/* RIGHT COLUMN: Payment Evidence & Verification Action (5 Cols) */}
          {/* ============================================================== */}
          <div className="lg:col-span-5 space-y-4 text-xs">
            <PaymentHistory payments={payments} locale={locale}/>
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between font-semibold text-foreground">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-primary" />
                  <span>{locale === "th" ? "หลักฐานการโอนเงิน (Slip)" : "Payment Slip Evidence"}</span>
                </span>
                {hasSlip && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 text-[11px] px-2 text-primary gap-1"
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

                  <div className="text-[11px] space-y-1 border-t pt-4">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{locale === "th" ? "วันเวลาที่โอน:" : "Paid At:"}</span>
                      <span className="font-medium text-foreground">{data.paidAt ? formatAppDateTime(data.paidAt, locale) : "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{locale === "th" ? "ยอดเงินในสลิป:" : "Slip Amount:"}</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">฿{payments.some(payment=>payment.id===data.paymentId)?formatTransferAmount(payments.find(payment=>payment.id===data.paymentId)!.amount):formatNumber(data.paidAmount)}</span>
                    </div>
                  </div>
                  <div className="flex justify-end pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-10 text-[10px] text-muted-foreground hover:text-foreground gap-1 cursor-pointer"
                    >
                      <UploadCloud className="size-3" />
                      <span>{locale === "th" ? "อัปโหลดสลิปใหม่" : "Re-upload Slip"}</span>
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          handleFileUpload(e.target.files[0]);
                        }
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files?.[0]) {
                      handleFileUpload(e.dataTransfer.files[0]);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`p-6 rounded-xl border-2 border-dashed transition-all text-center space-y-2 cursor-pointer ${
                    isDragging
                      ? "border-primary bg-primary/10"
                      : "border-border/80 bg-muted/15 hover:bg-muted/25"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        handleFileUpload(e.target.files[0]);
                      }
                    }}
                  />
                  <div className="size-11 rounded-full bg-primary/10 flex items-center justify-center mx-auto text-primary">
                    <UploadCloud className="size-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-xs">
                      {locale === "th" ? "ลากสลิปมาวางที่นี่ หรือคลิกเพื่ออัปโหลด" : "Drag and drop slip here, or click to upload"}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {locale === "th" ? "รองรับไฟล์ภาพ JPG, PNG (สูงสุด 5MB)" : "Supports JPG, PNG images (Max 5MB)"}
                    </p>
                  </div>
                  {isUploadingSlip && (
                    <div className="flex items-center justify-center gap-1.5 text-xs text-primary font-medium">
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>{locale === "th" ? "กำลังอัปโหลดสลิป..." : "Uploading slip..."}</span>
                    </div>
                  )}
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
                <div className="text-rose-950 dark:text-rose-200 text-xs space-y-1 border-t pt-4">
                  <div className="flex items-center gap-1.5 font-semibold text-rose-600 dark:text-rose-400">
                    <XCircle className="size-3.5" />
                    <span>{locale === "th" ? "เหตุผลการปฏิเสธหลักฐาน:" : "Rejection Reason:"}</span>
                  </div>
                  <p className="text-[11px]">{data.rejectionReason}</p>
                </div>
              )}

              {/* Admin/Owner Actions: Approve or Reject Inline */}
              {financial.actions.includes("approve_payment") && !isPaid && (hasPendingTransfers||hasSlip) && (
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
                        className="h-10 text-xs font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
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
                        className="h-10 text-xs font-semibold gap-1.5 text-rose-600 border-rose-500/30 hover:bg-rose-500/10 cursor-pointer"
                      >
                        <XCircle className="size-3.5" />
                        <span>{locale === "th" ? "ปฏิเสธสลิป" : "Reject"}</span>
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2 border-t pt-4">
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
                          className="h-10 text-xs"
                        >
                          {locale === "th" ? "ยกเลิก" : "Cancel"}
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleRejectPayment}
                          disabled={isSubmitting || !rejectionReason.trim()}
                          className="h-10 text-xs bg-rose-600 hover:bg-rose-700 text-white font-semibold"
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
              <DialogHeader className="p-2 order/60">
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

        {/* Email Invoice Modal */}
        <Dialog open={emailModalOpen} onOpenChange={setEmailModalOpen}>
          <DialogContent className="sm:max-w-md w-full bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                <Mail className="size-4 text-emerald-500" />
                <span>{locale === "th" ? "ส่งอีเมลใบแจ้งหนี้" : "Send Invoice Email"}</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {locale === "th"
                  ? `ส่งใบแจ้งหนี้รอบบิล ${data?.period || ""} พร้อมไฟล์แนบให้ลูกค้าทางอีเมล`
                  : `Send billing invoice for period ${data?.period || ""} with attachment.`}
              </DialogDescription>
            </DialogHeader>

            <div className="py-3 space-y-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">
                  {locale === "th" ? "อีเมลผู้รับ" : "Recipient Email"}
                </Label>
                <Input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="finance@school.ac.th"
                  className="h-10 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEmailModalOpen(false)}
                className="text-xs"
              >
                {locale === "th" ? "ยกเลิก" : "Cancel"}
              </Button>
              <Button
                size="sm"
                onClick={handleSendEmail}
                disabled={isSendingEmail || !recipientEmail.trim()}
                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-1.5"
              >
                {isSendingEmail ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
                <span>{locale === "th" ? "ยืนยันส่งอีเมล" : "Send Email"}</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
