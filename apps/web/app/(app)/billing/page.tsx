import { getSessionUser } from "../../../lib/session-user";
import { OperationPage } from "../../../features/shared/operation-page";
import type { OperationSearchParams } from "../../../features/shared/operation-request-query";
import { operationRequestQueries } from "../../../features/shared/operation-request-query";
import { cookies } from "next/headers";
import type { Locale } from "@solar/i18n";
import { CustomerDocumentsPage } from "../../../features/customer/documents/customer-documents-page";
import { loadCustomerDocumentsServer } from "../../../features/customer/documents/customer-documents-server-api";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<OperationSearchParams>;
}) {
  const user = await getSessionUser();
  if (user.role === "customer_user") {
    const query = operationRequestQueries(await searchParams).rows;
    const [{ initial, capabilities }, cookieStore] = await Promise.all([
      loadCustomerDocumentsServer(new URLSearchParams(query)),
      cookies(),
    ]);
    const locale: Locale =
      cookieStore.get("locale")?.value === "en" ? "en" : "th";
    return (
      <CustomerDocumentsPage
        initial={initial}
        initialQuery={query}
        capabilities={capabilities}
        locale={locale}
      />
    );
  }
  return (
    <OperationPage
      resource="billing"
      eyebrow="BILLING & INVOICES"
      title="ใบวางบิล"
      description="ตรวจสอบและจัดการใบวางบิล รอบการเรียกเก็บเงิน ตรวจหลักฐานสลิป และติดตามสถานะการชำระเงิน"
      action="สร้างใบวางบิล"
      searchParams={searchParams}
    />
  );
}
