"use client";

import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  QrCode,
  Upload,
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
import { ChoiceSelect } from "../../components/ui/choice-select";
import { Input } from "../../components/ui/input";
import { DatePicker } from "../../components/ui/date-picker";
import { Label } from "../../components/ui/label";
import { useLocale } from "../../providers/locale-provider";
import { apiClient } from "../../lib/api-client";
import { useFinancialCapabilities } from "../../lib/financial-capabilities";
import { paymentMetadataCopy } from "./payment-metadata-copy";
import { transferAmount, bangkokTransferWallTime } from "./payment-input";

interface PayerInputValue {
  payerName: string;
  paymentMethod: string;
  originBank: string;
  originAccount: string;
}

export function PaymentMetadataFields({
  locale,
  value,
  onChange,
  disabled = false,
}: {
  locale: "th" | "en";
  value: PayerInputValue;
  onChange: (value: PayerInputValue) => void;
  disabled?: boolean;
}) {
  const copy = paymentMetadataCopy[locale];
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-xs font-semibold">
        {copy.payerName} / {copy.paymentMethod} ({copy.optional})
      </legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(["payerName", "originBank", "originAccount"] as const).map((field) => (
          <div key={field} className="space-y-2">
            <Label htmlFor={"transfer-" + field}>
              {copy[field]} ({copy.optional})
            </Label>
            <Input
              id={"transfer-" + field}
              value={value[field]}
              maxLength={{ payerName: 200, originBank: 120, originAccount: 80 }[field]}
              onChange={(event) => onChange({ ...value, [field]: event.target.value })}
              className="text-base md:text-sm h-10"
            />
          </div>
        ))}
        <div className="space-y-2">
          <Label htmlFor="transfer-method">
            {copy.paymentMethod} ({copy.optional})
          </Label>
          <ChoiceSelect
            id="transfer-method"
            disabled={disabled}
            className="w-full text-base md:text-sm h-10"
            value={value.paymentMethod}
            onChange={(event) => onChange({ ...value, paymentMethod: event.target.value })}
          >
            <option value="">{copy.unspecified}</option>
            <option value="bank_transfer">{copy.bank_transfer}</option>
            <option value="promptpay">{copy.promptpay}</option>
          </ChoiceSelect>
        </div>
      </div>
    </fieldset>
  );
}

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billingCycle: {
    id: string;
    period?: string;
    customerName?: string;
    siteName?: string;
    consumedKwh?: number;
    rate?: number;
    amount?: number | string;
    invoiceNumber?: string;
    payments?: Array<{ amount?: string | null; verifiedAmount?: string | null; status: string }>;
  } | null;
  onSuccess?: () => void;
  inline?: boolean;
}

