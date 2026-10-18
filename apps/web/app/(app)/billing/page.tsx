import { getSessionUser } from '../../../lib/session-user';
import { OperationPage } from '../../../features/shared/operation-page';
import type { OperationSearchParams } from '../../../features/shared/operation-request-query';

export const dynamic = 'force-dynamic';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<OperationSearchParams>;
}) {
  const user = await getSessionUser();
  const isCustomer = user.role === 'customer_user';
  return (
    <OperationPage
      resource="billing"
      eyebrow="BILLING & INVOICES"
      title="ใบวางบิล"
      description={
        isCustomer
          ? 'ตรวจสอบใบวางบิล ยอดเรียกเก็บ และสถานะการชำระเงิน'
          : 'ตรวจสอบและจัดการใบวางบิล รอบการเรียกเก็บเงิน ตรวจหลักฐานสลิป และติดตามสถานะการชำระเงิน'
      }
      action={isCustomer ? '' : 'สร้างใบวางบิล'}
      searchParams={searchParams}
    />
  );
}
