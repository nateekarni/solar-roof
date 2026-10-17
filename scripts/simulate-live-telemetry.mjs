import { createRequire } from 'node:module';
import { sites, envelope, topic, marker } from './local-system/telemetry-fixture.mjs';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const mqtt = require('mqtt');

const url = process.env.MQTT_URL || 'mqtt://localhost:1883';
const username = process.env.MQTT_USERNAME || 'solar';
const password = process.env.MQTT_PASSWORD || 'solar';

console.log(`[Live Telemetry] Connecting to MQTT broker at ${url} (User: ${username})...`);

const client = mqtt.connect(url, {
  clientId: `${marker}-live-${process.pid}`,
  username,
  password,
  reconnectPeriod: 2000,
  connectTimeout: 5000,
});

const counts = { meter: 0, logger: 0, ack: 0 };
let stopped = false;
let last = { meter: 0, logger: 0 };

client.on('error', (e) => console.error('[Live Telemetry] MQTT Error:', e.message));

client.on('connect', () => {
  console.log(`[Live Telemetry] Connected to broker successfully!`);
  console.log(`[Live Telemetry] Emitting live telemetry for 9 sites (SKA-HDY-010 kept offline for alerts)`);
  console.log(`[Live Telemetry] Cadence: Meter every 5s, Logger every 15s`);

  client.subscribe('solar/v1/sites/+/gateways/+/dataAcept', { qos: 1 });

  send('meter');
  send('logger');

  setInterval(() => send('meter'), 5000);
  setInterval(() => send('logger'), 15000);
  setInterval(() => {
    console.log(`[Live Telemetry Heartbeat] Meter messages: ${counts.meter}, Logger messages: ${counts.logger}`);
  }, 60000);
});

function send(kind) {
  if (stopped || !client.connected) return;
  const now = Date.now();
  if (now <= last[kind]) return;
  last[kind] = now;

  for (const site of sites.filter((s) => s.index !== 9)) {
    const t = topic(site, kind);
    const payload = JSON.stringify(envelope(site, kind, now));
    client.publish(t, payload, { qos: 1, retain: false }, (err) => {
      if (err) {
        console.error('[Live Telemetry] Publish error:', kind, err.message);
      } else {
        counts[kind]++;
      }
    });
  }
}

process.on('SIGINT', () => {
  stopped = true;
  client.end();
  process.exit(0);
});
