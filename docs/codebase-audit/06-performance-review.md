# รายงานการตรวจสอบโครงสร้างโค้ดและการปรับปรุงระบบ (Codebase Audit & Refactoring Plan)
## เอกสารฉบับที่ 06: การปรับปรุงประสิทธิภาพและคอขวดของระบบ (Performance & Bottleneck Review)

**วันที่ตรวจสอบ:** 16 ตุลาคม 2026  
**ขอบเขต:** ประสิทธิภาพของฐานข้อมูลและการสืบค้น (Database & Query Performance), การใช้ทรัพยากรบน Backend Event Loop, และประสิทธิภาพการแสดงผลและขนาด Bundle ของ Frontend

---

### 1. ประสิทธิภาพฐานข้อมูลและการสืบค้นข้อมูลอนุกรมเวลา (Database & Telemetry Queries)

ตาราง `payload_samples` เป็นตารางจัดเก็บข้อมูลการวัดทางไฟฟ้า (Telemetry Time-Series) ที่มีอัตราการเขียนข้อมูลต่อเนื่องจากอุปกรณ์ IoT และ Modbus Gateways:

#### 1.1 ปัญหา Correlated Lateral Join ใน `AssetsController.listGateways`
ใน `apps/api/src/modules/assets/assets.controller.ts:50-58` มีการดึงสถานะล่าสุดของ Gateway โดยใช้คำสั่ง:
```sql
SELECT g.id, g.name, ...
FROM gateways g
JOIN sites s ON s.id = g.site_id
LEFT JOIN LATERAL (
  SELECT max(sample.measured) AS measured, max(sample.received) AS received
  FROM devices d
  LEFT JOIN LATERAL (
    SELECT coalesce(ps.measured_at, ps.polled_at) AS measured, ps.received_at AS received
    FROM payload_samples ps
    WHERE ps.device_id = d.id
    ORDER BY coalesce(ps.measured_at, ps.polled_at) DESC, ps.received_at DESC, ps.id DESC
    LIMIT 1
  ) sample ON true
  WHERE d.gateway_id = g.id
) latest ON true
```

**การวิเคราะห์ทางประสิทธิภาพ:**
- คำสั่งนี้ใช้ Nested Lateral Join 2 ชั้น ซึ่งต้องทำการ Index Scan ย้อนหลังตาม `device_id` ทุกตัวในแต่ละ Gateway
- แม้ว่าจะมีดัชนี (Indexes) ในตาราง `payload_samples` แต่เมื่อตารางเติบโตถึงหลักหลายล้านแถว การคำนวณ `ORDER BY ... DESC LIMIT 1` ในทุกๆ ครั้งที่มีผู้เปิดดูหน้าเว็บเกตเวย์จะกิน CPU และ I/O สูงมาก
- **แนวทางแก้ไข (Optimization):** สร้างตารางสรุปสถานะล่าสุด (Read-Model Cache) เช่น `gateway_latest_telemetry` หรือ `device_latest_telemetry` ที่อัปเดต ณ เวลาที่ Ingestion Worker รับข้อมูลเข้ามา (UPSERT ในขั้นตอน Ingest) จะทำให้การอ่านในหน้าเว็บเปลี่ยนจากการทำ Lateral Join บนตารางขนาดใหญ่ เป็นการ `JOIN` ตารางสรุป 1 แถวต่อ 1 อุปกรณ์ ซึ่งใช้เวลาไม่เกิน 2–5ms

#### 1.2 ข้อจำกัดและการแข่งขันใน Connection Pool (Pool Sizing & Statement Timeout)
- **การตั้งค่าปัจจุบัน:** `API_READ_POOL_MAX` ถูกจำกัดไว้ที่ **12 connections** และ `statement_timeout` อยู่ที่ **2,500ms**
- **ความเสี่ยง:** หากคำสั่ง Lateral Join ของ Telemetry ใช้เวลา 800ms และมีการเปิด Transaction ในคำสั่งอ่านพร้อมกัน 10-12 คำสั่ง คำร้องถัดไปจะติดค้างในคิวรอ (`db_pool_waiting`) และเมื่อเกิน 2,500ms ระบบจะตัดการทำงาน (Query Timeout Error)
- **แนวทางแก้ไข:**
  1. แยก Database Pool ออกเป็น 2 พูลอย่างชัดเจน: **Read Pool** (สำหรับดึงข้อมูลทั่วไป) และ **Write/Transaction Pool** (สำหรับคำสั่งเปลี่ยนแปลงข้อมูล)
  2. ปลดล็อกคำสั่งอ่านทั้งหมดออกจาก `this.db.transaction()` เพื่อให้ Connection ถูกปล่อยคืนพูลทันทีหลังจบคำสั่งเดียว

---

### 2. คอขวดบน Main Event Loop ของ Node.js ใน Backend (Backend Runtime Performance)

