import { createHash, randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

config({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });
import { loadEnv } from "@solar/domain";
import { AuthService } from "../modules/identity/auth.service.js";

const env = loadEnv(process.env);
if (env.NODE_ENV === "production") throw new Error("Refusing to load demo seed in production");
const pool = new Pool({ connectionString: env.DATABASE_URL });
const id = (key: string) => createHash("sha256").update(`solar-demo:${key}`).digest("hex").slice(0, 32).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
const iso = (d: Date) => d.toISOString();
async function insertMany(client: PoolClient, table: string, columns: string[], rows: unknown[][], chunk = 500) {
  for (let start = 0; start < rows.length; start += chunk) {
    const batch = rows.slice(start, start + chunk);
    const values: unknown[] = [];
    const placeholders = batch.map((row, rowIndex) => `(${row.map((value, colIndex) => { values.push(value); return `$${rowIndex * columns.length + colIndex + 1}`; }).join(",")})`).join(",");
    await client.query(`INSERT INTO ${table} (${columns.join(",")}) VALUES ${placeholders}`, values);
  }
}

const regions = ["ภาคกลาง", "ภาคตะวันออกเฉียงเหนือ", "ภาคเหนือ", "ภาคตะวันออก", "ภาคใต้"];
const schoolNames = ["โรงเรียนบ้านคลองแสน", "โรงเรียนบ้านไผ่เมือง", "โรงเรียนเทศบาลหนองยาง", "โรงเรียนอนุบาลสาธิต", "โรงเรียนบ้านดอนแก้ว", "โรงเรียนวัดเขาดิน", "โรงเรียนเทศบาลเมืองใหม่", "โรงเรียนบ้านทุ่งยาว", "โรงเรียนประชารัฐวิทยา", "โรงเรียนบ้านหนองบัว", "โรงเรียนอนุบาลริมคลอง", "โรงเรียนเทศบาลบ้านสวน"];
const now = new Date("2026-09-01T12:00:00.000Z");
const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("TRUNCATE telemetry_raw, telemetry_aggregate, alerts, payments, documents, billing_cycles, rate_versions, contracts, billing_meters, register_mapping_versions, devices, gateways, sites, users, schools, audit_events CASCADE");
  const schools = schoolNames.map((name, i) => [id(`school-${i}`), name, `SCH-${String(i + 1).padStart(3, "0")}`, regions[i % regions.length], "active"]);
  await insertMany(client, "schools", ["id", "name", "code", "region", "status"], schools);
  const auth = new AuthService(env.JWT_ACCESS_SECRET, env.JWT_REFRESH_SECRET);
  const defaultPasswordHash = auth.hashPassword("Password1234");
  const users = [
    [id("user-admin-main"), "admin@solar-roof.com", "Admin User", "owner", "active", null, defaultPasswordHash, "th", "system"],
    [id("user-owner"), "owner@solar.local", "Solar Platform Owner", "owner", "active", null, defaultPasswordHash, "th", "system"],
    ...schoolNames.slice(0, 3).map((_, i) => [id(`user-admin-${i}`), `admin${i + 1}@solar.local`, `ช่างเทคนิค ${i + 1}`, "admin", "active", null, defaultPasswordHash, "th", "system"]),
    ...schoolNames.flatMap((_, i) => [0, 1].map(j => [id(`user-school-${i}-${j}`), `school${i + 1}.${j + 1}@school.local`, `${schoolNames[i]} เจ้าหน้าที่ ${j + 1}`, "school_user", "active", id(`school-${i}`), defaultPasswordHash, "th", "system"]))
  ];
  await insertMany(client, "users", ["id", "email", "display_name", "role", "status", "school_id", "password_hash", "preferred_language", "preferred_theme"], users);
  const sites: unknown[][] = [], gateways: unknown[][] = [], devices: unknown[][] = [], mappings: unknown[][] = [], meters: unknown[][] = [], contracts: unknown[][] = [], rates: unknown[][] = [];
  for (let i = 0; i < 18; i++) {
    const schoolIndex = i % schoolNames.length, siteId = id(`site-${i}`), gatewayId = id(`gateway-${i}`), meterId = id(`meter-${i}`), deviceId = id(`device-${i}-meter`), inverterId = id(`device-${i}-inverter`), contractId = id(`contract-${i}`), rateId = id(`rate-${i}`);
    const capacity = Number((0.48 + (i % 6) * 0.17).toFixed(4));
    sites.push([siteId, id(`school-${schoolIndex}`), `Solar Site ${String(i + 1).padStart(3, "0")}`, capacity, "Asia/Bangkok", i === 7 ? "degraded" : "online", 13.7563 + (i % 6) * 0.62, 100.5018 + (i % 6) * 0.48]);
    gateways.push([gatewayId, siteId, `GW-${String(i + 1).padStart(3, "0")}`, i % 3 === 0 ? "mqtt" : "modbus-tcp", `energy/site${String(i + 1).padStart(3, "0")}/telemetry`, i === 7 ? "degraded" : "online", new Date(now.getTime() - (i === 7 ? 9 : 1) * 60 * 1000)]);
    devices.push([deviceId, gatewayId, siteId, `Billing Meter ${String(i + 1).padStart(3, "0")}`, "meter", "Schneider PM5560", `MTR-${String(i + 1).padStart(4, "0")}`, 1, "online"], [inverterId, gatewayId, siteId, `Inverter ${String(i + 1).padStart(3, "0")}`, "inverter", "Huawei SUN2000", `INV-${String(i + 1).padStart(4, "0")}`, 2, i === 7 ? "degraded" : "online"]);
    mappings.push([id(`mapping-${i}`), deviceId, "total_energy", "R0:R1", "uint32", false, "big-endian", 0.01, "kWh", 60, JSON.stringify({ min: 0, max: 99999999, maxAgeSeconds: 180 }), new Date("2026-01-01T00:00:00Z")]);
    meters.push([meterId, siteId, deviceId, "total_energy", true]);
    contracts.push([contractId, id(`school-${schoolIndex}`), siteId, 1, "2026-01-01", null, "active", "ชำระภายใน 30 วัน", "Solar Platform Owner", null]);
    rates.push([rateId, contractId, "2026-01-01", null, "fixed_kwh", Number((4.05 + (i % 5) * 0.04).toFixed(2)), "THB"]);
  }
  await insertMany(client, "sites", ["id", "school_id", "name", "capacity_mwp", "timezone", "status", "latitude", "longitude"], sites);
  await insertMany(client, "gateways", ["id", "site_id", "name", "protocol", "endpoint", "status", "last_seen_at"], gateways);
  await insertMany(client, "devices", ["id", "gateway_id", "site_id", "name", "device_type", "model", "serial_number", "slave_id", "status"], devices);
  await insertMany(client, "register_mapping_versions", ["id", "device_id", "semantic_field", "register_address", "data_type", "signed", "byte_order", "scale", "unit", "polling_interval_seconds", "quality_rule", "effective_from"], mappings);
  await insertMany(client, "billing_meters", ["id", "site_id", "device_id", "semantic_field", "active"], meters);
  await insertMany(client, "contracts", ["id", "school_id", "site_id", "version", "start_date", "end_date", "status", "payment_terms", "signer_name", "attachment_key"], contracts);
  await insertMany(client, "rate_versions", ["id", "contract_id", "effective_from", "effective_to", "rate_type", "rate", "currency"], rates);

  const raw: unknown[][] = [], aggregates: unknown[][] = [];
  for (let siteIndex = 0; siteIndex < 18; siteIndex++) {
    const siteId = id(`site-${siteIndex}`), deviceId = id(`device-${siteIndex}-meter`), mappingId = id(`mapping-${siteIndex}`), capacity = 0.48 + (siteIndex % 6) * 0.17;
    let cumulative = 1200 + siteIndex * 83;
    const values15 = new Map<number, number[]>(), valuesHour = new Map<number, number[]>(), valuesDay = new Map<number, number[]>();
    for (let minute = 0; minute < 7 * 24 * 60; minute++) {
      const sourceTime = new Date(start.getTime() + minute * 60_000), hour = sourceTime.getUTCHours() + 7;
      const daylight = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
      const noise = ((minute * 17 + siteIndex * 13) % 19 - 9) / 100;
      cumulative += Math.max(0.02, capacity * 1000 * daylight / 60 * (1 + noise));
      const quality = siteIndex === 7 && minute % 97 === 0 ? "partial" : (siteIndex === 11 && minute % 211 === 0 ? "invalid" : "complete");
      raw.push([randomUUID(), deviceId, mappingId, siteId, sourceTime, new Date(sourceTime.getTime() + 1200), JSON.stringify({ R0: Math.floor(cumulative * 100), R1: 0 }), "total_energy", cumulative, "kWh", quality, `demo-${siteIndex}-${minute}`]);
      const point = { t: sourceTime.getTime(), v: cumulative, q: quality };
      for (const [map, size] of [[values15, 15], [valuesHour, 60], [valuesDay, 1440]] as const) { const key = Math.floor(minute / size); const list = map.get(key) ?? []; list.push(point.v); map.set(key, list); }
    }
    for (const [map, bucket] of [[values15, "15m"], [valuesHour, "hour"], [valuesDay, "day"]] as const) for (const [key, values] of map) { aggregates.push([randomUUID(), siteId, deviceId, "total_energy", bucket, new Date(start.getTime() + (bucket === "15m" ? key * 15 : bucket === "hour" ? key * 60 : key * 1440) * 60_000), values.reduce((a, b) => a + b, 0) / values.length, values.length, "complete"]); }
    aggregates.push([randomUUID(), siteId, deviceId, "total_energy", "month", new Date("2026-09-01T00:00:00Z"), cumulative, 10080, siteIndex === 11 ? "invalid" : "complete"]);
  }
  await insertMany(client, "telemetry_raw", ["id", "device_id", "mapping_version_id", "site_id", "source_time", "received_time", "raw_payload", "semantic_field", "normalized_value", "unit", "quality", "ingestion_id"], raw, 250);
  await insertMany(client, "telemetry_aggregate", ["id", "site_id", "device_id", "semantic_field", "bucket", "bucket_start", "value", "sample_count", "quality"], aggregates, 500);

  const billing: unknown[][] = [], documents: unknown[][] = [], payments: unknown[][] = [], alerts: unknown[][] = [];
  for (let i = 0; i < 18; i++) {
    const siteId = id(`site-${i}`), cycleId = id(`billing-${i}-2026-08`), amount = Number((1200 + i * 137.52).toFixed(2)), quality = i === 11 ? "invalid" : i === 7 ? "partial" : "complete";
    billing.push([cycleId, siteId, "2026-08-01", "2026-08-31", new Date("2026-08-31T16:59:59.999Z"), quality === "complete" ? "pending_review" : "blocked_quality", quality, 4500 + i * 83, 6200 + i * 137, 1700 + i * 54, Number((4.05 + (i % 5) * 0.04).toFixed(2)), amount]);
    documents.push([id(`invoice-${i}`), siteId, cycleId, "invoice", `INV-2026-${String(i + 1).padStart(6, "0")}`, "issued", "2026-09-01", amount, `documents/invoices/INV-2026-${String(i + 1).padStart(6, "0")}.pdf`]);
    payments.push([id(`payment-${i}`), cycleId, i % 3 === 0 ? "pending" : "paid", i % 3 === 0 ? null : "2026-09-02", i % 3 === 0 ? null : `evidence/payments/${i}.jpg`, null]);
    if (i % 4 === 0) alerts.push([id(`alert-${i}`), siteId, id(`gateway-${i}`), "warning", "Gateway telemetry delay", `Gateway GW-${String(i + 1).padStart(3, "0")} มี latency สูงกว่าปกติ`, i === 0 ? "open" : "acknowledged", new Date(now.getTime() - i * 3_600_000)]);
  }
  await insertMany(client, "billing_cycles", ["id", "site_id", "period_start", "period_end", "cutoff_time", "status", "quality", "opening_energy", "closing_energy", "consumed_kwh", "rate", "amount"], billing);
  await insertMany(client, "documents", ["id", "site_id", "billing_cycle_id", "document_type", "document_number", "status", "issue_date", "amount", "file_key"], documents);
  await insertMany(client, "payments", ["id", "billing_cycle_id", "status", "paid_at", "evidence_key", "note"], payments);
  await insertMany(client, "alerts", ["id", "site_id", "gateway_id", "severity", "title", "detail", "status", "occurred_at"], alerts);
  await insertMany(client, "audit_events", ["id", "actor_id", "action", "entity_type", "entity_id", "before_json", "after_json", "reason", "correlation_id", "occurred_at"], [[randomUUID(), id("user-owner"), "SEED_DEMO", "platform", id("school-0"), null, JSON.stringify({ seed: true }), "demo dataset", "seed-demo-001", now], [randomUUID(), id("user-admin-0"), "UPDATE_GATEWAY", "gateway", id("gateway-0"), null, JSON.stringify({ status: "online" }), "demo dataset", "seed-demo-002", now]]);  await client.query("COMMIT");
  console.log(JSON.stringify({ schools: schools.length, sites: sites.length, gateways: gateways.length, devices: devices.length, rawTelemetry: raw.length, aggregates: aggregates.length, billingCycles: billing.length, documents: documents.length, alerts: alerts.length }));
} catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); await pool.end(); }



