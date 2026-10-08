export interface OrganizationDocument {
  id: string;
  contractId?: string | null;
  siteId?: string;
  status?: string;
  paymentStatus?: string;
  period?: string;
  issueDate?: string;
  amount?: string | number | null;
  siteName?: string;
  invoiceNumber?: string | null;
  receiptNumber?: string;
  documentId?: string;
}
export function outstandingInvoices<T extends OrganizationDocument>(
  rows: T[],
): T[] {
  return rows.filter(
    (row) =>
      !["paid", "draft", "cancelled"].includes(row.status ?? "") &&
      row.paymentStatus !== "paid",
  );
}
export function documentsForContract<T extends OrganizationDocument>(
  rows: T[],
  contractId: string | null,
): T[] {
  return rows.filter((row) =>
    contractId ? row.contractId === contractId : !row.contractId,
  );
}
export function filterDocuments<T extends OrganizationDocument>(
  rows: T[],
  month: string,
  status: string,
): T[] {
  return rows.filter(
    (row) =>
      (!month || (row.period || row.issueDate || "").slice(0, 7) === month) &&
      (!status || row.status === status || row.paymentStatus === status),
  );
}
