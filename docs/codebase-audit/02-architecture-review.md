# รายงานการตรวจสอบโครงสร้างโค้ดและการปรับปรุงระบบ (Codebase Audit & Refactoring Plan)
## เอกสารฉบับที่ 02: การทบทวนสถาปัตยกรรมระบบ (Architecture Review)

**วันที่ตรวจสอบ:** 16 ตุลาคม 2026  
**ระบบเป้าหมาย:** สถาปัตยกรรม Monorepo, การแบ่งเลเยอร์ (Layering), การแยกหน้าที่ (Separation of Concerns), และขอบเขตของโมดูล (Module Boundaries)

---

### 1. โครงสร้าง Monorepo และการจัดวางโมดูล (Monorepo Topology)

ระบบ Solar Roof ใช้โครงสร้าง Monorepo ภายใต้การจัดการของ `pnpm` workspace และ Turborepo โดยแบ่งออกเป็น 3 แอปพลิเคชันหลัก และ 5 แพ็กเกจที่ใช้ร่วมกัน:

```
solar-roof/
├── apps/
│   ├── api/                 # NestJS 10 REST API Backend & WebSocket
│   ├── web/                 # Next.js 16 (App Router) + React 19 Frontend
│   └── worker/              # Background Worker สำหรับ Ingestion & Aggregation
├── packages/
│   ├── domain/              # Pure Domain Logic (Business Rules, Invariants, Validation)
│   ├── api-contracts/       # Shared TypeScript DTOs & API Contracts
│   ├── connectors/          # Protocol Adapters (Modbus TCP, MQTT simulator, File)
│   ├── i18n/                # Localization (TH/EN translation maps)
│   └── ui/                  # Shared UI Primitives
└── infra/
    └── migrations/          # 54 PostgreSQL + TimescaleDB Migration Files
```

#### ประเมินความถูกต้องของความสัมพันธ์ระหว่างโมดูล (Dependency Direction):
- **ทิศทางความขึ้นต่อกันในภาพรวมเป็นไปตามลำดับขั้นที่ดี:** `apps/web` และ `apps/api` นำเข้าประเภทข้อมูลจาก `packages/domain` และ `packages/api-contracts` โดยที่ไม่มีการนำเข้าย้อนกลับ (Circular Dependency ข้ามแพ็กเกจ = 0)
- **`packages/domain` มีความเป็นอิสระสูงสุด (Pure Domain Layer):** ไม่มี Framework Dependencies (ไม่มี `@nestjs/*` หรือ `react`), ขึ้นต่อกันเพียง `zod` สำหรับ Schema Validation ทำให้สามารถรัน Unit Tests ได้รวดเร็วมาก (24 tests ใช้เวลาเพียงไม่กี่มิลลิวินาที)

---

### 2. การแบ่งเลเยอร์และการแยกหน้าที่ในฝั่ง Backend (API Layering & Separation of Concerns)

ในการตรวจสอบโครงสร้างของ `apps/api` พบประเด็นสำคัญทางสถาปัตยกรรมดังนี้:

#### 2.1 ปัญหาสถาปัตยกรรมกลับหัวใน Assets Module (Inverted Abstraction & Dead Stub)
ในรูปแบบสถาปัตยกรรม Controller-Service-Repository ที่ถูกต้อง:
- **Controller:** มีหน้าที่เฉพาะการรับส่ง HTTP Request/Response, ถอดรหัส Parameters, และตรวจสอบสิทธิ์ขั้นต้น
- **Service:** บรรจุ Business Logic, การเชื่อมประสานงาน, และการควบคุม Transaction
- **Repository / Data Access:** มีหน้าที่ในการติดต่อ Database และ Execute Query

**สิ่งที่ตรวจพบจริงในโค้ดเบส:**
1. **`apps/api/src/modules/assets/assets.controller.ts` (1,189 บรรทัด):**
   - Controller แบกรับภาระงานทั้งหมดโดยตรง: มีการรันคำสั่ง Raw SQL ที่ซับซ้อนมาก (เช่น คำสั่ง Lateral Join ความยาวกว่า 30 บรรทัดใน `listGateways`), การเปิด Transaction, การเข้ารหัส/ถอดรหัสรหัสผ่านของ MQTT Broker ด้วย Crypto, การเชื่อมต่อไปยัง EMQX Broker, และการทำ Ingestion Settings
2. **`apps/api/src/modules/assets/assets.service.ts` (170 บรรทัด):**
   - กลายเป็น **Orphaned Stub** ที่ใช้ Memory Map (`private readonly sites = new Map<string, SiteRecord>()`) สำหรับจำลองข้อมูล ซึ่งไม่เคยถูกนำไป Dependency Inject หรือเรียกใช้จาก Controller เลยแม้แต่บรรทัดเดียว!
   - ผลกระทบ: สถาปัตยกรรมถูก Invert โดยสิ้นเชิง โค้ดทั้งหมดไปกระจุกตัวอยู่ใน Controller ทำให้ไม่สามารถเขียน Unit Test เพื่อทดสอบ Business Logic ได้โดยไม่ต้องจำลอง Database หรือ HTTP Request

