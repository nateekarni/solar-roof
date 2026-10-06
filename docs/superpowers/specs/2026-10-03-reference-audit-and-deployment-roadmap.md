# ผลตรวจระบบตัวอย่างและข้อเสนอเตรียม Gateway integration

วันที่ตรวจ: 3 ตุลาคม 2026 (Asia/Bangkok)
สถานะ: ผลสำรวจและข้อเสนอสำหรับ review — ยังไม่ใช่ระบบที่ Deploy แล้วหรือ API ที่เปิดใช้งาน

## 1. เป้าหมายและขอบเขตหลักฐาน

ให้ผู้จัดการ Gateway เชื่อมต่อและส่งข้อมูลจริงเข้าระบบ ผู้ดูแลได้รับ LINE/e-mail และลูกค้าดู Historical record ตามสิทธิ์ของตนได้ โดยต่อยอด Next.js/NestJS/Worker เดิม

ตรวจด้วยบัญชีที่ผู้ใช้ให้ผ่าน UI ของ https://mju.triplenclouds.com/manage/ และหน้า https://mju.triplenclouds.com/plant_overview/1789631801 รวมถึง Dashboard ที่ลิงก์จากระบบ ไม่มีการบันทึก เพิ่ม แก้ไข หรือลบข้อมูลตัวอย่างจริง เปิดฟอร์มเพื่อสำรวจและเปลี่ยนตัวเลือกในฟอร์มที่ยังไม่บันทึกเท่านั้น ไม่เก็บรหัสผ่านในเอกสาร

ข้อจำกัด: ไม่ได้รับ backend source, database schema, API documentation, gateway firmware หรือ packet trace ของระบบตัวอย่าง จึงยืนยันเฉพาะข้อมูลและพฤติกรรมที่เห็นใน UI ไม่สามารถยืนยัน protocol ขาเข้า, authentication, payload, DB engine, retention, retry หรือ semantics ของการลบได้ ปุ่มมีอยู่ไม่ได้แปลว่าทดสอบการเขียน/ลบสำเร็จ

## 2. ระบบตัวอย่างเก็บ/ใช้ข้อมูลอะไร

| ส่วน | ข้อมูลหรือพฤติกรรมที่ตรวจพบ |
|---|---|
| Plant | Project, Group, ชื่อไทย, Code, Capacity kWp, Address, Commissioning date, พิกัด, รูปภาพ 5 ช่อง, แหล่ง Production เป็น Inverter หรือ AC Power Meter |
| แหล่งข้อมูล Plant | เลือก Gateway หรือ API; เมื่อเลือก API มี API Brand และตัวเลือก Huawei นี่เป็นการตั้งค่าแหล่งข้อมูล ไม่ใช่หลักฐานว่า API เป็น endpoint รับ push หรือ vendor polling |
| Gateway | Device ID, Project/Plant, วันลงทะเบียน, Last Update, สถานะ, อุณหภูมิ; Info มี IP Address และพื้นที่ความจุ; Edit เปลี่ยนการผูก Project/Plant; มี Device/Info/Edit/ลบ |
| Device | ประเภท, Brand, Model, Name, Serial, Plant, Last Update, สถานะ; Edit มี Warranty expiration, DC capacity, Input type, String input 1–8 และ Capacity ต่อ String; มี Save/Delete Device |
| ประเภทอุปกรณ์ | Inverter, Power Meter (Grid Import/Production/Revenue), EMI, Pyranometer, Ambient/Module Temperature, Wind Speed |
| อุปกรณ์ที่แสดงในไซต์ตัวอย่าง | Huawei SUN2000-50KTL 2 เครื่อง, Revenue meter PM2230, Grid Import UMGxxx และ EMI |
| Alarm Config | เพิ่มรายการ, Brand, Type/severity, Alarm Code, Alarm Name, checkbox Line notify, Edit/Del; มี Huawei Critical/Major/Minor/Warning เช่น Grid Loss และ Device Disconnect |
| Dashboard | กำลังผลิต, Yield today/total, Grid import, PR, last update, device health, alarm count, irradiance, ambient/module temperature, wind, Revenue และ environment savings |
| Historical | Energy Summary มี Load Profile/Day/Month/Year, Date, View, Export; Revenue มี Day/Month/Year; Production มี Month/Year/Lifetime |

