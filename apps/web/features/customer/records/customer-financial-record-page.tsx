"use client";
import * as React from "react";
import type { Capabilities } from "@solar/api-contracts";
import { createTranslator, type Locale } from "@solar/i18n";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "../../../providers/locale-provider";
import { formatDecimal, formatMoney } from "../home/customer-home-format";
import { CustomerRecordStatusHeader } from "./customer-record-status-header";
import { CustomerDocumentTimeline } from "./customer-document-timeline";
import { CustomerDocumentViewer } from "./customer-document-viewer";
import { CustomerPaymentFlow } from "../payment/customer-payment-flow";
import {
  customerRecordCanPay,
  customerRecordDocuments,
  recordText,
  type CustomerRecord,
  type CustomerRecordDocument,
} from "./customer-record-model";
export function CustomerFinancialRecordPage({
  row,
  locale: initialLocale,
  capabilities,
}: {
  row: CustomerRecord;
  locale: Locale;
  capabilities: Capabilities | null;
}) {
  const locale = useLocale(initialLocale);
  const t = createTranslator(locale),
    documents = customerRecordDocuments(row),
    [selected, setSelected] = React.useState<CustomerRecordDocument | null>(
      null,
    ),
    trigger = React.useRef<HTMLButtonElement | null>(null);
  const openedDocument = React.useRef<string | null>(null);
  const canPay = customerRecordCanPay(row, capabilities),
    href = `/records/billing/${encodeURIComponent(recordText(row, "id") ?? "")}?payment=1`;
  const [paymentOpen, setPaymentOpen] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const paymentTrigger = React.useRef<HTMLAnchorElement | null>(null);
  React.useEffect(() => {
    if (
      canPay &&
      new URLSearchParams(window.location.search).get("payment") === "1"
    ) {
      setPaymentOpen(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("payment");
      window.history.replaceState(window.history.state, "", url);
    }
  }, [canPay]);
  React.useEffect(() => {
    const documentId = new URLSearchParams(window.location.search).get("document");
    if (!documentId || openedDocument.current === documentId) return;
    openedDocument.current = documentId;
    const requested = documents.find((document) => document.documentId === documentId);
    if (requested) setSelected(requested);
  }, [documents]);
  const fields = [
    ["consumedEnergy", "consumedKwh", "kwh"],
    ["rate", "rate", "baht"],
    ["subtotal", "subtotal", "baht"],
    ["tax", "simulatedTax", "baht"],
    ["total", "amount", "baht"],
  ] as const;
  return (
    <div className="min-w-0 space-y-6">
      <Button asChild variant="outline" className="min-h-11 bg-background">
        <a href="/billing">
          <ArrowLeft className="size-4" />
          {t("customerPortal.record.backToDocuments")}
        </a>
      </Button>
      <CustomerRecordStatusHeader row={row} locale={locale} />
      <div className="grid min-w-0 items-start gap-6 md:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <section className="customer-card rounded-3xl border border-border bg-[var(--customer-surface-elevated)] p-6">
            <h2 className="text-lg font-semibold">
              {t("customerPortal.home.breakdown")}
            </h2>
            <dl className="mt-4 divide-y divide-border">
              {fields.map(([label, key, unit]) => (
                <div
                  key={key}
                  className="flex flex-wrap justify-between gap-3 py-3"
                >
                  <dt className="text-sm text-muted-foreground">
                    {t(`customerPortal.home.${label}`)}
                  </dt>
                  <dd className="break-all text-right tabular-nums">
                    {unit === "baht"
                      ? formatMoney(recordText(row, key), locale)
                      : formatDecimal(recordText(row, key), locale)}{" "}
                    {recordText(row, key) !== null &&
                      t(`customerPortal.common.${unit}`)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          {capabilities === null && (
            <p role="status">
              {t("customerPortal.billing.actionsUnavailable")}
            </p>
          )}
          {canPay && (
            <a
              ref={paymentTrigger}
              href={submitted ? href.replace("?payment=1", "") : href}
              onClick={(event) => {
                if (!submitted) {
                  event.preventDefault();
                  setPaymentOpen(true);
                }
              }}
              className="customer-primary-action flex min-h-11 items-center justify-center rounded-xl bg-[var(--customer-action-primary)] px-5 py-3 font-semibold"
            >
              {t(
                submitted
                  ? "customerPortal.payment.viewRecord"
                  : Number(row.rejectedEvidenceCount) > 0
                    ? "customerPortal.record.resubmit"
                    : "customerPortal.home.pay",
              )}
            </a>
          )}
        </div>
        <CustomerDocumentTimeline
          documents={documents}
          locale={locale}
          onPreview={(doc, button) => {
            trigger.current = button;
            setSelected(doc);
          }}
        />
      </div>
      <CustomerDocumentViewer
        document={selected}
        locale={locale}
        onClose={() => {
          setSelected(null);
          const url = new URL(window.location.href);
          if (url.searchParams.has("document")) {
            url.searchParams.delete("document");
            window.history.replaceState(window.history.state, "", url);
          }
        }}
        returnFocusRef={trigger}
      />
      <CustomerPaymentFlow
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        billingCycle={{
          id: recordText(row, "id") ?? "",
          outstandingAmount: recordText(row, "outstandingAmount") ?? "",
          invoiceNumber: recordText(row, "invoiceNumber"),
        }}
        locale={locale}
        canSubmit={canPay}
        onSuccess={() => setSubmitted(true)}
        returnFocusRef={paymentTrigger}
      />
    </div>
  );
}
