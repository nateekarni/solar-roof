import type {
  BillingRow,
  Capabilities,
  BillingStatusView,
  OperationPage,
  OperationQuery,
} from "@solar/api-contracts";
import { apiClient } from "../../../lib/api-client";
import {
  billingStatusViewFromQuery,
  patchOperationQuery,
} from "../../shared/operation-request-query";

export const customerDocumentViews = [
  "all",
  "awaiting_payment",
  "pending_verification",
  "partially_paid",
  "overdue",
  "paid",
] as const;
export type CustomerDocumentView = (typeof customerDocumentViews)[number];
export type CustomerDocumentsData = OperationPage<BillingRow>;
export function customerDocumentView(
  query: URLSearchParams,
): CustomerDocumentView {
  let value = query.get("billingStatusView");
  if (value === null) {
    value =
      query.get("collectionStatus") === "partially_paid"
        ? "partially_paid"
        : billingStatusViewFromQuery(query);
    if (value === "all" && query.get("status") === "partially_paid")
      value = "partially_paid";
  }
  return customerDocumentViews.includes(value as CustomerDocumentView)
    ? (value as CustomerDocumentView)
    : "all";
}
export function customerDocumentsQuery(
  current: URLSearchParams,
): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, value] of current)
    if (
      [
        "search",
        "from",
        "to",
        "sort",
        "direction",
        "limit",
        "cursor",
        "billingStatusView",
      ].includes(key)
    )
      query.set(key, value);
  if (
    current.has("billingStatusView") ||
    current.has("status") ||
    current.has("collectionStatus")
  )
    query.set("billingStatusView", customerDocumentView(current));
  return query;
}
export function patchCustomerDocumentsQuery(
  current: URLSearchParams,
  patch: Partial<OperationQuery>,
) {
  return customerDocumentsQuery(patchOperationQuery(current, patch));
}
export function loadCustomerDocuments(
  query: URLSearchParams,
  signal?: AbortSignal,
): Promise<CustomerDocumentsData> {
  return apiClient.get<CustomerDocumentsData>(
    `/v1/operations/billing?${customerDocumentsQuery(query)}`,
    { cache: "no-store", ...(signal && { signal }) },
  );
}
export function loadCustomerDocumentCapabilities(
  signal?: AbortSignal,
): Promise<Capabilities> {
  return apiClient.get<Capabilities>("/v1/auth/capabilities", {
    cache: "no-store",
    ...(signal && { signal }),
  });
}
export function appendCustomerDocuments(
  current: CustomerDocumentsData,
  next: CustomerDocumentsData,
): CustomerDocumentsData {
  const rows = new Map(current.rows.map((row) => [row.id, row]));
  for (const row of next.rows) rows.set(row.id, row);
  return { ...next, rows: [...rows.values()] };
}
export const customerDocumentStatusKeys: Record<
  Exclude<BillingStatusView, "pending_issue_approval" | "unsuccessful">,
  string
> = {
  all: "all",
  awaiting_payment: "awaitingPayment",
  pending_verification: "pendingVerification",
  partially_paid: "partiallyPaid",
  overdue: "overdue",
  paid: "paid",
};