#### 2.1 การประมวลผล PDF หนักบน Main Event Loop (Synchronous PDF Rendering)
ใน `apps/api/src/modules/documents/document-layout.ts` (914 บรรทัด):
- มีการใช้ไลบรารี `pdfkit` ในการวาดเอกสาร PDF ขนาด A4 แบบ Multi-page เช่น ใบวางบิล, ใบแจ้งหนี้, ใบเสร็จรับเงิน, และสัญญา PPA
- การคำนวณพิกัด Vector, การฝังฟอนต์ภาษาไทย, การคำนวณความสูงของตาราง, และการฝังภาพโลโก้/ลายเซ็น ทำงานแบบ **CPU-intensive Synchronous Computation บน Node.js Main Thread**
- **ผลกระทบ:** ในระหว่างที่ระบบทำการสร้างเอกสาร PDF 1 ฉบับ (ใช้เวลาประมาณ 100ms–600ms) Node.js Event Loop จะถูกบล็อก ไม่สามารถประมวลผลคำขอ HTTP อื่นๆ หรือส่งแพ็กเก็ต WebSocket/MQTT ไปยังไคลเอนต์ได้ ส่งผลให้ค่า Latency รวมของ API เกิดอาการกระตุก (Jank)
- **แนวทางแก้ไข:**
  - ย้ายกระบวนการสร้าง PDF ขนาดใหญ่ไปทำงานใน `apps/worker` โดยใช้ Job Queue หรือรันใน `worker_threads` ของ Node.js เพื่อไม่ให้รบกวน Main Thread ของ API

---

### 3. ประสิทธิภาพการแสดงผลและขนาด Bundle ใน Frontend (Frontend & Re-render Performance)

#### 3.1 ปัญหา Unnecessary Re-renders ใน Monolithic Components
ในคอมโพเนนต์ขนาดใหญ่ เช่น:
- `apps/web/features/settings/staff-permissions-workspace.tsx` (1,251 บรรทัด)
- `apps/web/features/sites/site-customer-users.tsx` (1,086 บรรทัด)
- `apps/web/features/shared/operation-table.tsx` (719 บรรทัด)

**ปัญหาที่ตรวจพบ:**
- มีการเก็บ State ทุกอย่างไว้ที่ Root ของคอมโพเนนต์ เช่น `searchQuery`, `statusFilter`, `inviteModalOpen`, `editUser`, `busy`, `error`
- ทุกครั้งที่ผู้ใช้พิมพ์ตัวอักษรค้นหา 1 ตัวในช่อง Search Input ฟังก์ชันของคอมโพเนนต์ทั้ง 1,000+ บรรทัดจะถูกคำนวณใหม่ และตารางข้อมูลทั้งหมดจะถูกสั่ง Re-render
- **แนวทางแก้ไข:**
  - สกัดช่อง Search และ Filter ออกเป็นคอมโพเนนต์ย่อยที่มี Local State ของตนเอง พร้อมใช้ Debounce ในการส่งค่าออกไปยังตาราง
  - ห่อหุ้มแถวของตารางข้อมูลด้วย `React.memo` หรือใช้ Virtualization (`@tanstack/react-virtual`) เมื่อตารางมีข้อมูลเกิน 50 แถว

#### 3.2 การนำเข้าโมดอลแบบ Static แทน Dynamic Imports (Bundle Size Bloat)
ใน `apps/web/features/shared/operation-table.tsx`:
```typescript
// มีการ import โมดอลขนาดใหญ่ทั้งหมดตั้งแต่ต้นไฟล์แบบ Static:
import { DocumentPreviewModal } from "./document-preview-modal";
import { BillingDetailModal } from "../billing/billing-detail-modal";
import { RecordSignModal } from "./record-sign-modal";
import { CustomerPaymentModal } from "./customer-payment-modal";
```
- **ผลกระทบ:** โค้ดของโมดอลทั้งหมด (รวมถึงไลบรารีแสดงตัวอย่าง PDF, Canvas ลายเซ็น, QR Code Generator) จะถูกมัดรวมเข้าสู่ Initial JavaScript Bundle ของหน้า Operations Dashboard ทำให้ขนาดของไฟล์ JS เริ่มต้นที่เบราว์เซอร์ต้องดาวน์โหลดมีขนาดใหญ่เกินจำเป็น
- **แนวทางแก้ไข:**
  - เปลี่ยนการ Import โมดอลเหล่านี้ให้เป็น `next/dynamic` พร้อมเปิดใช้ `{ ssr: false }` เพื่อให้เบราว์เซอร์โหลดโค้ดของโมดอลมาเฉพาะเมื่อผู้ใช้คลิกเปิดโมดอลนั้นๆ เท่านั้น:
    ```typescript
    const DocumentPreviewModal = dynamic(
      () => import("./document-preview-modal").then(m => m.DocumentPreviewModal),
      { ssr: false }
    );
    ```
  - วิธีนี้จะช่วยลดขนาด Initial Page Bundle ลงได้ถึง 150KB–250KB ทันที