ทดสอบ Historical จริง: ตั้ง Date เป็น 2026-10-02 แล้วกด View ใน Energy Summary ได้ Production 535.47 kWh, Consumption 1,470.25 kWh และ Grid import 934.78 kWh ขณะที่ส่วน Realtime ยังเป็นค่าปัจจุบัน นี่เป็นหลักฐานของ daily summary ไม่ได้ยืนยัน raw historical ทุก register หรือสิทธิ์บัญชีลูกค้า เพราะตรวจด้วย admin

หน้า Overview เข้าถึงได้ใน browser session นี้ แต่ session ได้ login แล้ว จึงยังสรุปไม่ได้ว่าหน้านี้ public สำหรับทุกคน

ข้อสังเกตคุณภาพ: Gateway Info แสดงพื้นที่ NAN/NAN; Inverter ที่ capacity 0 แสดง PR inf%; Overview มี label Capacity เป็น kWh และ Humidity เป็น kWh ซึ่งไม่สอดคล้องกับชนิดตัววัด ควรนำแนวคิดหน้าจอมาใช้โดยตรวจหน่วยและสูตรใหม่

## 3. เปรียบเทียบ repository ปัจจุบัน

| เรื่อง | สถานะในโค้ดเรา | ช่องว่างที่ต้องปิด |
|---|---|---|
| CRUD | AssetsService มี create school/site/register gateway/device ใน Map; controller เปิด GET/POST schools | persistent DB, list/detail/update/deactivate สำหรับทุก entity, validation, audit, UI เชื่อม API |
| Storage | prisma/schema.prisma มี entity พื้นฐาน แต่ services ใช้ Map; API package ไม่มี Prisma client dependency | schema/migration/repository/transaction/FK/index พร้อมทดสอบ restart |
| Migration | db-migrate.ts แสดงข้อความว่าไม่มี application migrations | migration ที่สร้าง schema จริงและขั้นตอน upgrade/rollback |
| Identity | AuthService เป็น helper token/password; AuthGuard ตรวจแค่ request.user; AppModule ไม่ import IdentityModule | login/session middleware, MFA ตาม spec เดิม, refresh/revoke, assignment และ scope guard ที่เชื่อม controller จริง |
| Gateway ingress | TelemetryService.ingest เป็น method ภายใน ไม่มี HTTP telemetry controller หรือ MQTT subscriber | API contract, per-gateway credentials, authorization, durable ingest และ ACK |
| Mapping | มี semantic field/address/type/byte order/scale/unit/quality/effective date | CRUD/version API, device ownership validation, decode ที่ทดสอบจริง, ห้าม mapping ข้าม device |
| Connectors | simulator/file import และ Modbus TCP ที่รับ injected transport factory | transport จริง, scheduler, connection/reconnect; MQTT ใน Compose ยังไม่ใช่ ingestion ที่ทำงาน |
| Historical | aggregation เป็น helper ใน memory ใช้ UTC bucket และ average ทุกค่า | persisted rollup ตามชนิด metric/ไซต์ timezone, query/export API และ customer UI |
| Alarms | AlarmService เก็บ open alarm ใน Map; severity info/warning/critical | persistent event/history/ack/rules, vendor severity mapping, scheduled stale checks |
| Notification | ไม่พบ LINE/e-mail delivery implementation | provider adapters, outbox, queue/retry, delivery status และ recipient management |
| Web | Dashboard/OperationPage เป็น static arrays; ปุ่มเพิ่ม/ค้นหา/export ไม่มี handler | auth UI, real API, loading/error/empty/stale, CRUD และ history |
| Worker | register CloseBillingCycleJob แต่ไม่พบ scheduler/queue consumer สำหรับ telemetry | jobs ingestion/aggregation/notification/offline monitor และ durable queue |
| Deployment | Compose เฉพาะ DB/Redis/EMQX/MinIO local มี dev credentials และ published ports | images Web/API/Worker, TLS proxy, secrets, private networks, CI/CD, backup/restore/monitoring |
| Tests | API test script คือ tsc --noEmit ไม่ได้รัน *.spec.ts | executable API integration/E2E และ gateway contract tests |

