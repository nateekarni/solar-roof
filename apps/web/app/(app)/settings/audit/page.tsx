import { OperationPage } from "../../../../features/shared/operation-page";
import type { OperationSearchParams } from '../../../../features/shared/operation-request-query';

export const dynamic = "force-dynamic";

export default function AuditSettingsPage({searchParams}:{searchParams:Promise<OperationSearchParams>}) {
  return (
    <OperationPage
      resource="audit"
      eyebrow="AUDIT TRAIL"
      title="ประวัติการทำงาน"
      description="ตรวจสอบเหตุการณ์สำคัญและการเปลี่ยนแปลงข้อมูลแบบ append-only"
      action="ส่งออก log"
      searchParams={searchParams}
    />
  );
}
