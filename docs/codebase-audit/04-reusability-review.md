# รายงานการตรวจสอบโครงสร้างโค้ดและการปรับปรุงระบบ (Codebase Audit & Refactoring Plan)
## เอกสารฉบับที่ 04: การใช้โค้ดซ้ำและคอมโพเนนต์ส่วนกลาง (Code Reusability & Shared Services)

**วันที่ตรวจสอบ:** 16 ตุลาคม 2026  
**ขอบเขต:** การตรวจหาโค้ดที่ซ้ำซ้อน (Duplicated Code), การปรับปรุงคอมโพเนนต์ UI ส่วนกลาง, และการรวมศูนย์ Services ในฝั่ง Backend

---

### 1. การคัดลอกโค้ด Dialog ยืนยันซ้ำซ้อนใน Frontend (UI Dialog Duplication)

จากการตรวจสอบพบการคัดลอกโค้ดโมดอลยืนยัน (Confirmation Dialogs) ซ้ำซ้อนข้ามหลายฟีเจอร์ รวมเป็นจำนวนมากกว่า 450 บรรทัด:

#### 1.1 รายการคอมโพเนนต์ที่ซ้ำซ้อนกันอย่างชัดเจน:
1. **`DiscardConfirmDialog`:**
   - ปรากฏใน `apps/web/features/sites/site-customer-users.tsx` (บรรทัด 59–91)
   - ปรากฏใน `apps/web/features/settings/staff-permissions-workspace.tsx`
   - ปรากฏใน `apps/web/features/sites/site-form-dialog.tsx`
   - *พฤติกรรม:* แสดงกล่องเตือนว่า "ละทิ้งการเปลี่ยนแปลง? ข้อมูลที่คุณกรอกไว้ยังไม่ได้บันทึก" พร้อมปุ่ม "แก้ไขต่อ" และ "ละทิ้งข้อมูล"
2. **`DeactivateConfirmDialog`:**
   - ปรากฏใน `apps/web/features/sites/site-customer-users.tsx`
   - ปรากฏใน `apps/web/features/settings/staff-permissions-workspace.tsx`
   - *พฤติกรรม:* ยืนยันการปิดการใช้งานผู้ใช้ (Deactivate User) พร้อมส่งคำร้อง HTTP PUT ไปยัง API
3. **`CancelInviteConfirmDialog`:**
   - ปรากฏใน `site-customer-users.tsx` และ `staff-permissions-workspace.tsx`

#### 1.2 สาเหตุที่แท้จริง (Root Cause): ความตื้นของ `ConfirmAction`
ในโปรเจกต์มีคอมโพเนนต์ส่วนกลางอยู่แล้วที่ `apps/web/components/feedback/confirm-action.tsx`:
```typescript
// apps/web/components/feedback/confirm-action.tsx (ความยาว 9 บรรทัด)
export function ConfirmAction({ trigger, title, description, confirmLabel = "ยืนยัน", onConfirm }: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button onClick={onConfirm}>{confirmLabel}</Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```
**ทำไมผู้พัฒนาจึงไม่ยอมใช้ `ConfirmAction` นี้?**
- เป็น **Shallow Abstraction**: ผูกติดอยู่กับ `<AlertDialogTrigger>` ทำให้ไม่สามารถควบคุมการเปิด-ปิดจากภายนอกแบบ Programmatic (Controlled `open`/`onOpenChange`) ได้ (เช่น ไม่สามารถเปิดขึ้นมาเมื่อผู้ใช้กดปิด Modal ฟอร์มที่มีข้อมูลค้างอยู่)
- ไม่รองรับ `destructive` variant สำหรับปุ่มอันตราย (สีแดง)
- ไม่มี Loading Spinner / Busy state ระหว่างรอการลบข้อมูล
- ข้อความปุ่มถูก Hardcode เป็นภาษาไทย ไม่รองรับระบบสลับภาษา (i18n)

#### 1.3 แนวทางแก้ไขเชิงสถาปัตยกรรม (Deep Confirm Modal Solution):
ปรับปรุง `apps/web/components/feedback/confirm-action.tsx` ให้เป็น **Deep Module** ที่รองรับทั้ง Controlled Mode และ Trigger Mode:
```typescript
export interface ConfirmModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  busy?: boolean;
  onConfirm: () => Promise<void> | void;
}
```
เมื่อสร้างคอมโพเนนต์นี้เสร็จ จะสามารถลบโค้ด `DiscardConfirmDialog`, `DeactivateConfirmDialog`, และ `CancelInviteConfirmDialog` ออกจาก `site-customer-users.tsx` และ `staff-permissions-workspace.tsx` ได้ทันที **ลดโค้ดที่ซ้ำซ้อนได้กว่า 450 บรรทัด**

---

### 2. การซ้ำซ้อนของฟอร์มสร้างและแก้ไขข้อมูล (Form Dialog Duplication)

ใน `apps/web/features/sites/` มีการแยกฟอร์มสร้างและแก้ไขออกจากกัน:
- **`site-form-dialog.tsx` (695 บรรทัด):** สำหรับสร้างไซต์งานใหม่ (Create)
- **`site-edit-dialog.tsx` (525 บรรทัด):** สำหรับแก้ไขไซต์งานเดิม (Edit)
- **`gateway-form-dialog.tsx` vs `gateway-edit-dialog.tsx`**

```mermaid
graph TD
    subgraph ปัญหาปัจจุบัน (Current Duplication)
        SFD[site-form-dialog.tsx: 695 บรรทัด<br>Name, Code, Customer, Lat, Lng, kWp, ...]
        SED[site-edit-dialog.tsx: 525 บรรทัด<br>Name, Code, Customer, Lat, Lng, kWp, ...]
    end

    subgraph โครงสร้างที่แนะนำ (Unified Form Dialog)
        UFD[site-form-dialog.tsx: ~450 บรรทัด<br>mode: 'create' | 'edit'<br>initialData?: SiteDetail]
        UFD --> FormFields[SiteFormFields (Shared Sub-components)]
    end
```

