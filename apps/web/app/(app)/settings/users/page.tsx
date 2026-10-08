import { OperationPage } from "../../../../features/shared/operation-page";

export const dynamic = "force-dynamic";

export default function UsersSettingsPage() {
  return (
    <OperationPage
      resource="users"
      eyebrow="IDENTITY"
      title="ผู้ใช้งาน"
      description="จัดการ owner, admin และ school_user พร้อมขอบเขตองค์กร"
      action="เชิญผู้ใช้"
    />
  );
}
