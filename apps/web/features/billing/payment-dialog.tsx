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
import { DatePicker } from "../../components/ui/date-picker";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { useLocale } from "../../providers/locale-provider";
import { apiClient } from "../../lib/api-client";
import { useFinancialCapabilities } from "../../lib/financial-capabilities";
import { transferAmount,bangkokTransferWallTime,transferWallTimeToIso } from "./payment-input";

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
    amount?: number|string;
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
  const locale=useLocale();
  const text = (th: string, en: string) => (locale === "th" ? th : en);
  const capabilities=useFinancialCapabilities();
  const canSubmit=(capabilities.operationsActions??[]).includes("submit_payment");
  const [enteredAmount,setEnteredAmount]=React.useState("");
  React.useEffect(()=>{if(open)setEnteredAmount(String(billingCycle?.amount??"").replace(/(\.\d{2})0+$/, "$1"));},[open,billingCycle?.id]);
  const [slipFile, setSlipFile] = React.useState<File | null>(null);
  const [slipPreviewUrl, setSlipPreviewUrl] = React.useState<string | null>(
    null,
  );
  const [paidAt, setPaidAt] = React.useState<string>(
    bangkokTransferWallTime()
  );
  const [note, setNote] = React.useState<string>("");
  const submitting = React.useRef(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);
  const [bankAccounts, setBankAccounts] = React.useState<
    Array<{
      id: string;
      bankName: string;
      accountNumber: string;
      accountName: string;
    }>
  >([]);

  React.useEffect(() => {
    if (open) {
      setBankAccounts([]);
      apiClient
        .get<
          Array<{
            id: string;
            bankName: string;
            accountNumber: string;
            accountName: string;
          }>
        >("/v1/settings/bank-accounts")
        .then(setBankAccounts)
        .catch(() =>
          setErrorMsg(
            text(
              "โหลดบัญชีรับชำระไม่สำเร็จ",
              "Unable to load payment accounts.",
            ),
          ),
        );
      setSlipFile(null);
      setSlipPreviewUrl(null);
      setPaidAt(bangkokTransferWallTime());
      setNote("");
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [open]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg(
        text(
          "ไฟล์ต้องมีขนาดไม่เกิน 10 MB",
          "File must be no larger than 10 MB",
        ),
      );
      return;
    }

    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      setErrorMsg(
        text(
          "กรุณาเลือกไฟล์รูปภาพ (PNG, JPEG) หรือเอกสาร PDF เท่านั้น",
          "Select a PNG, JPEG image or PDF document.",
        ),
      );
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
    if (!billingCycle?.id || submitting.current || !canSubmit) return;

    if (!slipPreviewUrl) {
      setErrorMsg(
        text(
          "กรุณาแนบไฟล์สลิปหลักฐานการโอนเงิน",
          "Attach your transfer receipt.",
        ),
      );
      return;
    }

    let actualTransfer:string;
    try{actualTransfer=transferAmount(enteredAmount);}catch{setErrorMsg(locale==="th"?"กรุณาระบุยอดโอนเป็นเงินบาทที่มากกว่าศูนย์และมีทศนิยมไม่เกิน 2 ตำแหน่ง":"Enter a positive THB transfer amount with at most two decimal places.");return;}
    let transferInstant:string;
    try{transferInstant=transferWallTimeToIso(paidAt);}catch{setErrorMsg(locale==="th"?"กรุณาระบุวันและเวลาที่โอนให้ถูกต้อง (เวลาไทย)":"Enter a valid transfer date and time in Bangkok time.");return;}
    submitting.current=true;
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await apiClient.post(`/v1/billing-cycles/${billingCycle.id}/pay`, {
        amount: capabilities.financialScope==="TEST"?actualTransfer:Number(actualTransfer),
        paidAt: transferInstant,
        slipUrl: slipPreviewUrl,
        note: note.trim() || undefined,
      });

      setSuccessMsg(
        text(
          "ส่งหลักฐานการชำระเงินเรียบร้อยแล้ว อยู่ระหว่างการตรวจสอบโดยเจ้าหน้าที่",
          "Payment evidence submitted. Staff verification is pending.",
        ),
      );
      setTimeout(() => {
        onSuccess?.();
        onOpenChange(false);
      }, 1500);
    } catch (err: any) {
      setErrorMsg(
        text(
          "เกิดข้อผิดพลาดในการส่งหลักฐานการชำระเงิน กรุณาตรวจสอบข้อมูลและลองใหม่",
          "Unable to submit payment evidence. Check the details and try again.",
        ),
      );
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  const amount = Number(billingCycle?.amount ?? 0);
  const energyKwh = Number(billingCycle?.consumedKwh ?? 0);
  const rate =
    billingCycle?.rate === undefined ? null : Number(billingCycle.rate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto p-5 sm:p-6 rounded-2xl">
        <DialogHeader className="pb-3 order/50">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <QrCode className="size-4.5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                {text("ชำระเงินและแนบหลักฐาน", "Payment and proof")}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {text("รอบบิล:", "Billing period:")}{" "}
                {billingCycle?.period || "-"} · {billingCycle?.schoolName}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {successMsg ? (
          <div className="py-8 flex flex-col items-center text-center space-y-3">
            <div className="size-14 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="size-8" />
            </div>
            <h3 className="text-base font-bold text-foreground">
              {text("ส่งข้อมูลสำเร็จ!", "Submitted successfully")}
            </h3>
            <p className="text-xs text-muted-foreground max-w-xs">
              {successMsg}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            {/* Amount Summary Card */}
            <div className="space-y-2 border-t pt-4">
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>
                  {text("พลังงานที่ใช้", "Consumed energy")} (
                  {energyKwh.toLocaleString(locale)} kWh @ ฿
                  {rate?.toFixed(2) ?? "—"})
                </span>
                <span className="font-medium text-foreground">
                  ฿{amount.toLocaleString(locale, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="pt-2 border-t border-border/60 flex justify-between items-center">
                <span className="text-sm font-semibold text-foreground">
                  {text("ยอดชำระสุทธิ", "Total payable")}
                </span>
                <span className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                  ฿
                  {amount.toLocaleString(locale, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>

            {/* PromptPay QR Section */}
            <div className="flex flex-col items-center justify-center p-4 rounded-xl border border-dashed border-border/80 bg-card text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-semibold">
                <QrCode className="size-3.5" />
                {text("บัญชีรับชำระ / Payment accounts", "Payment accounts")}
              </div>

              <div className="text-[11px] text-muted-foreground leading-tight space-y-0.5">
                {bankAccounts.length ? (
                  bankAccounts.map((account) => (
                    <div key={account.id} className="py-2">
                      <p className="font-medium text-foreground">
                        {account.bankName}
                      </p>
                      <p>
                        {text("เลขที่บัญชี:", "Account number:")}{" "}
                        <span className="font-mono font-bold text-foreground">
                          {account.accountNumber}
                        </span>
                      </p>
                      <p>{account.accountName}</p>
                    </div>
                  ))
                ) : (
                  <p>
                    {text(
                      "ยังไม่ได้ตั้งค่าบัญชีรับชำระ กรุณาติดต่อผู้ดูแล",
                      "Payment accounts unavailable. Contact an administrator.",
                    )}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="transfer-amount" required>{locale==='th'?'ยอดที่โอนครั้งนี้ (บาท)':'This transfer amount (THB)'}</Label>
              <Input id="transfer-amount" inputMode="decimal" value={enteredAmount} onChange={event=>setEnteredAmount(event.target.value)} required aria-describedby="transfer-amount-help" disabled={isSubmitting}/>
              <p id="transfer-amount-help" className="text-xs text-muted-foreground">{locale==='th'?'ส่งหลักฐานแยกสำหรับแต่ละครั้งที่โอน ยอดโอนที่รอตรวจสอบรวมกันต้องเท่ากับยอดบิลก่อนอนุมัติ':'Submit separate evidence for each transfer. Pending transfers must add up to the bill total before approval.'}</p>
            </div>
            {/* Slip Upload & Transfer Information */}
            <div className="space-y-3 pt-1">
              <div className="space-y-2">
                <Label htmlFor="slip-upload" className="text-xs font-semibold">
                  {text("แนบสลิปหลักฐานการโอน", "Attach transfer proof")}{" "}
                  <span className="text-destructive">*</span>
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
                          <img
                            src={slipPreviewUrl}
                            alt={text("ตัวอย่างหลักฐาน", "Proof preview")}
                            className="size-full object-cover"
                          />
                        ) : (
                          <FileText className="size-6 text-emerald-600" />
                        )}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <span className="text-xs font-semibold text-foreground truncate block">
                          {slipFile?.name ||
                            text("สลิปการโอนเงิน", "Transfer receipt")}
                        </span>
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                          {text(
                            "แนบไฟล์เรียบร้อยแล้ว (คลิกเพื่อเปลี่ยน)",
                            "File attached (select to replace)",
                          )}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-2 space-y-1">
                      <Upload className="size-6 text-muted-foreground" />
                      <span className="text-xs font-medium text-foreground">
                        {text(
                          "คลิกเพื่อเลือกไฟล์รูปภาพหรือสลิป",
                          "Select an image or transfer receipt",
                        )}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {text(
                          "รองรับไฟล์ PNG, JPG หรือ PDF (ขนาดไม่เกิน 10MB)",
                          "PNG, JPG or PDF, up to 10 MB",
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Transfer Date Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-2">
                  <Label
                    htmlFor="paid-at"
                    className="text-xs font-semibold flex items-center gap-1"
                  >
                    <Clock className="size-3 text-muted-foreground" />
                    {locale==="th"?"วันและเวลาที่โอน (เวลาไทย)":"Transfer date and time (Asia/Bangkok)"}
                  </Label>
                  <DatePicker
                    id="paid-at"
                    includeTime
                    value={paidAt}
                    onValueChange={setPaidAt}
                    className="h-10 text-xs"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="note" className="text-xs font-semibold">
                    {text(
                      "หมายเหตุเพิ่มเติม (ถ้ามี)",
                      "Additional note (optional)",
                    )}
                  </Label>
                  <Input
                    id="note"
                    placeholder={text(
                      "เช่น โอนจากบัญชีองค์กร",
                      "e.g. Transfer from organization account",
                    )}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="h-10 text-xs"
                  />
                </div>
              </div>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs flex items-center gap-2"
              >
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
                {text("ยกเลิก", "Cancel")}
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting||!canSubmit}
                className="w-full sm:w-auto h-10 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              >
                {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
                {text("ยืนยันการชำระเงิน", "Submit payment evidence")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