```mermaid
graph TD
    subgraph ปัญหาปัจจุบัน (Current State)
        Client1[HTTP Client] --> AC[AssetsController: 1,189 บรรทัด<br>แบกรับ Raw SQL + MQTT + Crypto + Tx]
        AC --> DB[(PostgreSQL)]
        AC --> MQTT[EMQX Broker]
        AS[AssetsService: 170 บรรทัด<br>In-memory Map Stub - ไม่ถูกเรียกใช้!]
    end

    subgraph สถาปัตยกรรมที่ควรจะเป็น (Target Architecture)
        Client2[HTTP Client] --> AC_New[AssetsController: < 200 บรรทัด<br>HTTP Routing & Auth Guard]
        AC_New --> AS_New[AssetsService<br>Business Logic & Orchestration]
        AS_New --> AR_New[AssetsRepository<br>SQL Queries & Transactions]
        AS_New --> MS_New[BrokerConfigService<br>MQTT Encryption & Sync]
        AR_New --> DB2[(PostgreSQL)]
        MS_New --> MQTT2[EMQX Broker]
    end
```

#### 2.2 การเขียน Raw SQL ใน Controller และการขาด Repository Layer
- ทั่วทั้งระบบ `apps/api` อาศัยการเรียก `this.db.query(...)` ผ่าน `DatabaseService` (ซึ่งห่อหุ้ม `pg.Pool`)
- **ข้อดี:** ประสิทธิภาพสูงมาก ไม่มี Overhead จาก ORM และสามารถควบคุม Query Plan ได้เต็มที่
- **ข้อบกพร่อง:** คำสั่ง SQL ซ้ำซ้อน เช่น การดึงสิทธิ์ผู้ใช้ (`users JOIN site_account_assignments`), การตรวจสอบสถานะไซต์งาน (`WHERE status <> 'archived'`), และโครงสร้างคอลัมน์ขององค์กร ถูกเขียนซ้ำในหลายสิบ Controller หากมีการเปลี่ยนแปลง Schema ฟิลด์ใดฟิลด์หนึ่ง จะต้องไล่ตามแก้ในทุกจุดเสี่ยงต่อการหลุด

#### 2.3 การใช้ Transaction ผิดวัตถุประสงค์กับคำสั่งอ่าน (Transaction Abuse on Read Queries)
ใน `DatabaseService.ts` มีการจำกัด Connection Pool ไว้อย่างเข้มงวด:
```typescript
// apps/api/src/database/database.service.ts
max: options.max ?? configured('API_READ_POOL_MAX', 12, 12)
```
พูลมีขนาดสูงสุดเพียง **12 connections** แต่กลับพบการเรียก `this.db.transaction()` ครอบคำสั่งอ่านธรรมดา เช่น:
- `apps/api/src/modules/identity/site-customer-users.service.ts:31`:
  ```typescript
  async list(siteId: string, actorId: string) {
    return this.db.transaction(async (client) => {
      const customerId = await this.scope(client, siteId, actorId);
      return {
        customerId,
        users: (await client.query("SELECT ... FROM users ...")).rows,
      };
    });
  }
  ```
- `apps/api/src/modules/identity/invitation.service.ts:178`:
  ```typescript
  async findOutstanding(email: string, actor: ScopePrincipal & { id: string }) {
    return this.db.transaction(async (client) => {
      const invitation = (await client.query("SELECT i.* FROM user_invitations ...")).rows[0];
      // ไม่มีคำสั่งเขียนใดๆ เลย
      return { invitationId: invitation.id, status: invitation.delivery_status };
    });
  }
  ```
- **ผลกระทบ:** การเปิด Transaction (`BEGIN` ... `COMMIT`) เพื่ออ่านข้อมูลอย่างเดียว จะจอง Connection ค้างไว้ตลอดการทำงาน และสร้าง Transaction Overhead ใน PostgreSQL เมื่อผู้ใช้งานหลายคนเปิดหน้า Dashboard พร้อมกัน Connection Pool ขนาด 12 จะเต็มทันที ส่งผลให้ Request อื่นๆ เกิด Timeout (`2500ms`)

#### 2.4 การสร้าง Email Transport กระจัดกระจาย (Fragmented Mailer Services)
พบการสร้างอินสแตนซ์ `nodemailer.createTransport` แยกกันอย่างอิสระใน 4 โมดูล:
1. `apps/api/src/modules/identity/identity-email.ts#L14` (สำหรับ OTP/2FA)
2. `apps/api/src/modules/identity/invitation.service.ts#L258` (สำหรับคำเชิญเข้าสู่ระบบ)
3. `apps/api/src/modules/notifications/operational-automation.service.ts#L23` (สำหรับการแจ้งเตือนทางเทคนิค)
4. `apps/api/src/modules/billing/saved-document-delivery.ts#L59` (สำหรับการส่งใบแจ้งหนี้/ใบเสร็จ)

