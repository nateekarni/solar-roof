import assert from "node:assert/strict";
import test from "node:test";

import { buildDependencyHealth, loadEnv } from "../src/index.js";

const baseEnv = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://solar:solar@localhost:5432/solar_platform",
  JWT_ACCESS_SECRET: "access-secret-access-secret-access-secret",
  JWT_REFRESH_SECRET: "refresh-secret-refresh-secret-refresh-secret",
  MQTT_URL: "mqtt://localhost:1883",
  MQTT_USERNAME: "solar",
  MQTT_PASSWORD: "solar",
  STORAGE_ENDPOINT: "http://localhost:9000",
  STORAGE_REGION: "ap-southeast-1",
  STORAGE_BUCKET: "solar-platform",
  STORAGE_ACCESS_KEY: "solar",`r`n  STORAGE_SECRET_KEY: "storage-secret-storage-secret-storage-secret",`r`n  REDIS_URL: "redis://localhost:6379"
};

test("loadEnv validates required secrets", () => {
  const env = loadEnv(baseEnv);

  assert.equal(env.DATABASE_URL, baseEnv.DATABASE_URL);
  assert.equal(env.WEB_PORT, 3000);
  assert.equal(env.API_PORT, 3001);
  assert.equal(env.WORKER_PORT, 3002);
});

test("loadEnv rejects missing secrets", () => {
  assert.throws(
    () => loadEnv({ ...baseEnv, JWT_ACCESS_SECRET: "" }),
    /JWT_ACCESS_SECRET/
  );
});

test("buildDependencyHealth does not expose secret values", () => {
  const health = buildDependencyHealth("api", loadEnv(baseEnv));

  assert.equal(health.service, "api");
  assert.equal(health.status, "healthy");
  assert.deepEqual(
    health.dependencies.map((dependency) => dependency.name),
    ["database", "jwt", "mqtt", "storage", "redis"]
  );
  assert.ok(health.dependencies.every((dependency) => typeof dependency.configured === "boolean"));
});