หลักฐานสำคัญอยู่ที่ apps/api/src/modules/assets/assets.service.ts, assets.controller.ts, modules/telemetry/telemetry.service.ts, common/auth, modules/identity/auth.service.ts, scripts/db-migrate.ts, apps/worker/src/app.module.ts, apps/web/features/dashboard/dashboard.tsx, features/shared/operation-page.tsx, packages/connectors/src และ infra/docker/compose.yml

ผลตรวจคำสั่ง: pnpm test หยุดก่อนรัน tests เพราะ toolchain ไม่ตรง engines (pnpm 11.19.0 แทน >=11.24.0; child runtime Node 24.19.0 แทน >=24.20.0) แม้ shell node --version รายงาน 26.7.0 จึงต้องแก้ PATH/runtime ให้ตรงกันก่อน ไม่ได้ bypass engine หรือรับรอง build/test ผ่าน

มี pnpm-workspace.yaml ถูกแก้มาก่อนเริ่มงาน ไม่แก้ทับ

## 4. แนวทางและข้อเสนอที่แนะนำ

1. แนะนำ HTTPS JSON push เข้า NestJS API เดิมก่อน: Gateway เปิด connection ออกผ่าน 443 ได้ รองรับ NAT และทดสอบด้วย curl/Postman ง่าย; คง connector abstraction สำหรับ MQTT/vendor API เพิ่มทีหลัง
2. MQTT over TLS: เหมาะเมื่อ Gateway รองรับอยู่แล้วและต้องส่งถี่หลายไซต์ แต่ต้องเพิ่ม broker ACL, TLS, subscriber, application ACK และ operational monitoring; QoS ไม่ทดแทน DB idempotency
3. Vendor API polling: ใช้เมื่อไม่มีสิทธิ์ปรับ Gateway มีข้อจำกัด quota/latency และ vendor credentials; normalize เข้าท่อข้อมูลเดียวกัน ไม่ผูก history/billing กับ vendor

ข้อ 1 เป็นข้อเสนอชั่วคราวจนผู้จัดการ Gateway ส่ง protocol/payload จริง ไม่อ้างว่าเป็น protocol ของระบบตัวอย่าง ไม่เปิด inbound Modbus ของไซต์สู่อินเทอร์เน็ต; Modbus RTU/TCP อยู่ฝั่ง edge หรือ private VPN เท่านั้น

Data flow: Device → Gateway/adapter → authenticated ingress → durable raw + outbox transaction → worker normalize/quality/aggregate/alarm → query API → web/customer history; notification worker → LINE/e-mail

## 5. ข้อมูลและ CRUD ที่ออกแบบให้ใช้งานจริง

- Organization/School → Site/Plant → Gateway → Device → MappingVersion พร้อม database relations และ school/site assignments
- ขยาย Site ด้วย code, address, coordinates, capacityKwp, commissioning date, production source และ image references; Device ด้วย type/brand/model/warranty/DC input/string details ไม่เก็บ credentials ใน metadata
- เพิ่ม GatewayCredential (hash, scope, expiry/revocation), TelemetryBatch (gateway + messageId + body hash + processing status), TelemetrySample, TelemetryAggregate, AlarmRule/Event/Acknowledgement, NotificationRecipient/Delivery และ transactional Outbox
- Create ใช้ server-generated ID และ validate FK/duplicate/units; update ใช้ optimistic version + audit before/after; deactivate/restore เป็น soft deletion
- ห้ามลบ telemetry/mapping ที่ถูกอ้างใน historical หรือ billing; mapping เปลี่ยนผ่าน version/effective date; credential revocation แยกจากการเก็บประวัติ
- เปลี่ยนผูก Gateway/Device ข้ามไซต์ต้องมี historical assignment ช่วงเวลา ห้ามทำให้ข้อมูลเก่าถูกเปิดให้ลูกค้าคนใหม่; sample บันทึก school/site ที่ได้รับการยืนยัน ณ เวลารับ
- Timestamp เก็บ UTC พร้อม sourceTime และ receivedTime; แสดง/ตัดวันตาม Site timezone (default Asia/Bangkok); invalid/missing แสดงช่องว่างกับเหตุผล ไม่แปลงเป็น 0
- retention เสนอ raw 12 เดือน, hourly/daily aggregates 5 ปี เป็นค่ารออนุมัติและประเมิน volume; billing/audit ตาม policy องค์กรที่ยืนยันก่อน production

