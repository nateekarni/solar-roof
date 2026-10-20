import { Trash2, Upload } from "lucide-react";
import { createTranslator, type Locale } from "@solar/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PaymentDraft } from "./customer-payment-model";
import { InlinePdfCanvas } from "../../shared/inline-pdf-canvas";
export const paymentControl =
  "min-h-11 rounded-xl border border-border px-4 py-2 text-base focus-visible:outline-2 focus-visible:outline-ring";
export function CustomerEvidencePicker({
  draft,
  onFile,
  locale,
  error,
}: {
  draft: PaymentDraft;
  onFile: (file: File | null) => void;
  locale: Locale;
  error?: string | undefined;
}) {
  const t = createTranslator(locale);
  return (
    <div data-customer-evidence-picker="true" className="flex flex-col gap-2">
      {!draft.evidence && (
        <label
          data-testid="evidence-dropzone"
          htmlFor="customer-evidence"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (file) onFile(file);
          }}
          className="flex min-h-28 cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-border p-4 transition-colors hover:bg-muted/50 focus-within:border-ring"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
            <Upload className="size-5" aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="font-semibold">
              {t("customerPortal.payment.evidence")}
            </span>
            <span className="text-sm text-muted-foreground md:hidden">
              {t("customerPortal.payment.chooseFile")}
            </span>
            <span className="hidden text-sm text-muted-foreground md:block">
              {t("customerPortal.payment.dropFile")}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("customerPortal.payment.allowedFiles")}
            </span>
          </span>
        </label>
      )}
      <Input
        id="customer-evidence"
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        capture="environment"
        aria-invalid={Boolean(error)}
        aria-describedby={`customer-evidence-help${error ? " customer-evidence-error" : ""}`}
        aria-label={t(
          draft.evidence
            ? "customerPortal.payment.replace"
            : "customerPortal.payment.chooseFile",
        )}
        hidden
        className="pointer-events-none absolute opacity-0"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = "";
        }}
      />
      <span id="customer-evidence-help" className="sr-only">
        {t("customerPortal.payment.allowedFiles")}
      </span>
      {error && (
        <p id="customer-evidence-error" className="text-sm text-destructive">
          {t(error)}
        </p>
      )}
      {draft.evidence && (
        <div
          data-testid="evidence-preview"
          className="relative rounded-2xl border border-border p-4 pr-16"
        >
          <label
            htmlFor="customer-evidence"
            className="flex cursor-pointer flex-col gap-3"
          >
            <span className="break-all text-sm font-medium">
              {draft.evidence.name}
            </span>
            {draft.slipUrl &&
              (draft.evidence.type === "application/pdf" ? (
                <InlinePdfCanvas
                  url={draft.slipUrl}
                  title={t("customerPortal.payment.evidence")}
                  locale={locale}
                />
              ) : (
                <img
                  alt={t("customerPortal.payment.evidence")}
                  src={draft.slipUrl}
                  className="mx-auto max-h-44 max-w-full object-contain"
                />
              ))}
          </label>
          <Button
            type="button"
            variant="destructive"
            aria-label={t("customerPortal.payment.remove")}
            title={t("customerPortal.payment.remove")}
            className="absolute right-2 top-2 size-11! p-0!"
            onClick={() => onFile(null)}
          >
            <Trash2 data-icon="inline-start" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
