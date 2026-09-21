import { OperationPage } from "../../../../features/shared/operation-page";

export const dynamic = "force-dynamic";

export default function AuditSettingsPage() {
  return (
    <OperationPage
      resource="audit"
      eyebrow="AUDIT TRAIL"
      title="ประวัติการทำงาน"
      description="ตรวจสอบเหตุการณ์สำคัญและการเปลี่ยนแปลงข้อมูลแบบ append-only"
      action="ส่งออก log"
    />
  );
}
