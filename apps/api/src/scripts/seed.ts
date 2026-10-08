import { createHash, randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { S3Client, CreateBucketCommand, PutObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";

config({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });
import { loadEnv } from "@solar/domain";
import { AuthService } from "../modules/identity/auth.service.js";

const env = loadEnv(process.env);
if (env.NODE_ENV === "production") throw new Error("Refusing to load demo seed in production");
const pool = new Pool({ connectionString: env.DATABASE_URL });
const id = (key: string) =>
  createHash("sha256")
    .update(`solar-demo:${key}`)
    .digest("hex")
    .slice(0, 32)
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");

async function insertMany(
  client: PoolClient,
  table: string,
  columns: string[],
  rows: unknown[][],
  chunk = 500
) {
  for (let start = 0; start < rows.length; start += chunk) {
    const batch = rows.slice(start, start + chunk);
    const values: unknown[] = [];
    const placeholders = batch
      .map(
        (row, rowIndex) =>
          `(${row
            .map((value, colIndex) => {
              values.push(value);
              return `$${rowIndex * columns.length + colIndex + 1}`;
            })
            .join(",")})`
      )
      .join(",");
    await client.query(`INSERT INTO ${table} (${columns.join(",")}) VALUES ${placeholders}`, values);
  }
}

const regions = ["ภาคกลาง", "ภาคตะวันออกเฉียงเหนือ", "ภาคเหนือ", "ภาคตะวันออก", "ภาคใต้"];
const schoolNames = [
  "โรงเรียนบ้านคลองแสน",
  "โรงเรียนบ้านไผ่เมือง",
  "โรงเรียนเทศบาลหนองยาง",
  "โรงเรียนอนุบาลสาธิต",
  "โรงเรียนบ้านดอนแก้ว",
  "โรงเรียนวัดเขาดิน",
  "โรงเรียนเทศบาลเมืองใหม่",
  "โรงเรียนบ้านทุ่งยาว",
  "โรงเรียนประชารัฐวิทยา",
  "โรงเรียนบ้านหนองบัว",
  "โรงเรียนอนุบาลริมคลอง",
  "โรงเรียนเทศบาลบ้านสวน",
];

// Dynamic reference time: current moment
const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth(); // 0-indexed
const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

// Compute previous month date strings
const prevMonthDate = new Date(currentYear, currentMonth - 1, 1);
const prevMonthYear = prevMonthDate.getFullYear();
const prevMonthNum = prevMonthDate.getMonth() + 1;
const prevMonthStartStr = `${prevMonthYear}-${String(prevMonthNum).padStart(2, "0")}-01`;
const prevMonthLastDay = new Date(prevMonthYear, prevMonthNum, 0).getDate();
const prevMonthEndStr = `${prevMonthYear}-${String(prevMonthNum).padStart(2, "0")}-${String(prevMonthLastDay).padStart(2, "0")}`;

// Compute current month date strings
const currMonthNum = currentMonth + 1;
const currMonthStartStr = `${currentYear}-${String(currMonthNum).padStart(2, "0")}-01`;
const currMonthLastDay = new Date(currentYear, currMonthNum, 0).getDate();
const currMonthEndStr = `${currentYear}-${String(currMonthNum).padStart(2, "0")}-${String(currMonthLastDay).padStart(2, "0")}`;

// Target periods for 3 years: 2024, 2025, 2026
const targetPeriods: Array<{
  year: number;
  month: number;
  startStr: string;
  endStr: string;
  cutoff: Date;
  isCurrentMonth: boolean;
  isPrevMonth: boolean;
}> = [];

for (const y of [2024, 2025, 2026]) {
  const maxMonth = y === currentYear ? currMonthNum : 12;
  for (let m = 1; m <= maxMonth; m++) {
    const startStr = `${y}-${String(m).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const endStr = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const cutoff = new Date(`${endStr}T16:59:59.999Z`);
    const isCurrent = y === currentYear && m === currMonthNum;
    const isPrev = y === currentYear && m === currMonthNum - 1;
    targetPeriods.push({
      year: y,
      month: m,
      startStr,
      endStr,
      cutoff,
      isCurrentMonth: isCurrent,
      isPrevMonth: isPrev,
    });
  }
}

console.log(`[Seed] Target periods: 2024-2026 (${targetPeriods.length} monthly cycles across 18 sites)`);

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(
    "TRUNCATE telemetry_raw, telemetry_aggregate, alerts, payments, documents, billing_cycles, rate_versions, contracts, billing_meters, register_mapping_versions, devices, gateways, sites, users, schools, meter_presets, audit_events CASCADE"
  );

  // 1. Schools
  const schools = schoolNames.map((name, i) => [
    id(`school-${i}`),
    name,
    `SCH-${String(i + 1).padStart(3, "0")}`,
    regions[i % regions.length],
    "active",
  ]);
  await insertMany(client, "schools", ["id", "name", "code", "region", "status"], schools);

  // 2. Users
  const auth = new AuthService(env.JWT_ACCESS_SECRET, env.JWT_REFRESH_SECRET);
  const defaultPasswordHash = auth.hashPassword("Password1234");
  const users = [
    [id("user-admin-main"), "admin@solar-roof.com", "Admin User", "owner", "active", null, defaultPasswordHash, "th", "system"],
    [id("user-owner"), "owner@solar.local", "Solar Roof Owner", "owner", "active", null, defaultPasswordHash, "th", "system"],
    ...schoolNames.slice(0, 3).map((_, i) => [
      id(`user-admin-${i}`),
      `admin${i + 1}@solar.local`,
      `ช่างเทคนิค ${i + 1}`,
      "admin",
      "active",
      null,
      defaultPasswordHash,
      "th",
      "system",
    ]),
    ...schoolNames.flatMap((_, i) =>
      [0, 1].map((j) => [
        id(`user-school-${i}-${j}`),
        `school${i + 1}.${j + 1}@school.local`,
        `${schoolNames[i]} เจ้าหน้าที่ ${j + 1}`,
        "school_user",
        "active",
        id(`school-${i}`),
        defaultPasswordHash,
        "th",
        "system",
      ])
    ),
  ];
  await insertMany(
    client,
    "users",
    ["id", "email", "display_name", "role", "status", "school_id", "password_hash", "preferred_language", "preferred_theme"],
    users
  );

  // 3. Sites, Gateways, Devices, Register Mappings, Billing Meters, Contracts, Rates
  const sites: unknown[][] = [];
  const gateways: unknown[][] = [];
  const devices: unknown[][] = [];
  const mappings: unknown[][] = [];
  const meters: unknown[][] = [];
  const contracts: unknown[][] = [];
  const rates: unknown[][] = [];

  for (let i = 0; i < 18; i++) {
    const schoolIndex = i % schoolNames.length;
    const siteId = id(`site-${i}`);
    const gatewayId = id(`gateway-${i}`);
    const meterId = id(`meter-${i}`);
    const deviceId = id(`device-${i}-meter`);
    const inverterId = id(`device-${i}-inverter`);
    const contractId = id(`contract-${i}`);
    const rateId = id(`rate-${i}`);
    const capacity = Number((0.48 + (i % 6) * 0.17).toFixed(4));

    sites.push([
      siteId,
      id(`school-${schoolIndex}`),
      `Solar Site ${String(i + 1).padStart(3, "0")}`,
      capacity,
      "Asia/Bangkok",
      i === 7 ? "degraded" : "online",
      13.7563 + (i % 6) * 0.62,
      100.5018 + (i % 6) * 0.48,
    ]);

    gateways.push([
      gatewayId,
      siteId,
      `GW-${String(i + 1).padStart(3, "0")}`,
      i % 3 === 0 ? "mqtt" : "modbus-tcp",
      `energy/site${String(i + 1).padStart(3, "0")}/telemetry`,
      i === 7 ? "degraded" : "online",
      new Date(now.getTime() - (i === 7 ? 9 : 1) * 60 * 1000),
    ]);

    devices.push(
      [
        deviceId,
        gatewayId,
        siteId,
        `Billing Meter ${String(i + 1).padStart(3, "0")}`,
        "meter",
        "Schneider PM5560",
        `MTR-${String(i + 1).padStart(4, "0")}`,
        1,
        "online",
      ],
      [
        inverterId,
        gatewayId,
        siteId,
        `Inverter ${String(i + 1).padStart(3, "0")}`,
        "inverter",
        "Huawei SUN2000",
        `INV-${String(i + 1).padStart(4, "0")}`,
        2,
        i === 7 ? "degraded" : "online",
      ]
    );

    // Register mappings for both total_energy and energy_export_kwh
    mappings.push(
      [
        id(`mapping-${i}-total`),
        deviceId,
        "total_energy",
        "3204",
        "uint32",
        false,
        "big-endian",
        0.01,
        "kWh",
        60,
        JSON.stringify({ min: 0, max: 99999999, maxAgeSeconds: 180 }),
        new Date("2026-01-01T00:00:00Z"),
      ],
      [
        id(`mapping-${i}-export`),
        deviceId,
        "energy_export_kwh",
        "3030",
        "uint32",
        false,
        "big-endian",
        0.01,
        "kWh",
        60,
        JSON.stringify({ min: 0, max: 99999999, maxAgeSeconds: 180 }),
        new Date("2026-01-01T00:00:00Z"),
      ]
    );

    meters.push([meterId, siteId, deviceId, "total_energy", true]);

    // Contracts table: site_id, version, start_date, end_date, status, payment_terms, signer_name, attachment_key (NO school_id)
    contracts.push([
      contractId,
      siteId,
      1,
      "2024-01-01",
      null,
      "active",
      "ชำระภายใน 30 วัน",
      "Solar Roof Owner",
      `contracts/CTR-2024-${String(i + 1).padStart(4, "0")}.pdf`,
    ]);

    rates.push([
      rateId,
      contractId,
      "2024-01-01",
      null,
      "fixed_kwh",
      Number((4.05 + (i % 5) * 0.04).toFixed(2)),
      "THB",
    ]);
  }

  await insertMany(client, "sites", ["id", "school_id", "name", "capacity_mwp", "timezone", "status", "latitude", "longitude"], sites);
  await insertMany(client, "gateways", ["id", "site_id", "name", "protocol", "endpoint", "status", "last_seen_at"], gateways);
  await insertMany(client, "devices", ["id", "gateway_id", "site_id", "name", "device_type", "model", "serial_number", "slave_id", "status"], devices);
  await insertMany(
    client,
    "register_mapping_versions",
    ["id", "device_id", "semantic_field", "register_address", "data_type", "signed", "byte_order", "scale", "unit", "polling_interval_seconds", "quality_rule", "effective_from"],
    mappings
  );
  await insertMany(client, "billing_meters", ["id", "site_id", "device_id", "semantic_field", "active"], meters);
  await insertMany(
    client,
    "contracts",
    ["id", "site_id", "version", "start_date", "end_date", "status", "payment_terms", "signer_name", "attachment_key"],
    contracts
  );
  await insertMany(client, "rate_versions", ["id", "contract_id", "effective_from", "effective_to", "rate_type", "rate", "currency"], rates);

  // 4. Meter Presets
  const presets = [
    [
      id("preset-1"),
      "Schneider Electric",
      "PM5560",
      "meter",
      JSON.stringify([
        { semanticField: "voltage", nameTh: "แรงดันไฟฟ้า (Voltage Line-Neutral)", registerAddress: "3028", dataType: "float32", byteOrder: "ABCD", scale: 1.0, unit: "V" },
        { semanticField: "current", nameTh: "กระแสไฟฟ้า (Current)", registerAddress: "3000", dataType: "float32", byteOrder: "ABCD", scale: 1.0, unit: "A" },
        { semanticField: "active_power", nameTh: "กำลังไฟฟ้าจริง (Active Power)", registerAddress: "3060", dataType: "float32", byteOrder: "ABCD", scale: 0.001, unit: "kW" },
        { semanticField: "total_energy", nameTh: "พลังงานไฟฟ้ารวมสะสม (Total Active Energy)", registerAddress: "3204", dataType: "int64", byteOrder: "ABCD", scale: 0.001, unit: "kWh" },
      ]),
      now,
      now,
    ],
    [
      id("preset-2"),
      "Eastron",
      "SDM630-Modbus-V2",
      "meter",
      JSON.stringify([
        { semanticField: "voltage", nameTh: "แรงดันไฟฟ้า (Line to Neutral Volts)", registerAddress: "30001", dataType: "float32", byteOrder: "ABCD", scale: 1.0, unit: "V" },
        { semanticField: "current", nameTh: "กระแสไฟฟ้า (Current Amps)", registerAddress: "30007", dataType: "float32", byteOrder: "ABCD", scale: 1.0, unit: "A" },
        { semanticField: "active_power", nameTh: "กำลังไฟฟ้า (Total System Power)", registerAddress: "30053", dataType: "float32", byteOrder: "ABCD", scale: 0.001, unit: "kW" },
        { semanticField: "total_energy", nameTh: "พลังงานไฟฟ้ารวม (Total Imported Energy)", registerAddress: "30343", dataType: "float32", byteOrder: "ABCD", scale: 1.0, unit: "kWh" },
      ]),
      now,
      now,
    ],
    [
      id("preset-3"),
      "Acrel",
      "ADW200-MultiCircuit",
      "meter",
      JSON.stringify([
        { semanticField: "voltage", nameTh: "แรงดัน (Voltage Line-Neutral)", registerAddress: "0001H", dataType: "uint16", byteOrder: "AB", scale: 0.1, unit: "V" },
        { semanticField: "current", nameTh: "กระแส (Current)", registerAddress: "0007H", dataType: "uint16", byteOrder: "AB", scale: 0.01, unit: "A" },
        { semanticField: "active_power", nameTh: "กำลังไฟฟ้า (Active Power)", registerAddress: "0013H", dataType: "int32", byteOrder: "ABCD", scale: 0.001, unit: "kW" },
        { semanticField: "total_energy", nameTh: "พลังงานรวม (Total Active Energy)", registerAddress: "0030H", dataType: "uint32", byteOrder: "ABCD", scale: 0.01, unit: "kWh" },
      ]),
      now,
      now,
    ],
    [
      id("preset-4"),
      "Huawei",
      "SUN2000-SmartLogger",
      "smart_logger",
      JSON.stringify([
        { semanticField: "voltage", nameTh: "แรงดันไฟฟ้า (Phase A-B)", registerAddress: "32069", dataType: "uint16", byteOrder: "AB", scale: 0.1, unit: "V" },
        { semanticField: "current", nameTh: "กระแสไฟฟ้า (Phase A)", registerAddress: "32072", dataType: "int32", byteOrder: "ABCD", scale: 0.01, unit: "A" },
        { semanticField: "active_power", nameTh: "กำลังไฟฟ้าจริง (Active Power)", registerAddress: "32080", dataType: "int32", byteOrder: "ABCD", scale: 0.001, unit: "kW" },
        { semanticField: "total_energy", nameTh: "พลังงานไฟฟ้ารวมสะสม (Total Energy)", registerAddress: "32106", dataType: "uint32", byteOrder: "ABCD", scale: 0.01, unit: "kWh" },
      ]),
      now,
      now,
    ],
  ];
  await insertMany(client, "meter_presets", ["id", "brand", "model", "device_type", "registers", "created_at", "updated_at"], presets);

  // 5. Telemetry Raw & Telemetry Aggregate
  const raw: unknown[][] = [];
  const aggregates: unknown[][] = [];

  // Step in 15-minute increments across 7 days up to now
  const totalSteps = Math.floor((now.getTime() - start.getTime()) / (15 * 60_000));

  for (let siteIndex = 0; siteIndex < 18; siteIndex++) {
    const siteId = id(`site-${siteIndex}`);
    const deviceId = id(`device-${siteIndex}-meter`);
    const mappingIdTotal = id(`mapping-${siteIndex}-total`);
    const mappingIdExport = id(`mapping-${siteIndex}-export`);
    const capacity = 0.48 + (siteIndex % 6) * 0.17;
    let cumulative = 5000 + siteIndex * 150;

    // Maps to track interval generations
    // 15m stores cumulative reading; hour, day, month store delta production (kWh)
    const cumulative15Map = new Map<number, { time: Date; value: number }>();
    const deltaHourMap = new Map<string, { time: Date; delta: number; count: number }>();
    const deltaDayMap = new Map<string, { time: Date; delta: number; count: number }>();
    let monthDelta = 0;

    for (let step = 0; step < totalSteps; step++) {
      const stepTime = new Date(start.getTime() + step * 15 * 60_000);
      const bkkHour = (stepTime.getUTCHours() + 7) % 24;
      const daylight = Math.max(0, Math.sin(((bkkHour - 6) / 12) * Math.PI));
      const noise = ((step * 17 + siteIndex * 13) % 19 - 9) / 100;
      const intervalProduction = Math.max(0.01, (capacity * 1000 * daylight * 0.25) * (1 + noise));

      cumulative += intervalProduction;
      monthDelta += intervalProduction;

      const quality =
        siteIndex === 7 && step % 97 === 0 ? "partial" : siteIndex === 11 && step % 211 === 0 ? "invalid" : "complete";

      // Insert raw point for total_energy
      raw.push([
        randomUUID(),
        deviceId,
        mappingIdTotal,
        siteId,
        stepTime,
        new Date(stepTime.getTime() + 1200),
        JSON.stringify({ R0: Math.floor(cumulative * 100), R1: 0 }),
        "total_energy",
        cumulative,
        "kWh",
        quality,
        `demo-tot-${siteIndex}-${step}`,
      ]);

      // Insert raw point for energy_export_kwh
      raw.push([
        randomUUID(),
        deviceId,
        mappingIdExport,
        siteId,
        stepTime,
        new Date(stepTime.getTime() + 1200),
        JSON.stringify({ R0: Math.floor(cumulative * 100), R1: 0 }),
        "energy_export_kwh",
        cumulative,
        "kWh",
        quality,
        `demo-exp-${siteIndex}-${step}`,
      ]);

      // 15m cumulative tracking
      cumulative15Map.set(step, { time: stepTime, value: cumulative });

      // Hour delta tracking
      const hourKey = `${stepTime.toISOString().slice(0, 13)}:00:00.000Z`;
      const curH = deltaHourMap.get(hourKey) ?? { time: new Date(hourKey), delta: 0, count: 0 };
      curH.delta += intervalProduction;
      curH.count += 1;
      deltaHourMap.set(hourKey, curH);

      // Day delta tracking
      const dayKey = `${stepTime.toISOString().slice(0, 10)}T00:00:00.000Z`;
      const curD = deltaDayMap.get(dayKey) ?? { time: new Date(dayKey), delta: 0, count: 0 };
      curD.delta += intervalProduction;
      curD.count += 1;
      deltaDayMap.set(dayKey, curD);
    }

    // Build 15m aggregates (cumulative value for ranking & site-map max-min)
    for (const [, entry] of cumulative15Map) {
      for (const field of ["total_energy", "energy_export_kwh"]) {
        aggregates.push([
          randomUUID(),
          siteId,
          deviceId,
          field,
          "15m",
          entry.time,
          entry.value,
          15,
          "complete",
        ]);
      }
    }

    // Build hour aggregates (delta value for hourly production chart)
    for (const [, entry] of deltaHourMap) {
      for (const field of ["total_energy", "energy_export_kwh"]) {
        aggregates.push([
          randomUUID(),
          siteId,
          deviceId,
          field,
          "hour",
          entry.time,
          Number(entry.delta.toFixed(2)),
          entry.count,
          "complete",
        ]);
      }
    }

    // Build day aggregates (delta value for daily production chart & operations summary)
    for (const [, entry] of deltaDayMap) {
      for (const field of ["total_energy", "energy_export_kwh"]) {
        aggregates.push([
          randomUUID(),
          siteId,
          deviceId,
          field,
          "day",
          entry.time,
          Number(entry.delta.toFixed(2)),
          entry.count,
          "complete",
        ]);
      }
    }

    // Build month aggregates for all months in targetPeriods (2024, 2025, 2026)
    for (const period of targetPeriods) {
      const monthStart = new Date(Date.UTC(period.year, period.month - 1, 1));
      const monthFactor = 1 + 0.15 * Math.sin(((period.month - 2) / 12) * 2 * Math.PI);
      const yearGrowth = 1 + (period.year - 2024) * 0.03;
      const siteVariance = 1 + ((siteIndex * 7) % 11 - 5) / 100;
      const monthlyKwh = Math.round((3200 + siteIndex * 120) * monthFactor * yearGrowth * siteVariance);
      const val = period.isCurrentMonth ? monthDelta : monthlyKwh;
      for (const field of ["total_energy", "energy_export_kwh"]) {
        aggregates.push([
          randomUUID(),
          siteId,
          deviceId,
          field,
          "month",
          monthStart,
          Number(val.toFixed(2)),
          period.isCurrentMonth ? totalSteps : 2880,
          siteIndex === 11 ? "partial" : "complete",
        ]);
      }
    }

    // Build historical day aggregates for 2026 (from 2026-01-01 to start of 7-day raw window)
    const year2026Start = new Date(Date.UTC(2026, 0, 1)).getTime();
    const daysPriorToWindow = Math.floor((start.getTime() - year2026Start) / (24 * 3600 * 1000));
    for (let d = 0; d < daysPriorToWindow; d++) {
      const dayDate = new Date(year2026Start + d * 24 * 3600 * 1000);
      const mIdx = dayDate.getUTCMonth();
      const monthFactor = 1 + 0.15 * Math.sin(((mIdx - 1) / 12) * 2 * Math.PI);
      const dailyKwh = Math.round(((3200 + siteIndex * 120) / 30) * monthFactor * (1 + ((d * 7 + siteIndex * 3) % 9 - 4) / 50));
      for (const field of ["total_energy", "energy_export_kwh"]) {
        aggregates.push([
          randomUUID(),
          siteId,
          deviceId,
          field,
          "day",
          dayDate,
          Number(dailyKwh.toFixed(2)),
          96,
          "complete",
        ]);
      }
    }
  }

  await insertMany(
    client,
    "telemetry_raw",
    ["id", "device_id", "mapping_version_id", "site_id", "source_time", "received_time", "raw_payload", "semantic_field", "normalized_value", "unit", "quality", "ingestion_id"],
    raw,
    250
  );
  await insertMany(
    client,
    "telemetry_aggregate",
    ["id", "site_id", "device_id", "semantic_field", "bucket", "bucket_start", "value", "sample_count", "quality"],
    aggregates,
    500
  );

  // 6. Billing Cycles, Documents, and Payments for 2024-2026
  const billing: unknown[][] = [];
  const documents: unknown[][] = [];
  const payments: unknown[][] = [];
  const s3UploadTasks: Array<{ key: string; type: "pdf" | "jpg" }> = [];

  // Helper to add mock files to S3 upload queue
  function queueUpload(key: string, type: "pdf" | "jpg") {
    s3UploadTasks.push({ key, type });
  }

  // Queue contracts
  for (let i = 0; i < 18; i++) {
    queueUpload(`contracts/CTR-2024-${String(i + 1).padStart(4, "0")}.pdf`, "pdf");
  }

  const cumulativeEnergyBySite = new Map<number, number>();
  for (let i = 0; i < 18; i++) {
    cumulativeEnergyBySite.set(i, 20000 + i * 1500);
  }

  let docGlobalIndex = 1;

  for (const period of targetPeriods) {
    for (let i = 0; i < 18; i++) {
      const siteId = id(`site-${i}`);
      const cycleId = period.isCurrentMonth
        ? id(`billing-${i}-curr`)
        : period.isPrevMonth
        ? id(`billing-${i}-prev`)
        : id(`billing-${i}-${period.year}-${period.month}`);

      const rate = Number((4.05 + (i % 5) * 0.04).toFixed(2));
      const monthFactor = 1 + 0.15 * Math.sin(((period.month - 2) / 12) * 2 * Math.PI);
      const yearGrowth = 1 + (period.year - 2024) * 0.03;
      const siteVariance = 1 + ((i * 7) % 11 - 5) / 100;
      const consumedKwh = Math.round((3200 + i * 120) * monthFactor * yearGrowth * siteVariance);
      const amount = Number((consumedKwh * rate).toFixed(2));

      const openingEnergy = cumulativeEnergyBySite.get(i)!;
      const closingEnergy = openingEnergy + consumedKwh;
      cumulativeEnergyBySite.set(i, closingEnergy);

      let status = "approved";
      let quality = "complete";
      let paymentStatus: "paid" | "pending" | null = "paid";

      if (period.isCurrentMonth) {
        status = i < 10 ? "approved" : i < 15 ? "pending_review" : "draft";
        quality = i === 11 ? "invalid" : "complete";
        paymentStatus = i < 10 ? "paid" : i < 15 ? "pending" : null;
      } else if (period.isPrevMonth) {
        status = i < 12 ? "approved" : i < 16 ? "pending_review" : "draft";
        quality = i === 11 ? "invalid" : i === 7 ? "partial" : "complete";
        paymentStatus = i < 12 ? "paid" : i < 16 ? "pending" : null;
      } else {
        // Historical closed months (2024, 2025, Jan-Jul 2026): all approved and paid
        status = "approved";
        quality = "complete";
        paymentStatus = "paid";
      }

      billing.push([
        cycleId,
        siteId,
        period.startStr,
        period.endStr,
        period.cutoff,
        status,
        quality,
        openingEnergy,
        closingEnergy,
        consumedKwh,
        rate,
        amount,
      ]);

      const docNumStr = String(docGlobalIndex).padStart(6, "0");
      docGlobalIndex++;
      const invoiceNum = `INV-${period.year}-${docNumStr}`;
      const invoiceKey = `documents/invoices/${invoiceNum}.pdf`;

      documents.push([
        id(`invoice-${i}-${period.year}-${period.month}`),
        siteId,
        cycleId,
        "invoice",
        invoiceNum,
        status === "draft" ? "draft" : "issued",
        period.endStr,
        amount,
        invoiceKey,
      ]);

      // Only queue upload for current & previous month to keep S3 fast
      if (period.isCurrentMonth || period.isPrevMonth) {
        queueUpload(invoiceKey, "pdf");
      }

      if (paymentStatus === "paid") {
        const evidenceKey = `evidence/payments/${period.year}-${period.month}-site-${i + 1}.jpg`;
        payments.push([
          id(`payment-${i}-${period.year}-${period.month}`),
          cycleId,
          "paid",
          new Date(`${period.endStr}T12:00:00Z`),
          evidenceKey,
          "ชำระเงินเรียบร้อย ตรวจสอบใบเสร็จแล้ว",
        ]);

        const receiptNum = `RCT-${period.year}-${docNumStr}`;
        const receiptKey = `documents/receipts/${receiptNum}.pdf`;
        documents.push([
          id(`receipt-${i}-${period.year}-${period.month}`),
          siteId,
          cycleId,
          "receipt",
          receiptNum,
          "paid",
          period.endStr,
          amount,
          receiptKey,
        ]);

        if (period.isCurrentMonth || period.isPrevMonth) {
          queueUpload(evidenceKey, "jpg");
          queueUpload(receiptKey, "pdf");
        }
      } else if (paymentStatus === "pending") {
        payments.push([
          id(`payment-${i}-${period.year}-${period.month}`),
          cycleId,
          "pending",
          null,
          null,
          "รอการแจ้งชำระเงินจากทางโรงเรียน",
        ]);
      }
    }
  }

  await insertMany(
    client,
    "billing_cycles",
    ["id", "site_id", "period_start", "period_end", "cutoff_time", "status", "quality", "opening_energy", "closing_energy", "consumed_kwh", "rate", "amount"],
    billing
  );
  await insertMany(
    client,
    "documents",
    ["id", "site_id", "billing_cycle_id", "document_type", "document_number", "status", "issue_date", "amount", "file_key"],
    documents
  );
  await insertMany(
    client,
    "payments",
    ["id", "billing_cycle_id", "status", "paid_at", "evidence_key", "note"],
    payments
  );

  // 7. Alerts
  const alerts = [
    [
      id("alert-1"),
      id("site-0"),
      id("gateway-0"),
      "warning",
      "Gateway latency สูงกว่าเกณฑ์ปกติ",
      "Gateway GW-001 มีค่า Ping latency เฉลี่ย 1,450ms เกินกว่าเกณฑ์ 500ms",
      "open",
      new Date(now.getTime() - 2 * 3_600_000),
    ],
    [
      id("alert-2"),
      id("site-7"),
      id("gateway-7"),
      "critical",
      "อุปกรณ์ Inverter ขัดข้อง (Degraded)",
      "Inverter 008 รายงานสถานะ Degraded กำลังผลิตลดลง 40%",
      "open",
      new Date(now.getTime() - 4 * 3_600_000),
    ],
    [
      id("alert-3"),
      id("site-3"),
      id("gateway-3"),
      "info",
      "อัปเดต Firmware เกตเวย์สำเร็จ",
      "Gateway GW-004 อัปเดตเฟิร์มแวร์เป็น v2.4.1 สมบูรณ์",
      "resolved",
      new Date(now.getTime() - 14 * 3_600_000),
    ],
    [
      id("alert-4"),
      id("site-11"),
      id("gateway-11"),
      "warning",
      "ตรวจพบข้อมูลคุณภาพผิดปกติ (Invalid Reading)",
      "Meter 012 ส่งค่า Register 3204 ผิดเพี้ยนระหว่างเวลา 08:30-08:45",
      "acknowledged",
      new Date(now.getTime() - 22 * 3_600_000),
    ],
    [
      id("alert-5"),
      id("site-2"),
      id("gateway-2"),
      "warning",
      "แรงดันไฟฟ้า Phase A-B เกินพิกัดชั่วขณะ",
      "แรงดันไฟฟ้าเกิน 245V ต่อเนื่องเป็นเวลา 3 นาที",
      "resolved",
      new Date(now.getTime() - 36 * 3_600_000),
    ],
  ];
  await insertMany(
    client,
    "alerts",
    ["id", "site_id", "gateway_id", "severity", "title", "detail", "status", "occurred_at"],
    alerts
  );

  // 8. Audit Events
  const auditEvents = [
    [
      randomUUID(),
      id("user-owner"),
      "SEED_DEMO_DATASET",
      "platform",
      id("school-0"),
      null,
      JSON.stringify({ realisticSeed: true, timestamp: now }),
      "Clean setup & realistic dataset seed",
      "seed-demo-001",
      now,
    ],
    [
      randomUUID(),
      id("user-admin-0"),
      "VERIFY_GATEWAYS",
      "gateway",
      id("gateway-0"),
      JSON.stringify({ status: "checking" }),
      JSON.stringify({ status: "online" }),
      "Routine gateway health check",
      "seed-demo-002",
      new Date(now.getTime() - 3_600_000),
    ],
    [
      randomUUID(),
      id("user-owner"),
      "GENERATE_BILLING",
      "billing",
      id("billing-0-curr"),
      null,
      JSON.stringify({ status: "approved", amount: 15420.5 }),
      "Monthly billing cycle approval",
      "seed-demo-003",
      new Date(now.getTime() - 7_200_000),
    ],
  ];
  await insertMany(
    client,
    "audit_events",
    ["id", "actor_id", "action", "entity_type", "entity_id", "before_json", "after_json", "reason", "correlation_id", "occurred_at"],
    auditEvents
  );

  await client.query("COMMIT");
  console.log(
    JSON.stringify({
      schools: schools.length,
      users: users.length,
      sites: sites.length,
      gateways: gateways.length,
      devices: devices.length,
      presets: presets.length,
      rawTelemetry: raw.length,
      aggregates: aggregates.length,
      billingCycles: billing.length,
      documents: documents.length,
      payments: payments.length,
      alerts: alerts.length,
      auditEvents: auditEvents.length,
    })
  );

  // 9. MinIO Storage: Ensure Bucket and upload mock PDFs and evidence images
  console.log(`[Seed] Connecting to MinIO Storage at ${env.STORAGE_ENDPOINT}...`);
  const s3 = new S3Client({
    endpoint: env.STORAGE_ENDPOINT,
    region: env.STORAGE_REGION,
    credentials: {
      accessKeyId: env.STORAGE_ACCESS_KEY,
      secretAccessKey: env.STORAGE_SECRET_KEY,
    },
    forcePathStyle: true,
  });

  try {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: env.STORAGE_BUCKET }));
      console.log(`[Seed] S3 Bucket '${env.STORAGE_BUCKET}' already exists.`);
    } catch {
      console.log(`[Seed] S3 Bucket '${env.STORAGE_BUCKET}' not found. Creating...`);
      await s3.send(new CreateBucketCommand({ Bucket: env.STORAGE_BUCKET }));
      console.log(`[Seed] S3 Bucket '${env.STORAGE_BUCKET}' created successfully.`);
    }

    const dummyPdf = Buffer.from(
      "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000102 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF"
    );

    const dummyJpg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
      0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
      0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
      0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
      0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
      0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00,
      0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x09, 0xff, 0xda, 0x00, 0x08, 0x01,
      0x01, 0x00, 0x00, 0x3f, 0x00, 0x7f, 0x00, 0xff, 0xd9,
    ]);

    console.log(`[Seed] Uploading ${s3UploadTasks.length} mock files to bucket '${env.STORAGE_BUCKET}'...`);
    for (const task of s3UploadTasks) {
      await s3.send(
        new PutObjectCommand({
          Bucket: env.STORAGE_BUCKET,
          Key: task.key,
          Body: task.type === "pdf" ? dummyPdf : dummyJpg,
          ContentType: task.type === "pdf" ? "application/pdf" : "image/jpeg",
        })
      );
    }
    console.log(`[Seed] Uploaded ${s3UploadTasks.length} mock files successfully.`);
  } catch (s3Err: any) {
    console.warn(`[Seed] Warning: MinIO S3 upload error: ${s3Err?.message ?? s3Err}`);
  }
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