**สิ่งที่ซ้ำซ้อนกัน:**
- รายการ Field ข้อมูล: ชื่อไซต์งาน, รหัสภายนอก, ลูกค้า, พิกัดละติจูด/ลองจิจูด, กำลังการผลิตติดตั้ง (kWp), ที่อยู่, ผู้ติดต่อ, Timezone
- ตรรกะการตรวจสอบความถูกต้อง (Validation logic)
- State การจัดการ Gateway และ Meter เบื้องต้น

**ข้อเสนอแนะในการปรับปรุง:**
ควบรวมเป็น `SiteDialog` เพียงตัวเดียวที่รับ Prop `mode: 'create' | 'edit'` พร้อม `initialData` หากเป็นโหมด Edit จะลดขนาดไฟล์ลงได้กว่า **700 บรรทัด** และทำให้การเพิ่มหรือปรับปรุงฟิลด์ของไซต์งานในอนาคตทำได้ที่จุดเดียว (Single Point of Truth)

---

### 3. การสร้าง Service ส่วนกลางใน Backend (Shared Backend Services)

#### 3.1 รวมศูนย์ระบบส่งอีเมล (Centralized `MailerService`)
ในปัจจุบันมี 4 โมดูลที่สร้าง `nodemailer.createTransport` เอง ได้แก่ `identity-email.ts`, `invitation.service.ts`, `operational-automation.service.ts`, และ `saved-document-delivery.ts`

**ปัญหาที่พบ:**
1. **การเชื่อมต่อแบบสิ้นเปลือง:** แต่ละฟังก์ชันสร้าง Transport ใหม่ และเรียก `transport.close()` ทุกครั้ง ไม่มีการทำ Connection Pooling ของ SMTP
2. **Configuration Inconsistency:** `identity-email.ts` อ่าน `SMTP_PASSWORD ?? SMTP_PASS`, แต่ `invitation.service.ts` อ่าน `SMTP_PASS` เท่านั้น หาก Production ตั้งค่าตัวแปรแวดล้อมเป็น `SMTP_PASSWORD` อีเมลคำเชิญจะล้มเหลว
3. **Port NaN Crash:** `saved-document-delivery.ts:59` ไม่มี Fallback พอร์ต หากไม่ตั้ง `SMTP_PORT` จะได้ค่า `NaN`

**แนวทางแก้ไข:**
สร้างโมดูล `apps/api/src/modules/mailer/mailer.service.ts` เป็น NestJS Provider เพียงตัวเดียว:
- ตรวจสอบและดึง Environment Variables ให้สอดคล้องกัน (เช่น `SMTP_HOST`, `SMTP_PORT` มี Fallback เป็น 587, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD ?? SMTP_PASS`)
- จัดเตรียม Pool การเชื่อมต่อ และมี Method มาตรฐาน: `sendMail({ to, subject, html, text, attachments })`
- ฉีด `MailerService` เข้าไปยังทั้ง 4 โมดูลแทนการเรียก `nodemailer` โดยตรง

#### 3.2 รวมศูนย์การบันทึก Audit Log (Unified `AuditLogService`)
พบการเขียน SQL Append เข้าสู่ตาราง `audit_events` ด้วยคำสั่งตรงๆ ในหลายไฟล์ เช่น:
- `apps/api/src/modules/identity/invitation.service.ts:138, 171`
- `apps/api/src/modules/identity/team.service.ts:152`
- `apps/api/src/modules/billing/saved-document-delivery.ts:25, 31`

**แนวทางแก้ไข:**
สร้าง `AuditLogService` ที่มี Interface เรียบง่าย:
```typescript
recordEvent(client: PoolClient, event: {
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  afterJson?: unknown;
  correlationId?: string;
})
```
จะช่วยลดความผิดพลาดในการสร้าง UUID และลดการเขียน SQL Insert ซ้ำๆ ในหลายสิบจุด

---

### 4. Custom React Hook สำหรับการดึงข้อมูล (Reusable Data-Fetching Abstraction)

ในฝั่งหน้าบ้านพบการเขียน Logic การดึงข้อมูลด้วย `useEffect` ซ้ำซ้อนถึง 79 จุด:
```typescript
// แพทเทิร์นที่เขียนซ้ำ 79 ครั้งในปัจจุบัน:
const [data, setData] = useState([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState("");
const [revision, setRevision] = useState(0);

useEffect(() => {
  let active = true;
  setLoading(true);
  apiClient.get(endpoint)
    .then(res => { if (active) setData(res); })
    .catch(err => { if (active) setError(err.message); })
    .finally(() => { if (active) setLoading(false); });
  return () => { active = false; };
}, [revision, ...deps]);
```

**แนวทางแก้ไข:**
เนื่องจากโปรเจกต์ได้ติดตั้ง `@tanstack/react-query` ไว้อยู่แล้วใน `apps/web/package.json`:
1. ตั้งค่า `QueryClientProvider` ที่ Root Layout ของ `apps/web`
2. สร้าง Custom Query Hooks เช่น `useSiteList()`, `useGateways()`, `useSiteCustomerUsers(siteId)`
3. ใช้ `queryClient.invalidateQueries({ queryKey: [...] })` เมื่อมีการแก้ไขข้อมูลใน Dialog แทนการสร้างตัวแปร `revision` นับจำนวนรอบแบบ Manual ซึ่งจะกำจัดโค้ด Boilerplate ลงได้นับพันบรรทัดทั่วทั้งโปรเจกต์
