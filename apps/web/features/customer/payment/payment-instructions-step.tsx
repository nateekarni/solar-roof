import * as React from "react";
import { Check, Copy, Download } from "lucide-react";
import {
  buildPromptPayPayload,
  type CustomerPaymentInstructions,
} from "@solar/api-contracts";
import { createTranslator, type Locale } from "@solar/i18n";
import { Button } from "@/components/ui/button";
import {
  resolveCustomerQrImage,
  renderPromptPayQrDataUrl,
  type ResolvedCustomerQr,
} from "./customer-payment-qr";
export function PaymentInstructionsStep({
  instructions,
  amount,
  locale,
}: {
  instructions: CustomerPaymentInstructions;
  amount: string;
  locale: Locale;
}) {
  const t = createTranslator(locale),
    [copied, setCopied] = React.useState(false);
  const copiedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const qrSource = instructions.qrCodeUrl ?? "";
  const [amountQr,setAmountQr]=React.useState<string|null>(null);
  const [resolvedQr, setResolvedQr] = React.useState<{
    source: string;
    url: string;
  } | null>(null);
  React.useEffect(() => {
    let active = true;
    let owned: ResolvedCustomerQr | null = null;
    setResolvedQr(null);
    void resolveCustomerQrImage(qrSource).then((result) => {
      if (!active) {
        result?.dispose();
        return;
      }
      owned = result;
      setResolvedQr(result ? { source: qrSource, url: result.url } : null);
    });
    return () => {
      active = false;
      owned?.dispose();
    };
  }, [qrSource]);
  React.useEffect(()=>{
    let active=true;
    setAmountQr(null);
    if(!instructions.promptpayId)return ()=>{active=false;};
    try{
      const payload=buildPromptPayPayload(instructions.promptpayId,amount);
      void renderPromptPayQrDataUrl(payload).then((url)=>{if(active)setAmountQr(url);}).catch(()=>{if(active)setAmountQr(null);});
    }catch{/* Invalid/unknown amount keeps bank details and configured fallback available. */}
    return ()=>{active=false;};
  },[amount,instructions.promptpayId]);
  React.useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );
  const fallbackQr = resolvedQr?.source === qrSource ? resolvedQr.url : null;
  const qr=amountQr??fallbackQr;
  const usingFallback=Boolean(qr&&!amountQr);
  return (
    <section
      aria-labelledby="customer-payment-channel-title"
      className="min-w-0 rounded-2xl border border-border bg-[var(--customer-surface-elevated)] p-4"
    >
      <h2 id="customer-payment-channel-title" className="font-semibold">
        {t("customerPortal.payment.channel")}
      </h2>
      <div className={`mt-3 grid min-w-0 gap-4 ${qr ? "grid-cols-[minmax(0,1fr)_6rem]" : "grid-cols-1"}`}>
        <div className="min-w-0 space-y-2">
          {instructions.bankName && (
            <p className="font-medium">{instructions.bankName}</p>
          )}
          {instructions.accountName && (
            <p className="text-sm text-muted-foreground">{instructions.accountName}</p>
          )}
          {instructions.accountNumber && (
            <div className="flex min-w-0 items-center gap-2">
              <p className="min-w-0 flex-1 break-all text-lg font-semibold tabular-nums">
                {instructions.accountNumber}
              </p>
              <Button
                type="button"
                variant="outline"
                className="size-11! shrink-0 p-0!"
                aria-label={t(
                  copied
                    ? "customerPortal.payment.copied"
                    : "customerPortal.payment.copy",
                )}
                title={t(
                  copied
                    ? "customerPortal.payment.copied"
                    : "customerPortal.payment.copy",
                )}
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(instructions.accountNumber!)
                    .then(() => {
                      if (copiedTimer.current) clearTimeout(copiedTimer.current);
                      setCopied(true);
                      copiedTimer.current = setTimeout(() => {
                        setCopied(false);
                        copiedTimer.current = null;
                      }, 1600);
                    })
                    .catch(() => {
                      if (copiedTimer.current) clearTimeout(copiedTimer.current);
                      copiedTimer.current = null;
                      setCopied(false);
                    });
                }}
              >
                <span className="relative size-4" aria-hidden="true">
                  <Copy
                    className={`absolute inset-0 size-4 transition-[opacity,transform] duration-200 ${copied ? "scale-75 opacity-0" : "scale-100 opacity-100"}`}
                  />
                  <Check
                    className={`absolute inset-0 size-4 transition-[opacity,transform] duration-200 ${copied ? "scale-100 opacity-100" : "scale-75 opacity-0"}`}
                  />
                </span>
              </Button>
            </div>
          )}
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {instructions.branchName && (
              <div className="flex gap-1">
                <dt>{t("customerPortal.payment.branch")}:</dt>
                <dd>{instructions.branchName}</dd>
              </div>
            )}
            {instructions.promptpayId && (
              <div className="flex gap-1">
                <dt>{t("customerPortal.payment.promptpay")}:</dt>
                <dd className="break-all">{instructions.promptpayId}</dd>
              </div>
            )}
          </dl>
        </div>
        {qr && (
          <div className="rounded-xl bg-white p-2 text-center text-neutral-950">
            <img
              src={qr}
              alt={t("customerPortal.payment.qrAlt")}
              className="aspect-square w-full object-contain"
            />
            {usingFallback&&<p className="mt-1 text-[11px] text-neutral-600">{t("customerPortal.payment.qrFallback")}</p>}
            <a
              href={qr}
              download="payment-qr.png"
              aria-label={t("customerPortal.payment.saveQr")}
              title={t("customerPortal.payment.saveQr")}
              className="mt-1 inline-grid size-11 place-items-center rounded-lg border border-neutral-300 text-neutral-950"
            >
              <Download className="size-4" aria-hidden="true" />
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
