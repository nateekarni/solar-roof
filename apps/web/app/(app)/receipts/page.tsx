import { getSessionUser } from '../../../lib/session-user';
import { OperationPage } from "../../../features/shared/operation-page";
import type { OperationSearchParams } from '../../../features/shared/operation-request-query';

export const dynamic = "force-dynamic";

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<OperationSearchParams>;
}) {
  const user = await getSessionUser();
  const isCustomer = user.role === 'customer_user';
  return (
    <OperationPage
      resource="receipts"
      eyebrow="RECEIPTS & TAX INVOICES"
      title="ใบเสร็จรับเงิน"
      description={
        isCustomer
          ? "รายการใบเสร็จรับเงินและใบกำกับภาษีสำหรับรอบบิลที่ชำระเงินเรียบร้อยแล้ว"
          : "รายการใบเสร็จรับเงินและใบกำกับภาษีที่ออกอัตโนมัติเมื่อสถานะบิลเป็นชำระแล้ว"
      }
      action=""
      searchParams={searchParams}
    />
  );
}
