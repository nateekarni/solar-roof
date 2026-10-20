"use client";
import * as React from "react";
import { createTranslator, type Locale } from "@solar/i18n";
import { apiClient } from "../../../lib/api-client";
import {
  verifiedOriginalPdf,
  originalDocumentReference,
} from "../../shared/original-document-loader";
import { InlinePdfCanvas } from "../../shared/inline-pdf-canvas";
import type { CustomerRecordDocument } from "./customer-record-model";
import {
  createCustomerDocumentBlobUrl,
  revokeCustomerDocumentBlobUrl,
  safeCustomerDocumentUrl,
  customerEvidenceBlob,
} from "./customer-document-url";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
type PreviewKind = "image" | "pdf" | "unavailable";
export function CustomerDocumentContent({
  url,
  kind,
  title,
  locale,
}: {
  url: string;
  kind: PreviewKind;
  title: string;
  locale: Locale;
}) {
  const t = createTranslator(locale),
    [failed, setFailed] = React.useState(false);
  const safeUrl = safeCustomerDocumentUrl(url);
  return (
    <div className="min-h-0 space-y-4 overflow-y-auto">
      {safeUrl && (
        <Button asChild variant="outline" className="min-h-[2.75rem]">
          <a
            href={safeUrl}
            download={kind === "pdf" ? `${title}.pdf` : true}
          >
            {t("customerPortal.record.download")}
          </a>
        </Button>
      )}
      {!safeUrl || kind === "unavailable" || failed ? (
        <p role="alert">
          {t(
            safeUrl
              ? "customerPortal.record.previewUnavailable"
              : "customerPortal.record.fileUnavailable",
          )}
        </p>
      ) : kind === "pdf" ? (
        <InlinePdfCanvas url={safeUrl} title={title} locale={locale} />
      ) : (
        <img
          src={safeUrl}
          alt={title}
          className="mx-auto max-h-[75dvh] max-w-full object-contain"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
export async function loadCustomerDocument(
  doc: CustomerRecordDocument,
): Promise<{ url: string; kind: PreviewKind; revoke: boolean }> {
  if (doc.documentId) {
    const reference = await originalDocumentReference(
      {
        type: doc.kind === "statement" ? "invoice" : "receipt",
        documentId: doc.documentId,
      },
      apiClient.get,
    );
    const blob = await verifiedOriginalPdf(
      reference.id,
      reference.hash,
      apiClient.getBlob,
    );
    return {
      url: createCustomerDocumentBlobUrl(blob),
      kind: "pdf",
      revoke: true,
    };
  }
  const value = doc.payment?.slipUrl ?? "";
  const blob = customerEvidenceBlob(value);
  if (blob)
    return {
      url: createCustomerDocumentBlobUrl(blob),
      kind: blob.type === "application/pdf" ? "pdf" : "image",
      revoke: true,
    };
  const url = safeCustomerDocumentUrl(value) ?? "";
  const kind: PreviewKind = /\.pdf(?:$|\?)/i.test(url)
    ? "pdf"
    : /\.(png|jpe?g)(?:$|\?)/i.test(url)
      ? "image"
      : "unavailable";
  return { url, kind, revoke: false };
}
export function CustomerDocumentViewer({
  document: doc,
  locale,
  onClose,
  returnFocusRef,
}: {
  document: CustomerRecordDocument | null;
  locale: Locale;
  onClose: () => void;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const t = createTranslator(locale),
    [preview, setPreview] = React.useState<{
      url: string;
      kind: PreviewKind;
    } | null>(null),
    [error, setError] = React.useState(false);
  React.useEffect(() => {
    if (!doc) return;
    let active = true,
      objectUrl = "";
    setPreview(null);
    setError(false);
    void loadCustomerDocument(doc)
      .then((result) => {
        if (result.revoke) objectUrl = result.url;
        if (active) setPreview(result);
        else if (objectUrl) revokeCustomerDocumentBlobUrl(objectUrl);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      if (objectUrl) revokeCustomerDocumentBlobUrl(objectUrl);
    };
  }, [doc]);
  const title =
    doc?.number ?? t(`customerPortal.record.${doc?.kind ?? "preview"}`);
  return (
    <Dialog
      open={doc !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
        <DialogContent
          showCloseButton={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
          className="customer-portal fixed inset-0! flex min-w-0 flex-col gap-4 overflow-y-auto bg-background p-5! text-foreground outline-none max-sm:max-h-none! max-sm:rounded-none! sm:max-w-none! md:inset-auto! md:left-1/2! md:top-1/2! md:max-h-[92dvh]! md:w-[calc(100%-4rem)]! md:max-w-5xl! md:-translate-x-1/2! md:-translate-y-1/2! md:rounded-3xl! md:p-8!"
        >
          <div className="flex items-start justify-between gap-4">
            <DialogTitle className="break-words text-lg font-semibold [&>[data-slot=dialog-title-icon]]:hidden">
              {title}
            </DialogTitle>
            <DialogClose asChild>
              <Button variant="outline" className="min-h-[2.75rem]">{t("customerPortal.common.close")}</Button>
            </DialogClose>
          </div>
          <DialogDescription className="sr-only">
            {t("customerPortal.record.preview")}
          </DialogDescription>
          {error ? (
            <CustomerDocumentContent
              url=""
              kind="unavailable"
              title={title}
              locale={locale}
            />
          ) : preview ? (
            <CustomerDocumentContent
              key={preview.url}
              {...preview}
              title={title}
              locale={locale}
            />
          ) : (
            <p role="status">{t("customerPortal.common.loading")}</p>
          )}
        </DialogContent>
    </Dialog>
  );
}