**ข้อผิดพลาดที่เกิดขึ้นจากการไม่รวมศูนย์:**
- **ความไม่สอดคล้องของ Environment Variable:**
  - `identity-email.ts` อ่าน: `pass: process.env.SMTP_PASSWORD ?? process.env.SMTP_PASS ?? ''`
  - `invitation.service.ts` อ่าน: `pass: process.env.SMTP_PASS` (หากระบบตั้งค่าเป็น `SMTP_PASSWORD` เมลคำเชิญจะไม่สามารถส่งออกได้!)
- **บั๊กค่าพอร์ต NaN:**
  - ใน `saved-document-delivery.ts:59` เขียน `port: Number(process.env.SMTP_PORT)` โดยไม่มี Fallback หากไม่ได้ระบุ `SMTP_PORT` ในไฟล์ `.env` ค่าจะกลายเป็น `NaN` และ Nodemailer จะล้มเหลวทันที

---

### 3. การประเมินตามหลักการ Deep Modules vs Shallow Modules (Codebase Design Principles)

ตามแนวทาง **Codebase Design** ที่มุ่งเน้นการสร้าง **Deep Module** (Small Interface + Deep Implementation) เพื่อเพิ่ม **Leverage** ให้กับผู้เรียก และสร้าง **Locality** ในการดูแลรักษา:

| โมดูล (Module) | ระดับความลึก (Depth) | การประเมิน (Evaluation) | ผลกระทบและข้อเสนอแนะ |
| :--- | :---: | :--- | :--- |
| **`packages/domain`** (`brand.ts`, `energy-increments.ts`, `history-policy.ts`) | **Deep Module** 🟢 | มี Interface ที่กระชับ รับข้อมูลและคืนค่าโดยไม่มี Side-effect ซ่อน Invariant การคำนวณทางฟิสิกส์และการปัดเศษทางบัญชีไว้ภายในอย่างสมบูรณ์ | เป็นตัวอย่างการออกแบบที่ดีเยี่ยม ควรคงไว้และเป็นแบบอย่างให้กับส่วนอื่นๆ |
| **`confirm-action.tsx`** (`apps/web/components/feedback/`) | **Shallow Module** 🔴 | มีความยาวเพียง 9 บรรทัด เป็นการ Wrap `AlertDialog` แบบผิวเผิน ไม่รองรับ Controlled State (`open`, `onOpenChange`), ไม่รองรับ Destructive Button, ไม่มี Loading State, Hardcode ภาษาไทย | ผู้พัฒนาคนอื่นจึงไม่สามารถนำไปใช้ซ้ำได้ และต้องคัดลอกโค้ดทำ Dialog ขึ้นมาเองในเกือบทุกหน้า |
| **`AssetsService`** (`apps/api/src/modules/assets/`) | **Empty / Shallow** 🔴 | Interface มีขนาดใหญ่เท่ากับ Implementation และใช้ Memory Map ปลอมๆ ไม่มีการซ่อน Logic ใดๆ | ควรย้าย Logic จาก `AssetsController` เข้ามาอยู่ใน Service นี้ เพื่อเปลี่ยนให้เป็น Deep Module ที่แท้จริง |
| **`DatabaseService`** (`apps/api/src/database/`) | **Deep Module** 🟢 | มี Interface เล็กมาก (`query`, `transaction`) แต่ซ่อนการเชื่อมต่อ Pool, Metrics Observation, Error Logging, และ Timeout Management ไว้ภายใน | มีความลึกที่ดีมาก ควรคงไว้ แต่ต้องแยก Pool สำหรับการเขียนและการอ่านให้ชัดเจน |

---

### 4. การปฏิบัติตามขอบเขตของสัญญาและแพ็กเกจ (Contract Compliance)

1. **`packages/api-contracts` vs Controller Payloads:**
   - โมดูลส่วนใหญ่เช่น `operations.ts`, `jobs.ts`, `financial-readiness.ts` มีการแชร์ไทป์ระหว่างหน้าเว็บและ API ได้ดี
   - อย่างไรก็ตาม ใน `AssetsController` ยังพบการส่งคืน Raw Object ที่ได้จาก `client.query(...).rows` โดยตรงเป็นจำนวนมาก ซึ่งไม่ได้ถูกพิมพ์เป็นสัญญามาตรฐานใน `packages/api-contracts` ส่งผลให้ฝั่งหน้าบ้านต้องใช้ `any` หรือเขียน Custom Type ซ้อนขึ้นมาเองใน `site-options.ts` และ `gateway-columns.ts`
2. **คำแนะนำเชิงโครงสร้าง:**
   - ดึง DTO ของ Assets (`SiteResponseDto`, `GatewayDetailDto`) ไปไว้ใน `packages/api-contracts` เพื่อให้ Frontend และ Backend แชร์ Single Source of Truth เดียวกัน
