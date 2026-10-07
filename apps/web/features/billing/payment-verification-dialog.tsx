"use client";

import * as React from "react";
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  FileCheck,
  FileX,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  XCircle,
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
import { Badge } from "../../components/ui/badge";
import { apiClient } from "../../lib/api-client";

interface PaymentVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billingCycle: {
    id: string;
    period?: string;
    schoolName?: string;
    siteName?: string;
    amount?: number;
    consumedKwh?: number;
    slipUrl?: string;
    paidAt?: string;
    paymentNote?: string;
    paymentStatus?: string;
    status?: string;
  } | null;
  onSuccess?: () => void;
}

export function PaymentVerificationDialog({
  open,
  onOpenChange,
  billingCycle,
  onSuccess,
}: PaymentVerificationDialogProps) {
  const [rejectionReason, setRejectionReason] = React.useState("");
  const [showRejectInput, setShowRejectInput] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setRejectionReason("");
      setShowRejectInput(false);
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [open]);

  const handleApprove = async () => {
    if (!billingCycle?.id) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await apiClient.patch(`/v1/billing-cycles/${billingCycle.id}/verify-payment`, {
        status: "approved",
      });
      setSuccessMsg("อนุมัติการชำระเงินและออกใบเสร็จรับเงินเรียบร้อยแล้ว");
      setTimeout(() => {
        onSuccess?.();
        onOpenChange(false);
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err?.message || "เกิดข้อผิดพลาดในการอนุมัติ");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!billingCycle?.id) return;
    if (!rejectionReason.trim()) {
      setErrorMsg("กรุณาระบุเหตุผลการปฏิเสธ เช่น ยอดเงินไม่ตรง หรือสลิปไม่ชัดเจน");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await apiClient.patch(`/v1/billing-cycles/${billingCycle.id}/verify-payment`, {
        status: "rejected",
        rejectionReason: rejectionReason.trim(),
      });
      setSuccessMsg("ปฏิเสธหลักฐานการชำระเงินเรียบร้อยแล้ว");
      setTimeout(() => {
        onSuccess?.();
        onOpenChange(false);
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err?.message || "เกิดข้อผิดพลาดในการปฏิเสธ");
    } finally {
      setIsSubmitting(false);
    }
  };

  const amount = Number(billingCycle?.amount ?? 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto p-5 sm:p-6 rounded-2xl">
        <DialogHeader className="pb-3 order/50">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <ShieldCheck className="size-4.5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                ตรวจสอบหลักฐานการชำระเงิน
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                รอบบิล: {billingCycle?.period || "-"} · {billingCycle?.schoolName}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {successMsg ? (
          <div className="py-8 flex flex-col items-center text-center space-y-3">
            <div className="size-14 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="size-8" />
            </div>
            <h3 className="text-base font-bold text-foreground">ดำเนินการสำเร็จ</h3>
            <p className="text-xs text-muted-foreground max-w-xs">{successMsg}</p>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            {/* Details Summary */}
            <div className="grid grid-cols-2 gap-2 text-xs border-t pt-4">
              <div>
                <span className="text-muted-foreground block text-[11px]">ยอดเงินที่ต้องชำระ</span>
                <span className="font-bold text-sm text-foreground">
                  ฿{amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">วันเวลาที่ระบุในสลิป</span>
                <span className="font-medium text-foreground">
                  {billingCycle?.paidAt || "ไม่ระบุ"}
                </span>
              </div>
              {billingCycle?.paymentNote && (
                <div className="col-span-2 pt-1 border-t border-border/50">
                  <span className="text-muted-foreground text-[11px] block">หมายเหตุจากผู้ชำระ:</span>
                  <span className="text-foreground">{billingCycle.paymentNote}</span>
                </div>
              )}
            </div>

            {/* Slip Preview Box */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">ภาพหลักฐานสลิปการโอน</Label>
              <div className="border border-border/80 rounded-xl overflow-hidden bg-neutral-900/5 dark:bg-neutral-900/40 p-2 flex flex-col items-center justify-center min-h-[220px]">
                {billingCycle?.slipUrl ? (
                  <div className="space-y-2 w-full flex flex-col items-center">
                    <img
                      src={billingCycle.slipUrl}
                      alt="Payment Slip Evidence"
                      className="max-h-72 w-auto object-contain rounded-lg shadow-xs border border-border/50"
                    />
                    <a
                      href={billingCycle.slipUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                    >
                      <ExternalLink className="size-3" />
                      เปิดดูภาพขนาดเต็ม
                    </a>
                  </div>
                ) : (
                  <div className="text-center p-6 text-muted-foreground text-xs">
                    ไม่มีรูปภาพสลิป
                  </div>
                )}
              </div>
            </div>

            {/* Rejection input when triggered */}
            {showRejectInput && (
              <div className="p-3 rounded-xl border border-destructive/30 bg-destructive/5 space-y-2">
                <Label htmlFor="reject-reason" className="text-xs font-semibold text-destructive flex items-center gap-1">
                  <ShieldAlert className="size-3.5" />
                  ระบุเหตุผลที่ปฏิเสธการชำระเงิน <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="reject-reason"
                  placeholder="เช่น ยอดเงินไม่ตรงกับใบแจ้งหนี้, สลิปซ้ำ หรือภาพไม่ชัดเจน"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="text-xs bg-card"
                  autoFocus
                />
              </div>
            )}

            {errorMsg && (
              <div className="p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <DialogFooter className="pt-2 flex flex-col sm:flex-row gap-2 border-t border-border/50">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
                className="w-full sm:w-auto h-10 text-xs"
              >
                ปิด
              </Button>

              {showRejectInput ? (
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowRejectInput(false)}
                    className="h-10 text-xs"
                  >
                    ย้อนกลับ
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleReject}
                    disabled={isSubmitting}
                    className="h-10 text-xs gap-1.5 flex-1 sm:flex-initial"
                  >
                    {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
                    ยืนยันปฏิเสธ
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowRejectInput(true)}
                    disabled={isSubmitting}
                    className="h-10 text-xs border-destructive/40 text-destructive hover:bg-destructive/10 gap-1"
                  >
                    <FileX className="size-3.5" />
                    ปฏิเสธสลิป
                  </Button>

                  <Button
                    type="button"
                    onClick={handleApprove}
                    disabled={isSubmitting}
                    className="h-10 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 flex-1 sm:flex-initial"
                  >
                    {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
                    <FileCheck className="size-3.5" />
                    อนุมัติการชำระเงิน
                  </Button>
                </div>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