## 6. Proposed Gateway contract v1 (ยังไม่เปิดใช้งาน)

Routes: POST /api/v1/gateway/telemetry และ POST /api/v1/gateway/heartbeat
Headers: Content-Type: application/json; Authorization: Bearer <gateway-specific token>
Provision ผ่าน admin เท่านั้น credentials ของ Gateway แยกจาก user login เก็บ hash ฝั่ง server และหมุน/revoke ได้; Gateway scope ระบุ site/devices ที่อนุญาต ห้ามเชื่อถือ siteId ที่ client ส่ง

```json
{
  "schemaVersion": 1,
  "messageId": "gw-demo-000001",
  "gatewayId": "gw-demo",
  "sentAt": "2026-10-03T07:00:01Z",
  "samples": [
    {
      "sampleId": "meter-demo-000001",
      "deviceId": "meter-demo",
      "mappingVersionId": "map-energy-v1",
      "sourceTime": "2026-10-03T07:00:00Z",
      "rawValue": "6769.28",
      "rawPayload": {"registers": [0, 6769]}
    }
  ]
}
```

rawValue เป็น decimal string เพื่อเลี่ยง float precision; server mapping กำหนด semantic/unit/scale ไม่รับ unit override; rawPayload เป็น optional diagnostic จำกัดขนาดและไม่ให้มี secret ค่า register ในตัวอย่างเป็น illustrative ไม่ใช่ register map ของอุปกรณ์จริง ต้องตกลงว่าจะส่ง decoded value หรือ raw words ก่อน implement decoder

กำหนดเริ่มต้น batch ไม่เกิน 500 samples/256 KiB, cadence 60s configurable; schema validator ปฏิเสธ unknown version/nonfinite/invalid timestamps/device-mapping mismatch; ข้อผิดพลาดเชิงโครงสร้าง reject ทั้ง batch ไม่มี partial commit

ACK 202 หลัง durable DB commit พร้อม receiptId/messageId/status=accepted; แยก GET receipt status เพื่อบอก processed/rejected และเหตุผล ไม่ ACK ก่อนเก็บสำเร็จ duplicate gatewayId+messageId/body เดิมคืน receipt เดิม; messageId เดิมเนื้อหาเปลี่ยนคืน 409 มี per-sample identity unique gatewayId+sampleId เพื่อกัน resend ข้าม batch

Errors: 400 schema, 401 invalid credential, 403 outside scope, 409 identity conflict, 413 size, 429 rate limit + Retry-After, 503 storage unavailable ไม่เปิดเผย secret/raw stack

Gateway buffer ขณะ offline; retry 429/5xx/timeout ด้วย exponential backoff + jitter (1s ถึง 60s) และ message/sample ID เดิม; 400/403/409 ให้ quarantine ตรวจ config ห้ามวนส่งตลอด; backlog ส่ง sourceTime เดิม แต่ heartbeat ใช้เวลารับที่ server แยก lastReceivedAt กับ latestSourceTime เพื่อไม่ทำให้ sample เก่าดูเป็น live

MQTT หากยืนยันต้องใช้: topic solar/v1/gateways/{gatewayId}/telemetry, TLS 8883, QoS 1, no retained telemetry, credential/topic ACL per Gateway, และ ACK topic หลัง DB commit ผ่าน ingestion pipeline เดียวกัน

## 7. Historical record ฝั่งลูกค้า

