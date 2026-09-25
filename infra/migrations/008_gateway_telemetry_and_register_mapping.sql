-- Migration 008: Edge Gateway Telemetry Ingestion, Register Mapping and Roles Expansion

-- 1. Expand user roles to include operator and accountant
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('owner', 'admin', 'operator', 'accountant', 'school_user'));

-- 2. Add electrical parameter columns to telemetry_raw
ALTER TABLE telemetry_raw ADD COLUMN IF NOT EXISTS voltage_v numeric(10,2);
ALTER TABLE telemetry_raw ADD COLUMN IF NOT EXISTS current_a numeric(10,3);
ALTER TABLE telemetry_raw ADD COLUMN IF NOT EXISTS active_power_w numeric(12,2);
ALTER TABLE telemetry_raw ADD COLUMN IF NOT EXISTS apparent_power_va numeric(12,2);
ALTER TABLE telemetry_raw ADD COLUMN IF NOT EXISTS reactive_power_var numeric(12,2);
ALTER TABLE telemetry_raw ADD COLUMN IF NOT EXISTS frequency_hz numeric(6,2);
ALTER TABLE telemetry_raw ADD COLUMN IF NOT EXISTS power_factor numeric(5,3);
ALTER TABLE telemetry_raw ADD COLUMN IF NOT EXISTS total_energy_kwh numeric(20,4);
ALTER TABLE telemetry_raw ALTER COLUMN mapping_version_id DROP NOT NULL;

-- 3. Extend register_mapping_versions to support multi-register and word order
ALTER TABLE register_mapping_versions ADD COLUMN IF NOT EXISTS register_count integer NOT NULL DEFAULT 1;
ALTER TABLE register_mapping_versions ADD COLUMN IF NOT EXISTS word_order text NOT NULL DEFAULT 'little_word_first';

-- 4. Insert / Upsert PILOT SPM91 Preset and SevenSensor Weather Station Preset
INSERT INTO meter_presets (id, brand, model, device_type, registers, created_at, updated_at)
VALUES
  (
    '00000000-0000-0000-0000-000000000051',
    'PILOT',
    'SPM91',
    'meter',
    '[
      {"semanticField": "total_energy", "nameTh": "พลังงานไฟฟ้ารวม (Total Active Energy)", "registerAddress": "R0", "registerCount": 2, "wordOrder": "little_word_first", "dataType": "uint32", "scale": 0.1, "unit": "kWh"},
      {"semanticField": "voltage", "nameTh": "แรงดันไฟฟ้า (Voltage)", "registerAddress": "R2", "registerCount": 1, "wordOrder": "little_word_first", "dataType": "uint16", "scale": 0.01, "unit": "V"},
      {"semanticField": "current", "nameTh": "กระแสไฟฟ้า (Current)", "registerAddress": "R3", "registerCount": 2, "wordOrder": "little_word_first", "dataType": "uint32", "scale": 0.001, "unit": "A"},
      {"semanticField": "active_power", "nameTh": "กำลังไฟฟ้าจริง (Active Power)", "registerAddress": "R5", "registerCount": 2, "wordOrder": "little_word_first", "dataType": "int32", "scale": 0.1, "unit": "W"},
      {"semanticField": "apparent_power", "nameTh": "กำลังไฟฟ้าปรากฏ (Apparent Power)", "registerAddress": "R7", "registerCount": 2, "wordOrder": "little_word_first", "dataType": "uint32", "scale": 0.1, "unit": "VA"},
      {"semanticField": "reactive_power", "nameTh": "กำลังไฟฟ้ารีแอคทีฟ (Reactive Power)", "registerAddress": "R9", "registerCount": 2, "wordOrder": "little_word_first", "dataType": "int32", "scale": 0.1, "unit": "var"},
      {"semanticField": "frequency", "nameTh": "ความถี่ (Frequency)", "registerAddress": "R11", "registerCount": 1, "wordOrder": "little_word_first", "dataType": "uint16", "scale": 0.01, "unit": "Hz"},
      {"semanticField": "power_factor", "nameTh": "เพาเวอร์แฟกเตอร์ (Power Factor)", "registerAddress": "R12", "registerCount": 1, "wordOrder": "little_word_first", "dataType": "int16", "scale": 0.001, "unit": ""}
    ]'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000052',
    'SevenSensor',
    '3S-Compact',
    'environmental_sensor',
    '[
      {"semanticField": "irradiance", "nameTh": "ความเข้มแสงอาทิตย์ (Solar Irradiance)", "registerAddress": "0x0000", "registerCount": 1, "wordOrder": "big_word_first", "dataType": "uint16", "scale": 1.0, "unit": "W/m²"},
      {"semanticField": "ambient_temp", "nameTh": "อุณหภูมิโดยรอบ (Ambient Temperature)", "registerAddress": "0x0001", "registerCount": 1, "wordOrder": "big_word_first", "dataType": "int16", "scale": 0.1, "unit": "°C"},
      {"semanticField": "module_temp", "nameTh": "อุณหภูมิแผงโซลาร์ (Module Temperature)", "registerAddress": "0x0002", "registerCount": 1, "wordOrder": "big_word_first", "dataType": "int16", "scale": 0.1, "unit": "°C"},
      {"semanticField": "wind_speed", "nameTh": "ความเร็วลม (Wind Speed)", "registerAddress": "0x0003", "registerCount": 1, "wordOrder": "big_word_first", "dataType": "uint16", "scale": 0.1, "unit": "m/s"}
    ]'::jsonb,
    now(),
    now()
  )
ON CONFLICT (brand, model) DO UPDATE
SET registers = EXCLUDED.registers,
    device_type = EXCLUDED.device_type,
    updated_at = now();
