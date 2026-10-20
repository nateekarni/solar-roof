import type {
  Capabilities,
  CustomerBillingStatus,
  PaymentTransferRow,
} from "@solar/api-contracts";
export type CustomerRecord = Record<string, unknown>;
export const recordText = (row: CustomerRecord, key: string): string | null =>
  typeof row[key] === "string" ? row[key] : null;
export function customerRecordStatus(
  row: CustomerRecord,
): CustomerBillingStatus | null {
  const status = recordText(row, "billingStatusView");
  return status &&
    [
      "awaiting_payment",
      "pending_verification",
      "partially_paid",
      "paid",
      "overdue",
      "unsuccessful",
    ].includes(status)
    ? (status as CustomerBillingStatus)
    : null;
}
export function customerRecordCanPay(
  row: CustomerRecord,
  capabilities: Capabilities | null,
): boolean {
  const outstanding = recordText(row, "outstandingAmount");
  return Boolean(
    capabilities?.operationsActions?.includes("submit_payment") &&
    ["awaiting_payment", "partially_paid", "overdue"].includes(
      customerRecordStatus(row) ?? "",
    ) &&
    recordText(row, "invoiceId") &&
    row.pendingEvidenceCount === 0 &&
    outstanding &&
    /^\d+(\.\d+)?$/.test(outstanding) &&
    /[1-9]/.test(outstanding),
  );
}
export type CustomerRecordDocument = {
  id: string;
  kind: "statement" | "evidence" | "receipt";
  number: string | null;
  date: string | null;
  documentId?: string;
  payment?: PaymentTransferRow;
};
export function customerRecordDocuments(
  row: CustomerRecord,
): CustomerRecordDocument[] {
  const docs: CustomerRecordDocument[] = [];
  const invoice = recordText(row, "invoiceId"),
    receipt = recordText(row, "receiptId");
  if (invoice)
    docs.push({
      id: "invoice",
      kind: "statement",
      number: recordText(row, "invoiceNumber"),
      date: recordText(row, "issueDate"),
      documentId: invoice,
    });
  const payments = Array.isArray(row.payments)
    ? row.payments.filter(
        (p): p is PaymentTransferRow =>
          !!p && typeof p.id === "string" && typeof p.status === "string",
      )
    : [];
  for (const payment of payments)
    docs.push({
      id: `payment:${payment.id}`,
      kind: "evidence",
      number: null,
      date: payment.submittedAt ?? null,
      payment,
    });
  if (Array.isArray(row.receipts)) {
    const seen = new Set<string>();
    for (const value of row.receipts) {
      if (!value || typeof value.id !== "string" || seen.has(value.id))
        continue;
      seen.add(value.id);
      docs.push({
        id: `receipt:${value.id}`,
        kind: "receipt",
        number:
          typeof value.documentNumber === "string"
            ? value.documentNumber
            : null,
        date: typeof value.issueDate === "string" ? value.issueDate : null,
        documentId: value.id,
      });
    }
  } else if (receipt)
    docs.push({
      id: "receipt",
      kind: "receipt",
      number: recordText(row, "receiptNumber"),
      date: recordText(row, "receiptIssueDate"),
      documentId: receipt,
    });
  const timestamp = (doc: CustomerRecordDocument) => {
    const value = doc.date
      ? Date.parse(
          doc.date.length === 10 ? `${doc.date}T00:00:00+07:00` : doc.date,
        )
      : NaN;
    return Number.isFinite(value)
      ? value
      : doc.kind === "statement"
        ? -Infinity
        : Infinity;
  };
  return docs.sort(
    (a, b) => timestamp(a) - timestamp(b) || a.id.localeCompare(b.id),
  );
}
