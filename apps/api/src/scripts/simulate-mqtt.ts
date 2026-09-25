import "dotenv/config";
import mqtt from "mqtt";

interface SimulatorConfig {
  mqttUrl: string;
  username?: string;
  password?: string;
  intervalMs: number;
  siteCount: number;
  once: boolean;
}

const config: SimulatorConfig = {
  mqttUrl: process.env.MQTT_URL || "mqtt://localhost:1883",
  username: process.env.MQTT_USERNAME || "solar",
  password: process.env.MQTT_PASSWORD || "solar-mqtt-local-only",
  intervalMs: parseInt(process.env.SIMULATION_INTERVAL_MS || "5000", 10),
  siteCount: 18,
  once: process.argv.includes("--once"),
};

console.log("[MQTT Simulator] Starting solar telemetry simulation...");
console.log(`[MQTT Simulator] Connecting to broker at ${config.mqttUrl}`);

const mqttOptions: mqtt.IClientOptions = {
  connectTimeout: 5000,
  reconnectPeriod: 5000,
};
if (config.username) {
  mqttOptions.username = config.username;
}
if (config.password) {
  mqttOptions.password = config.password;
}

const client = mqtt.connect(config.mqttUrl, mqttOptions);

// Cumulative energy state per site (kWh)
const siteCumulative = new Map<number, number>();
for (let i = 0; i < config.siteCount; i++) {
  siteCumulative.set(i, 15000 + i * 2500);
}

function calculateSolarOutput(siteIndex: number, date: Date) {
  // Bangkok time UTC+7
  const bkkHour = (date.getUTCHours() + 7) % 24 + date.getUTCMinutes() / 60;
  const capacity = 0.48 + (siteIndex % 6) * 0.17; // MWp

  // Daylight curve from 06:00 to 18:00
  let daylight = 0;
  if (bkkHour >= 6 && bkkHour <= 18) {
    daylight = Math.sin(((bkkHour - 6) / 12) * Math.PI);
  }

  // Small random noise (±5%)
  const noise = (Math.random() * 0.1 - 0.05);
  const activePowerKw = Math.max(0, capacity * 1000 * daylight * (1 + noise));

  // 3-phase AC voltage around 230V
  const voltage = 228 + Math.random() * 5;
  // Current in Amperes
  const current = activePowerKw > 0 ? (activePowerKw * 1000) / (Math.sqrt(3) * 380 * 0.98) : 0;

  // Cumulative energy increment for this interval
  const prevCumulative = siteCumulative.get(siteIndex) ?? 15000;
  const kwhDelta = (activePowerKw * (config.intervalMs / 3600000));
  const newCumulative = Number((prevCumulative + kwhDelta).toFixed(2));
  siteCumulative.set(siteIndex, newCumulative);

  return {
    activePowerKw: Number(activePowerKw.toFixed(2)),
    voltage: Number(voltage.toFixed(1)),
    current: Number(current.toFixed(2)),
    totalEnergyKwh: newCumulative,
    frequency: Number((49.95 + Math.random() * 0.1).toFixed(2)),
    powerFactor: activePowerKw > 0 ? Number((0.97 + Math.random() * 0.02).toFixed(2)) : 0,
    irradianceWpm2: Number((daylight * 950 * (1 + noise)).toFixed(1)),
  };
}

let tickCount = 0;

function publishTelemetryBatch() {
  const now = new Date();
  tickCount++;

  for (let i = 0; i < config.siteCount; i++) {
    const siteCode = String(i + 1).padStart(3, "0");
    const topic = `energy/site${siteCode}/telemetry`;
    const telemetry = calculateSolarOutput(i, now);

    const payload = {
      siteId: `site-${siteCode}`,
      gatewayId: `GW-${siteCode}`,
      deviceId: `MTR-${String(i + 1).padStart(4, "0")}`,
      timestamp: now.toISOString(),
      status: i === 7 ? "degraded" : "online",
      metrics: telemetry,
    };

    client.publish(topic, JSON.stringify(payload), { qos: 0 }, (err) => {
      if (err) {
        console.error(`[MQTT Simulator] Error publishing to ${topic}:`, err.message);
      }
    });
  }

  const bkkHour = (now.getUTCHours() + 7) % 24;
  console.log(
    `[MQTT Simulator] [Tick ${tickCount}] Published telemetry for ${config.siteCount} sites at BKK ${String(bkkHour).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`
  );

  if (config.once) {
    console.log("[MQTT Simulator] Run-once mode finished. Exiting...");
    client.end(false, () => process.exit(0));
  }
}

client.on("connect", () => {
  console.log("[MQTT Simulator] Connected to MQTT broker successfully.");
  console.log(`[MQTT Simulator] Publishing to 18 site topics every ${config.intervalMs / 1000}s`);

  // Publish immediate first tick
  publishTelemetryBatch();

  if (!config.once) {
    const timer = setInterval(publishTelemetryBatch, config.intervalMs);

    const cleanup = () => {
      console.log("\n[MQTT Simulator] Stopping simulator...");
      clearInterval(timer);
      client.end(false, () => {
        console.log("[MQTT Simulator] Disconnected.");
        process.exit(0);
      });
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  }
});

client.on("error", (err) => {
  console.warn(`[MQTT Simulator] Broker connection issue: ${err.message}`);
  if (config.once) {
    console.log("[MQTT Simulator] Exiting gracefully (--once).");
    process.exit(0);
  }
});
