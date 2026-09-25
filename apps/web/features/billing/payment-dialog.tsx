"use client";

import * as React from "react";
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileCheck,
  FileText,
  HelpCircle,
  Image as ImageIcon,
  Loader2,
  QrCode,
  Upload,
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
import { Badge } from "../../components/ui/badge";
import { apiClient } from "../../lib/api-client";

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billingCycle: {
    id: string;
    period?: string;
    schoolName?: string;
    siteName?: string;
    consumedKwh?: number;
    rate?: number;
    amount?: number;
    invoiceNumber?: string;
  } | null;
  onSuccess?: () => void;
}

export function PaymentDialog({
  open,
  onOpenChange,
  billingCycle,
  onSuccess,
}: PaymentDialogProps) {
  const [slipFile, setSlipFile] = React.useState<File | null>(null);
  const [slipPreviewUrl, setSlipPreviewUrl] = React.useState<string | null>(null);
  const [paidAt, setPaidAt] = React.useState<string>(
    new Date().toISOString().slice(0, 16)
  );
  const [note, setNote] = React.useState<string>("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setSlipFile(null);
      setSlipPreviewUrl(null);
      setPaidAt(new Date().toISOString().slice(0, 16));
      setNote("");
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [open]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      setErrorMsg("กรุณาเลือกไฟล์รูปภาพ (PNG, JPEG) หรือเอกสาร PDF เท่านั้น");
      return;
    }

    setErrorMsg(null);
    setSlipFile(file);

    const reader = new FileReader();
    reader.onload = () => {
      setSlipPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billingCycle?.id) return;

    if (!slipPreviewUrl) {
      setErrorMsg("กรุณาแนบไฟล์สลิปหลักฐานการโอนเงิน");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await apiClient.post(`/v1/billing-cycles/${billingCycle.id}/pay`, {
        amount: billingCycle.amount,
        paidAt: new Date(paidAt).toISOString(),
        slipUrl: slipPreviewUrl,
        note: note.trim() || undefined,
      });

      setSuccessMsg("ส่งหลักฐานการชำระเงินเรียบร้อยแล้ว อยู่ระหว่างการตรวจสอบโดยเจ้าหน้าที่");
      setTimeout(() => {
        onSuccess?.();
        onOpenChange(false);
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err?.message || "เกิดข้อผิดพลาดในการส่งหลักฐานการชำระเงิน");
    } finally {
      setIsSubmitting(false);
    }
  };

  const amount = Number(billingCycle?.amount ?? 0);
  const energyKwh = Number(billingCycle?.consumedKwh ?? 0);
  const rate = Number(billingCycle?.rate ?? 4.25);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto p-5 sm:p-6 rounded-2xl">
        <DialogHeader className="pb-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <QrCode className="size-4.5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                ชำระเงินและแนบหลักฐาน
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
            <h3 className="text-base font-bold text-foreground">ส่งข้อมูลสำเร็จ!</h3>
            <p className="text-xs text-muted-foreground max-w-xs">{successMsg}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            {/* Amount Summary Card */}
            <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 space-y-2">
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>พลังงานที่ใช้ ({energyKwh.toLocaleString()} kWh @ ฿{rate.toFixed(2)})</span>
                <span className="font-medium text-foreground">฿{amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>ภาษีมูลค่าเพิ่ม (VAT 7% รวมแล้ว)</span>
                <span className="font-medium text-foreground">฿{(amount * 0.07 / 1.07).toFixed(2)}</span>
              </div>
              <div className="pt-2 border-t border-border/60 flex justify-between items-center">
                <span className="text-sm font-semibold text-foreground">ยอดชำระสุทธิ</span>
                <span className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                  ฿{amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* PromptPay QR Section */}
            <div className="flex flex-col items-center justify-center p-4 rounded-xl border border-dashed border-border/80 bg-card text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-semibold">
                <QrCode className="size-3.5" />
                PromptPay QR Payment
              </div>

              {/* QR Image Simulation */}
              <div className="p-2.5 bg-white rounded-xl shadow-xs border border-neutral-200">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=PROMPTPAY:SOLAR:${billingCycle?.id}:${amount}`}
                  alt="PromptPay QR Code"
                  className="size-40 rounded object-contain"
                  onError={(e) => {
                    // Fallback to SVG placeholder if offline
                    e.currentTarget.style.display = "none";
                  }}
                />
              </div>

              <div className="text-[11px] text-muted-foreground leading-tight space-y-0.5">
                <p className="font-medium text-foreground">ธนาคารกรุงไทย (Krungthai Bank)</p>
                <p>เลขที่บัญชี: <span className="font-mono font-bold text-foreground">123-4-56789-0</span></p>
                <p className="text-[10px]">ชื่อบัญชี: กองทุนพลังงานแสงอาทิตย์เพื่อการศึกษา</p>
              </div>
            </div>

            {/* Slip Upload & Transfer Information */}
            <div className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="slip-upload" className="text-xs font-semibold">
                  แนบสลิปหลักฐานการโอน <span className="text-destructive">*</span>
                </Label>
                
                <div className="relative border-2 border-dashed border-border/80 hover:border-primary/60 rounded-xl p-3 text-center transition-colors cursor-pointer bg-muted/20">
                  <input
                    id="slip-upload"
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  {slipPreviewUrl ? (
                    <div className="flex items-center gap-3">
                      <div className="size-12 rounded-lg bg-emerald-500/10 border border-emerald-500/30 overflow-hidden shrink-0 flex items-center justify-center">
                        {slipFile?.type.startsWith("image/") ? (
                          <img src={slipPreviewUrl} alt="Slip Preview" className="size-full object-cover" />
                        ) : (
                          <FileText className="size-6 text-emerald-600" />
                        )}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <span className="text-xs font-semibold text-foreground truncate block">
                          {slipFile?.name || "สลิปการโอนเงิน"}
                        </span>
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                          แนบไฟล์เรียบร้อยแล้ว (คลิกเพื่อเปลี่ยน)
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-2 space-y-1">
                      <Upload className="size-6 text-muted-foreground" />
                      <span className="text-xs font-medium text-foreground">
                        คลิกเพื่อเลือกไฟล์รูปภาพหรือสลิป
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        รองรับไฟล์ PNG, JPG หรือ PDF (ขนาดไม่เกิน 10MB)
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Transfer Date Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label htmlFor="paid-at" className="text-xs font-semibold flex items-center gap-1">
                    <Clock className="size-3 text-muted-foreground" />
                    วันและเวลาที่โอน
                  </Label>
                  <Input
                    id="paid-at"
                    type="datetime-local"
                    value={paidAt}
                    onChange={(e) => setPaidAt(e.target.value)}
                    className="h-9 text-xs"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="note" className="text-xs font-semibold">
                    หมายเหตุเพิ่มเติม (ถ้ามี)
                  </Label>
                  <Input
                    id="note"
                    placeholder="เช่น โอนจากบัญชีโรงเรียน"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            </div>

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
                className="w-full sm:w-auto h-9 text-xs"
              >
                ยกเลิก
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              >
                {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
                ยืนยันการชำระเงิน
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
