import { OperationPage } from "../../../features/shared/operation-page";

export const dynamic = "force-dynamic";

export default function ReceiptsPage() {
  return (
    <OperationPage
      resource="receipts"
      eyebrow="RECEIPTS & TAX INVOICES"
      title="ใบเสร็จรับเงิน / ใบกำกับภาษี"
      description="รายการใบเสร็จรับเงินและใบกำกับภาษีที่ออกอัตโนมัติเมื่อสถานะบิลเป็นชำระแล้ว"
    />
  );
}
