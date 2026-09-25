# ADR 0005: Edge Gateway Telemetry Ingestion, Modbus Register Mapping & Field Commissioning

## Status
Accepted

## Context
ตาม Architecture Diagram แพลตฟอร์ม Solar Energy Monitoring & Billing Platform ต้องรองรับการเชื่อมต่อกับอุปกรณ์หน้างานจริงผ่าน Industrial Energy Gateway (เช่น CodeDee System ที่เชื่อมต่อ Modbus TCP กับมิเตอร์ PILOT SPM91, Huawei SmartLogger 3000A, และ Environmental Sensors) โดยเกตเวย์จะทำหน้าที่แปลงโปรโตคอลและส่งข้อมูล Telemetry ขึ้น Cloud ผ่าน MQTT/HTTPS

ก่อนหน้านี้ ระบบยังไม่มี Background Ingestion Service ที่คอยรับข้อมูลสดจาก MQTT Broker อย่างต่อเนื่อง รวมถึงตาราง `register_mapping_versions` รองรับเพียง Register Address เดี่ยว 16-bit ไม่สามารถรวม (Combine) คู่ Register 32-bit (เช่น Low Word + High Word) และยังไม่มีหน้าจอ Field Commissioning ให้ช่างหรือวิศวกรตรวจสอบค่า Raw Registers (R0..R12) ควบคู่กับค่าทางไฟฟ้าที่คำนวณได้จริง

## Decision
1. **Hybrid Telemetry Ingestion Pipeline**:
   - พัฒนา `MqttIngestionService` ใน `apps/api` ทำหน้าที่เชื่อมต่อ EMQX Broker และ Subscribe `energy/+/telemetry` และ `energy/+/+/telemetry` อัตโนมัติ
   - รองรับทั้ง **Raw Registers JSON** (`registers: { R0: 2, R1: 0, R2: 23081, ... }`) และ **Decoded Metrics JSON** (`metrics: { voltage: 230.81, current: 0.44, ... }`)
   - มี fallback HTTP Ingestion Endpoint (`POST /v1/telemetry/ingest`) สำหรับเกตเวย์ที่ส่งผ่าน HTTPS POST
2. **Modbus Register Engine & 32-bit Word Combining**:
   - เพิ่มโมดูล `register-decoder.ts` ใน `@solar/domain` รองรับการถอดรหัส Holding Registers:
     - 16-bit: `uint16`, `int16`
     - 32-bit: `uint32`, `int32`, `float32`
     - Word Order: `little_word_first` (CDAB, สเปกของ PILOT SPM91) และ `big_word_first` (ABCD)
     - Scale Factor & Signed Two's Complement
   - เพิ่มคอลัมน์ `register_count` และ `word_order` ในตาราง `register_mapping_versions`
3. **TimescaleDB Electrical Parameters Hypertable Schema**:
   - ขยาย `telemetry_raw` ให้บันทึกชุดพารามิเตอร์ไฟฟ้าครบทั้ง 8 ค่าในแถวเดียว (`voltage_v`, `current_a`, `active_power_w`, `apparent_power_va`, `reactive_power_var`, `frequency_hz`, `power_factor`, `total_energy_kwh`) ควบคู่กับ `raw_payload` (JSON)
   - ป้องกันข้อมูลซ้ำ (Idempotency) จากการ Burst ของ Local Offline Cache ด้วย `(ingestion_id, source_time)`
4. **Field Commissioning & Live Telemetry UI**:
   - เพิ่ม Preset **PILOT SPM91** และ **SevenSensor Weather Station** ในแม่แบบมิเตอร์
   - สร้างคอมโพเนนต์ `SiteTelemetryDialog` ใน Web Application แสดงการ์ด 8 พารามิเตอร์ไฟฟ้าเรียลไทม์ และตาราง **Raw Registers (R0..R12)** ตรงตามหน้าจอของ Industrial Energy Gateway
   - เพิ่มเครื่องมือ Interactive Test Decode ให้ช่างหน้างานทดสอบถอดรหัสคู่ Register ได้ทันที
5. **User Roles Expansion**:
   - ปรับปรุง Role Check Constraint ในฐานข้อมูลให้รองรับ 5 บทบาทตาม Architecture Diagram: `owner`, `admin`, `operator`, `accountant`, `school_user`

## Consequences
- ระบบ Cloud Ingestion สามารถรับและถอดรหัสข้อมูลจากเกตเวย์หน้างานจริงได้ถูกต้องแบบ Real-time (1s - 15s)
- ช่างและวิศวกรสามารถ Verify ข้อมูลผ่านหน้าจอ Web ได้ทันทีว่าค่ามิเตอร์หน้างานตรงกับค่าในระบบ Cloud หรือไม่
- ข้อมูลการผลิตสะสม (`total_energy_kwh`) และกำลังผลิต (`active_power_w`) ถูกประมวลผลลง `telemetry_aggregate` อัตโนมัติสำหรับการออกบิลตามสัญญา (PPA Billing)
