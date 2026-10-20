import { createTranslator, type Locale } from "@solar/i18n";
import { formatDate, formatMoney } from "../home/customer-home-format";
import type { CustomerRecordDocument } from "./customer-record-model";
import { Button } from "@/components/ui/button";
export function CustomerDocumentTimeline({
  documents,
  locale,
  onPreview,
}: {
  documents: CustomerRecordDocument[];
  locale: Locale;
  onPreview: (
    document: CustomerRecordDocument,
    trigger: HTMLButtonElement,
  ) => void;
}) {
  const t = createTranslator(locale);
  const statuses: Record<string, string> = {
    pending_verification: "pendingVerification",
    paid: "paid",
    rejected: "rejected",
  };
  return (
    <section
      className="customer-card min-w-0 rounded-3xl border border-border bg-[var(--customer-surface-elevated)] p-6"
      aria-label={t("customerPortal.record.timeline")}
    >
      <h2 className="text-lg font-semibold">
        {t("customerPortal.record.timeline")}
      </h2>
      <ol className="mt-5 space-y-4">
        {documents.map((doc) => (
          <li
            key={doc.id}
            data-document-id={doc.id}
            className="min-w-0 space-y-2 border-l-2 border-border pl-4"
          >
            <h3 className="break-words font-medium">
              {t(`customerPortal.record.${doc.kind}`)}
              {doc.number && ` · ${doc.number}`}
            </h3>
            {doc.date && (
              <p className="text-sm text-muted-foreground">
                {formatDate(doc.date, locale)}
              </p>
            )}
            {doc.payment && (
              <>
                <p className="font-medium">
                  {t(
                    statuses[doc.payment.status]
                      ? `customerPortal.status.${statuses[doc.payment.status]}`
                      : "customerPortal.common.unknown",
                  )}
                </p>
                <p className="break-all tabular-nums">
                  {formatMoney(
                    doc.payment.verifiedAmount ??
                      doc.payment.declaredAmount ??
                      doc.payment.amount ??
                      null,
                    locale,
                  )}{" "}
                  {t("customerPortal.common.baht")}
                </p>
                {doc.payment.rejectionReason && (
                  <p className="break-words text-destructive">
                    {t("customerPortal.record.rejectedReason")}:{" "}
                    {doc.payment.rejectionReason}
                  </p>
                )}
              </>
            )}
            <Button
              type="button"
              variant="link"
              className="h-11!"
              onClick={(event) => onPreview(doc, event.currentTarget)}
            >
              {t("customerPortal.record.preview")}
            </Button>
          </li>
        ))}
      </ol>
      {documents.length === 0 && (
        <p className="mt-4 text-muted-foreground">
          {t("customerPortal.record.noDocuments")}
        </p>
      )}
    </section>
  );
}