- GET /api/v1/sites/:siteId/telemetry?deviceId=...&metric=...&from=...&to=...&resolution=raw|15m|hour|day|month พร้อม pagination/point limit; query interval [from,to)
- GET latest/dashboard แยกจาก history ชัดเจน; endpoint export CSV ใช้ authorization เดียวกัน มี timestamp/timezone/unit/quality และป้องกัน spreadsheet formula injection
- UI เลือกไซต์/อุปกรณ์/metric/ช่วงวันที่/ความละเอียด ดูกราฟและตาราง ดาวน์โหลด CSV แสดง missing/invalid/reset/estimated และเวลารับล่าสุด; customer read-only เฉพาะไซต์ที่ได้รับมอบหมาย
- average/min/max สำหรับ power/voltage/environment, cumulative energy ใช้ difference/reset detection ไม่ average meter counter; total/day derived จาก billing meter ที่กำหนด ห้ามรวม inverter กับ revenue meter ซ้ำ
- late data recompute aggregates เฉพาะช่วงที่ได้รับผลกระทบ; billing finalized snapshot คงเดิมและแก้ผ่าน adjustment; missing periods ไม่ถือเป็นผลิต 0
- RBAC + scope ตรวจบน server ทุก query/export/detail ไม่ใช้ header action หรือ UI filter เป็น source of authorization

## 8. LINE และ e-mail ผู้ดูแล

LINE Notify ยุติบริการ 31 มีนาคม 2025 ต้องใช้ LINE Official Account + Messaging API แทน checkbox ในระบบตัวอย่างไม่ได้พิสูจน์ว่าส่งสำเร็จ
แหล่งอ้างอิง: https://developers.line.biz/en/news/2025/04/01/line-notify/ และ https://developers.line.biz/en/docs/messaging-api/sending-messages/

- Rule: Gateway offline, device fault/vendor code, stale data, invalid reading, ingestion/notification failure พร้อม severity และ site scope; normalize Major/Minor เดิมเป็น internal severity แต่เก็บ sourceSeverity/code
- Alarm lifecycle open → acknowledged → resolved เก็บประวัติครบ; notify ตอน open/escalation/recovery และ reminders ที่ตั้งไว้ มี debounce/cooldown กัน flapping/flood
- Admin ตั้ง recipients ตาม site, channel, severity และ quiet hours; LINE user/group IDs ได้จาก OA webhook ที่ตรวจ signature; tokens/secrets ใน secret store ไม่แสดงใน web/log
- transaction สร้าง Alarm/Outbox พร้อมกัน; worker delivery แยก LINE/e-mail ต่อผู้รับ, retry transient/429, DLQ และ delivery attempts/provider ID
- แยก provider accepted กับ delivered ไม่แสดง delivered เมื่อเพียง HTTP success; email ใช้ SMTP TLS หรือ transactional provider พร้อม verified sender/SPF/DKIM/DMARC ตาม provider และ bounce feedback
- ข้อความประกอบ site/device/event/source time/last seen และ authorized dashboard link ห้ามส่ง credentials/raw payload; ทดลองส่งเฉพาะ recipients ที่ผู้ใช้อนุญาต

## 9. Roadmap และเกณฑ์ส่งมอบ

นี่เป็นลำดับงานสำหรับ review ไม่ใช่ implementation plan ที่ผ่าน approval แล้ว ขยายเป็น tasks/files/tests หลังยืนยัน protocol และ spec

| ระยะ | งาน | เกณฑ์ผ่านก่อนเดินต่อ |
|---|---|---|
| 0 Contract | payload จริง, metric/register/unit/scale, cadence, identity/retry, staging infrastructure, recipients | Gateway manager review contract + test cases; ไม่มีข้อกำหนด protocol ที่เดาเป็นข้อเท็จจริง |
| 1 Foundation | runtime lock, executable tests, DB migrations/repositories, auth/session/assignments, CRUD/audit | restart ไม่เสียข้อมูล, migration clean DB ผ่าน, login จริง, cross-site 403, CRUD บน UI สำเร็จ |
| 2 Gateway | credential provision, telemetry/heartbeat/receipt API, durable outbox/worker, mapping, simulator | ส่งจริง→ACK→sample persisted; duplicate ไม่เพิ่มแถว; invalid/cross-scope reject; retry/restart recovery ผ่าน |
| 3 History | rollups/quality/latest/history/export, real dashboard/customer UI | historical date/table/chart/CSV ตรง DB, Bangkok midnight และ reset/late/missing ผ่าน, customer isolation ผ่าน |
| 4 Alerts | rules/history/ack, scheduled stale checks, LINE/email adapters/retry/DLQ | offline/open/recovery ไปยัง test recipients, provider failures ไม่ทำข้อมูลหาย/แจ้งซ้ำโดยไร้ขอบเขต |
| 5 Deploy/UAT | Web/API/Worker images, staging HTTPS, private DB/Redis, CI/CD, logs/metrics, backup/restore | deploy clean env ได้, readiness ตรวจ connection จริง, backup restore ทดสอบ, Gateway UAT sign-off |
| 6 Full platform | contract/rate/billing/document/payment/report persistence/real APIs/UI ตาม spec 2026-09-01 | financial snapshot/numbering/payment idempotency, scope, generated docs และ end-to-end ผ่านก่อนประกาศทั้งระบบ production ready |

