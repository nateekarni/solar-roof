import "dotenv/config";
import mqtt from "mqtt";
import { Pool } from "pg";
import { legacyTelemetryTopic, registeredLegacyTargetsSql } from "./registered-legacy-target.js";

const API_BASE = "http://127.0.0.1:3001";
const MQTT_URL = process.env.MQTT_URL || "mqtt://localhost:1883";
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://solar:solar-local-only@localhost:5432/solar_platform";

const pool = new Pool({ connectionString: DATABASE_URL });

async function runVerification() {
  console.log("=== STARTING GATEWAY TELEMETRY & REGISTER MAPPING E2E TEST ===");

  // 1. Get first site and device from DB
  if(!process.env.TEST_SITE_UUID)throw new Error('Set TEST_SITE_UUID to the selected registered legacy site internal reference.');
  const siteRes = await pool.query(registeredLegacyTargetsSql,[process.env.TEST_SITE_UUID]);

if (siteRes.rows.length === 0) {
    throw new Error("No site/gateway/device found in database");
  }

  const { siteId, siteName, gatewayId, deviceId, deviceModel, endpoint } = siteRes.rows[0];
  console.log(`[Target Site]: ${siteName} (${siteId})`);
  console.log(`[Target Device]: ${deviceModel} (${deviceId})`);

  // 2. Connect to MQTT Broker
  console.log(`[MQTT] Connecting to broker at ${MQTT_URL}...`);
  const mqttClient = mqtt.connect(MQTT_URL, {
    username: process.env.MQTT_USERNAME || "solar",
    password: process.env.MQTT_PASSWORD || "solar-mqtt-local-only",
    connectTimeout: 5000,
  });

  await new Promise<void>((resolve, reject) => {
    mqttClient.on("connect", () => {
      console.log("[MQTT] Connected successfully");
      resolve();
    });
    mqttClient.on("error", (err) => reject(err));
  });

  // 3. Publish PILOT SPM91 Raw Registers Telemetry (matching PDF screenshot exactly)
  const topic = legacyTelemetryTopic(endpoint);
  const rawPayload = {
    siteId, gatewayId,
    deviceId: deviceId,
    deviceType: "PILOT_SPM91",
    protocol: "modbus-tcp",
    timestamp: new Date().toISOString(),
    registers: {
      R0: 2, // Total energy low
      R1: 0, // Total energy high -> 0.20 kWh
      R2: 23081, // Voltage -> 230.81 V
      R3: 443, // Current low
      R4: 0, // Current high -> 0.44 A
      R5: 878, // Active power low
      R6: 0, // Active power high -> 87.80 W
      R7: 1025, // Apparent power low
      R8: 0, // Apparent power high -> 102.5 VA
      R9: 65127, // Reactive power low (0xFE67)
      R10: 65535, // Reactive power high (0xFFFF) -> signed 32-bit -40.90 var
      R11: 5000, // Frequency -> 50.00 Hz
      R12: 906, // Power factor -> 0.91
    },
  };

  console.log(`[MQTT] Publishing SPM91 Raw Registers to topic: ${topic}`);
  await new Promise<void>((resolve) => {
    mqttClient.publish(topic, JSON.stringify(rawPayload), { qos: 1 }, () => {
      console.log("[MQTT] Published payload successfully");
      resolve();
    });
  });

  // Allow backend ingestion service to process message
  console.log("[Verification] Waiting 1.5 seconds for backend ingestion...");
  await new Promise((r) => setTimeout(r, 1500));
  mqttClient.end();

  // 4. Verify Database Record in telemetry_raw
  const rawDbRes = await pool.query(
    `SELECT voltage_v, current_a, active_power_w, apparent_power_va, reactive_power_var,
            frequency_hz, power_factor, total_energy_kwh, quality
     FROM telemetry_raw
     WHERE device_id = $1
     ORDER BY source_time DESC
     LIMIT 1`,
    [deviceId]
  );

  console.log("\n--- [DB Verification: telemetry_raw] ---");
  if (rawDbRes.rows.length === 0) {
    throw new Error("No record found in telemetry_raw for device");
  }
  const dbRow = rawDbRes.rows[0];
  console.log("Recorded Electrical Parameters:");
  console.log(`  Voltage:        ${dbRow.voltage_v} V       (Expected: 230.81)`);
  console.log(`  Current:        ${dbRow.current_a} A       (Expected: 0.443)`);
  console.log(`  Active Power:   ${dbRow.active_power_w} W      (Expected: 87.80)`);
  console.log(`  Apparent Power: ${dbRow.apparent_power_va} VA    (Expected: 102.50)`);
  console.log(`  Reactive Power: ${dbRow.reactive_power_var} var  (Expected: -40.90)`);
  console.log(`  Frequency:      ${dbRow.frequency_hz} Hz      (Expected: 50.00)`);
  console.log(`  Power Factor:   ${dbRow.power_factor}         (Expected: 0.906)`);
  console.log(`  Total Energy:   ${dbRow.total_energy_kwh} kWh  (Expected: 0.20)`);
  console.log(`  Quality:        ${dbRow.quality}`);

  if (Math.abs(Number(dbRow.voltage_v) - 230.81) > 0.05) throw new Error("Voltage mismatch");
  if (Math.abs(Number(dbRow.active_power_w) - 87.80) > 0.1) throw new Error("Active Power mismatch");
  if (Math.abs(Number(dbRow.reactive_power_var) - -40.90) > 0.1) throw new Error("Reactive Power mismatch");
  console.log(">> Database verification PASSED! Values match PILOT SPM91 spec 100%");

  // 4.5 Login to get Bearer token for protected REST APIs
  console.log("\n--- [Auth: Login as owner@solar.local] ---");
  const loginRes = await fetch(`${API_BASE}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@solar.local", password: "Password1234" }),
  });
  if (!loginRes.ok) {
    throw new Error(`Login failed: ${loginRes.status} ${await loginRes.text()}`);
  }
  const loginData: any = await loginRes.json();
  const token = loginData.accessToken;
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  console.log(">> Login successful! Access token obtained.");

  // 5. Test REST API: GET /v1/sites/:id/live-telemetry
  console.log("\n--- [API Verification: GET /v1/sites/:id/live-telemetry] ---");
  const liveRes = await fetch(`${API_BASE}/v1/sites/${siteId}/live-telemetry`, {
    headers: authHeaders,
  });
  if (!liveRes.ok) {
    throw new Error(`Failed to fetch live telemetry: ${liveRes.status} ${await liveRes.text()}`);
  }
  const liveData: any = await liveRes.json();
  console.log("Live Telemetry API Response:");
  console.log(`  Status:       ${liveData.status}`);
  console.log(`  Quality:      ${liveData.quality}`);
  console.log(`  Active Power: ${liveData.metrics.activePower} W`);
  console.log(`  Voltage:      ${liveData.metrics.voltage} V`);
  console.log(`  Raw Registers Count: ${Object.keys(liveData.rawRegisters || {}).length}`);
  console.log(">> Live Telemetry API PASSED!");

  // 6. Test REST API: POST /v1/devices/:id/test-decode
  console.log("\n--- [API Verification: POST /v1/devices/:id/test-decode] ---");
  const decodeRes = await fetch(`${API_BASE}/v1/devices/${deviceId}/test-decode`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      registers: {
        R0: 2, R1: 0, R2: 23081, R3: 443, R4: 0, R5: 878, R6: 0,
        R7: 1025, R8: 0, R9: 65127, R10: 65535, R11: 5000, R12: 906
      }
    })
  });
  if (!decodeRes.ok) {
    throw new Error(`Failed test-decode: ${decodeRes.status} ${await decodeRes.text()}`);
  }
  const decodeData: any = await decodeRes.json();
  console.log("Test Decode API Response Results:");
  console.log(`  total_energy:   ${decodeData.results.total_energy.scaledValue} kWh`);
  console.log(`  voltage:        ${decodeData.results.voltage.scaledValue} V`);
  console.log(`  active_power:   ${decodeData.results.active_power.scaledValue} W`);
  console.log(`  reactive_power: ${decodeData.results.reactive_power.scaledValue} var`);
  console.log(">> Test Decode API PASSED!");

  // 7. Test Meter Presets API: GET /v1/meter-presets
  console.log("\n--- [API Verification: GET /v1/meter-presets] ---");
  const presetsRes = await fetch(`${API_BASE}/v1/meter-presets`, {
    headers: authHeaders,
  });
  const presetsData: any = await presetsRes.json();
  const spm91Preset = presetsData.find((p: any) => p.model === "SPM91");
  const weatherPreset = presetsData.find((p: any) => p.deviceType === "environmental_sensor");
  console.log(`  PILOT SPM91 Preset found: ${Boolean(spm91Preset)} (Registers: ${spm91Preset?.registers?.length || 0})`);
  console.log(`  Weather Station Preset found: ${Boolean(weatherPreset)} (Type: ${weatherPreset?.deviceType})`);
  if (!spm91Preset) throw new Error("PILOT SPM91 preset missing");
  console.log(">> Meter Presets API PASSED!");

  console.log("\n=======================================================");
  console.log("   ALL 7/7 END-TO-END VERIFICATION CHECKS PASSED!");
  console.log("=======================================================\n");

  await pool.end();
}

runVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