export function PaymentDialog({
  open,
  onOpenChange,
  billingCycle,
  onSuccess,
  inline,
}: PaymentDialogProps) {
  const locale = useLocale();
  const text = (th: string, en: string) => (locale === "th" ? th : en);

  const capabilities = useFinancialCapabilities();
  const canSubmit = (capabilities.operationsActions ?? []).includes("submit_payment");

  const today = React.useMemo(() => bangkokTransferWallTime().slice(0, 10), []);
  const [paymentDate, setPaymentDate] = React.useState<string>(today);
  const [transferChannel, setTransferChannel] = React.useState<"bank_account" | "promptpay">("bank_account");
  const [paymentAmount, setPaymentAmount] = React.useState<string>("");
  const [evidenceFileName, setEvidenceFileName] = React.useState<string>("");

  const [slipFile, setSlipFile] = React.useState<File | null>(null);
  const [slipPreviewUrl, setSlipPreviewUrl] = React.useState<string | null>(null);
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
      promptpayId?: string;
      qrCodeUrl?: string | null;
      isDefault?: boolean;
    }>
  >([]);

  const defaultAccount = React.useMemo(() => {
    return bankAccounts.find((a) => a.isDefault) || bankAccounts[0] || null;
  }, [bankAccounts]);

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
            promptpayId?: string;
            qrCodeUrl?: string | null;
            isDefault?: boolean;
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
      setNote("");
      setPaymentDate(today);
      setTransferChannel("bank_account");

      // Calculate remaining balance if partial payments exist
      const paidSoFar = (billingCycle?.payments ?? [])
        .filter((p) => p.status === "paid")
        .reduce((sum, p) => sum + Number(p.verifiedAmount || p.amount || 0), 0);
      const remaining = Math.max(0, Number(billingCycle?.amount ?? 0) - paidSoFar);
      setPaymentAmount(
        remaining > 0
          ? remaining.toFixed(2)
          : Number(billingCycle?.amount ?? 0).toFixed(2),
      );
      setEvidenceFileName("");
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [open, billingCycle, today]);

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
    const ext =
      file.name.split(".").pop() ||
      (file.type === "application/pdf" ? "pdf" : "jpg");
    const invoiceNum =
      billingCycle?.invoiceNumber?.replace(/[^a-zA-Z0-9_-]/g, "_") || "INV";
    const generatedName = `SLIP-${invoiceNum}-${Date.now()}.${ext}`;

    // Rename file to follow standard invoice format
    const renamedFile = new File([file], generatedName, { type: file.type });
    setEvidenceFileName(generatedName);
    setSlipFile(renamedFile);

    const reader = new FileReader();
    reader.onload = () => {
      setSlipPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(renamedFile);
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

    let amt: string | undefined;
    if (paymentAmount.trim()) {
      try {
        amt = transferAmount(paymentAmount.trim());
      } catch (err) {
        setErrorMsg((err as Error).message);
        return;
      }
    }

    submitting.current = true;
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const paidAtIso = paymentDate
        ? new Date(`${paymentDate}T12:00:00+07:00`).toISOString()
        : undefined;

      await apiClient.post(`/v1/billing-cycles/${billingCycle.id}/pay`, {
        slipUrl: slipPreviewUrl,
        evidenceKey: evidenceFileName || undefined,
        paidAt: paidAtIso,
        paymentMethod: "bank_transfer",
        transferChannel,
        amount: amt,
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

  const dialogHeader = (
    <DialogHeader className="pb-3">
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
            {billingCycle?.period || "-"} · {billingCycle?.customerName}
            {billingCycle?.invoiceNumber && ` (${billingCycle.invoiceNumber})`}
          </DialogDescription>
        </div>
      </div>
    </DialogHeader>
  );

  const dialogBody = successMsg ? (
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
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        {/* Left Column: Summary & Default Bank Account with QR */}
        <div className="md:col-span-5 space-y-3.5">
          {/* Amount Summary Card */}
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5 space-y-2">
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
            <div className="pt-2 border-t border-border/60 flex justify-between items-baseline">
              <span className="text-xs font-semibold text-foreground">
                {text("ยอดตามใบวางบิล", "Invoice total")}
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

          {/* Default Receiving Account & PromptPay QR Section */}
          <div className="rounded-xl border border-border/80 bg-card p-3.5 space-y-2.5">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-semibold">
              <QrCode className="size-3.5" />
              <span>{text("บัญชีรับชำระเงิน", "Payment account")}</span>
            </div>

            {defaultAccount ? (
              <div className="space-y-2.5">
                <div className="rounded-lg bg-muted/40 p-2.5 text-xs space-y-1">
                  <div className="font-semibold text-foreground text-sm">
                    {defaultAccount.bankName}
                  </div>
                  <div className="text-muted-foreground">
                    {text("เลขที่บัญชี:", "Account number:")}{" "}
                    <span className="font-mono font-bold text-foreground">
                      {defaultAccount.accountNumber}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    {text("ชื่อบัญชี:", "Account name:")}{" "}
                    <span className="text-foreground">{defaultAccount.accountName}</span>
                  </div>
                  {defaultAccount.promptpayId && (
                    <div className="text-muted-foreground">
                      {text("พร้อมเพย์:", "PromptPay:")}{" "}
                      <span className="font-mono text-foreground font-semibold">
                        {defaultAccount.promptpayId}
                      </span>
                    </div>
                  )}
                </div>

                {defaultAccount.qrCodeUrl && (
                  <div className="flex flex-col items-center justify-center pt-1 text-center">
                    <div className="p-2 bg-white rounded-xl border border-border/60 shadow-xs inline-block">
                      <img
                        src={defaultAccount.qrCodeUrl}
                        alt={text("QR Code สำหรับชำระเงิน", "Payment QR Code")}
                        className="size-36 sm:size-40 object-contain rounded-lg"
                      />
                    </div>
                    <span className="text-[11px] text-muted-foreground mt-1.5">
                      {text("สแกน QR Code เพื่อชำระเงิน", "Scan QR code to pay")}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-4 text-center text-xs text-muted-foreground">
                {text(
                  "ยังไม่ได้ตั้งค่าบัญชีรับชำระ กรุณาติดต่อผู้ดูแล",
                  "Payment accounts unavailable. Contact an administrator.",
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Payment Form Fields & Slip Upload */}
        <div className="md:col-span-7 space-y-3.5">
          {/* Payment Details Form: Date & Method */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Payment Date with Shadcn DatePicker */}
            <div className="space-y-1.5">
              <Label htmlFor="payment-date" className="text-xs font-semibold">
                {text("วันที่ชำระเงิน", "Payment date")}{" "}
                <span className="text-destructive">*</span>
              </Label>
              <DatePicker
                id="payment-date"
                value={paymentDate}
                onChange={(d) => setPaymentDate(d)}
                max={today}
                required
                className="text-base md:text-sm h-10 w-full"
                aria-label={text("วันที่ชำระเงิน", "Payment date")}
              />
            </div>

            {/* Payment Method */}
            <div className="space-y-1.5">
              <Label htmlFor="payment-method-select" className="text-xs font-semibold">
                {text("ช่องทางการโอน", "Transfer channel")}{" "}
                <span className="text-destructive">*</span>
              </Label>
              <ChoiceSelect
                id="payment-method-select"
                value={transferChannel}
                onChange={(e) =>
                  setTransferChannel(
                    e.target.value as "bank_account" | "promptpay",
                  )
                }
                className="text-base md:text-sm h-10 w-full"
              >
                <option value="bank_account">
                  {text("โอนเงินผ่านธนาคาร", "Bank transfer")}
                </option>
                <option value="promptpay">
                  {text("พร้อมเพย์", "PromptPay")}
                </option>
              </ChoiceSelect>
            </div>
          </div>

          {/* Payment Amount */}
          <div className="space-y-1.5">
            <Label htmlFor="payment-amount" className="text-xs font-semibold">
              {text("จำนวนเงินที่ชำระ (บาท)", "Payment amount (THB)")}{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="payment-amount"
              type="text"
              inputMode="decimal"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              required
              className="text-base md:text-sm h-10 font-mono font-medium"
              placeholder={amount.toFixed(2)}
            />
            <span className="text-[11px] text-muted-foreground block">
              {text(
                "กรณีจ่ายบางส่วน สามารถระบุยอดที่โอนจริงเพื่อออกใบเสร็จตามยอดนี้ได้",
                "For partial payment, enter the transfer amount to issue an installment receipt",
              )}
            </span>
          </div>

          {/* Slip Upload & Transfer Information */}
          <div className="space-y-2">
            <Label htmlFor="slip-upload" className="text-xs font-semibold">
              {text("แนบสลิปหลักฐานการโอน", "Attach transfer proof")}{" "}
              <span className="text-destructive">*</span>
            </Label>

            <div className="relative border-2 border-dashed border-border/80 hover:border-primary/60 rounded-xl p-3 text-center transition-colors cursor-pointer bg-muted/20">
              <Input
                id="slip-upload"
                type="file"
                accept="image/*,application/pdf"
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full text-base md:text-sm"
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
                      <FileText className="size-6 text-emerald-600 dark:text-emerald-400" />
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <span className="text-xs font-semibold text-foreground truncate block font-mono">
                      {evidenceFileName || slipFile?.name || text("สลิปการโอนเงิน", "Transfer receipt")}
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

          {slipFile?.type === "application/pdf" && slipPreviewUrl && (
            <iframe
              title={text("ตัวอย่างหลักฐาน PDF", "PDF evidence preview")}
              src={slipPreviewUrl}
              className="w-full h-72 border rounded-lg"
            />
          )}

          <div className="space-y-1.5">
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
              className="text-base md:text-sm h-10"
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

      <DialogFooter className="pt-3 flex flex-col sm:flex-row gap-2 border-t border-border/50">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isSubmitting}
          className="w-full sm:w-auto h-10 text-base md:text-sm"
        >
          {text("ยกเลิก", "Cancel")}
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || !canSubmit}
          className="w-full sm:w-auto h-10 text-base md:text-sm bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
        >
          {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
          {text("ยืนยันการชำระเงิน", "Submit payment evidence")}
        </Button>
      </DialogFooter>
    </form>
  );

  if (inline) {
    return (
      <Dialog open={true}>
        <section className="sm:max-w-2xl lg:max-w-3xl max-h-[92vh] overflow-y-auto p-5 sm:p-6 rounded-2xl">
          {dialogHeader}
          {dialogBody}
        </section>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl lg:max-w-3xl max-h-[92vh] overflow-y-auto p-5 sm:p-6 rounded-2xl">
        {dialogHeader}
        {dialogBody}
      </DialogContent>
    </Dialog>
  );
}