Gateway pilot สำเร็จไม่เท่ากับ Billing/เอกสารทั้งแพลตฟอร์มพร้อมใช้จริง ต้องบันทึก scope ของ release ชัดเจน

## 10. Deploy และชุดทดสอบรับมอบ Gateway

Staging ต้องมี domain/DNS/TLS, Web/API/Worker containers, pinned service versions, managed secrets, persistent volumes, private DB/Redis/storage; หากใช้ MQTT ต้อง TLS/ACL และปิด public management dashboard ไม่ใช้ dev credentials/Compose local เป็น production

CI ตรวจ lint + executable unit/integration + migration + build + E2E; readiness ใช้ dependency connections จริง เพราะ helper ปัจจุบันตรวจค่าการตั้งค่าเท่านั้น; deploy migrations เป็น single controlled step พร้อม backup และ release rollback ที่เข้ากับ schema

Monitoring: ingest rate/error/lag, DB capacity, oldest outbox/queue lag, gateway last received/source age, rollup lag, notifications failures; backup encrypted ตาม retention ที่อนุมัติ และทดสอบ restore ลง environment แยก

ชุดส่งมอบ manager: HTTPS base URL ที่ deploy จริง, credential ผ่านช่องทางปลอดภัย, gateway/device/mapping IDs, OpenAPI/Postman/curl sample, unit/register dictionary, rate limits/error codes/retry/ACK guide, contact และ test checklist ไม่ใส่ production secret ในเอกสาร

UAT ต้องผ่าน: valid sample บน live dashboard + history; identical resend และ overlapping batch ไม่ซ้ำ; wrong token 401; other gateway/device 403; conflicting identity 409; malformed/oversize 400/413; rate limit 429; DB down ไม่ ACK สำเร็จ; internet loss/restart/backlog recovery; source drift/reset/missing flags; customer A อ่าน/export B ไม่ได้; alarm open/recovery LINE/e-mail; provider down→retry/DLQ; restore backup แล้ว query history ได้

เสนอทดลอง Gateway จริงอย่างน้อย 24 ชั่วโมงและตรวจ offline/reconnect/วันเปลี่ยนตาม Bangkok ก่อน sign-off; throughput limits ปรับหลังทราบ devices × metrics × cadence จริง

## 11. สิ่งที่ต้องยืนยันก่อน implementation/deploy

1. ผู้จัดการ Gateway รองรับ HTTPS JSON หรือ MQTT, payload จริง, register map/หน่วย/scale/endianness และเวลาที่ส่ง
2. Hosting/domain และสิทธิ์ deploy staging, จำนวนไซต์/อุปกรณ์/metric/cadence เพื่อ sizing/retention
3. LINE OA/channel และ admin recipient IDs; e-mail provider/sender และรายชื่อผู้รับทดสอบ (ส่ง secrets ผ่าน secure configuration)
4. ยืนยัน scope ว่า Gateway pilot มาก่อน แล้วทำส่วนการเงินที่ยังเป็น prototype ต่อจนครบ

ตาม superpowers:brainstorming งานนี้เป็น architectural ต้อง review/approve design ก่อน implementation และ review implementation plan ก่อนเลือกวิธี execution รายงานนี้เป็นผลตรวจและข้อเสนอ ยังไม่แก้ product code และยังไม่ deploy
