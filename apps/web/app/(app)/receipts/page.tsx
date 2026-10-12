import { OrganizationDocuments } from '../../../features/organization/organization-documents';
import { getSessionUser } from '../../../lib/session-user';
import { OperationPage } from "../../../features/shared/operation-page";

export const dynamic = "force-dynamic";

export default async function ReceiptsPage() {
  const user=await getSessionUser(); if(user.role === "customer_user") return <OrganizationDocuments kind="receipt"/>;
  return (
    <OperationPage
      resource="receipts"
      eyebrow="RECEIPTS & TAX INVOICES"
      title="ใบเสร็จรับเงิน"
      description="รายการใบเสร็จรับเงินและใบกำกับภาษีที่ออกอัตโนมัติเมื่อสถานะบิลเป็นชำระแล้ว"
      action=""
    />
  );
}
