import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import type mqtt from "mqtt";
import { createRequire } from "node:module";
const mqttRuntime = createRequire(import.meta.url)("mqtt/mqtt");
import { MqttIngestionService } from "./mqtt-ingestion.service.js";
import type { DatabaseService } from "../../database/database.service.js";

const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test("subscription failure keeps readiness false and retries without reconnecting", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let databaseAvailable = false;
  let queries = 0;
  const db = { query: async () => { queries++; if (!databaseAvailable) throw new Error("temporary DB outage"); return { rows: [] }; } } as unknown as DatabaseService;
  const client = Object.assign(new EventEmitter(), { connected: true, end() {} });
  context.mock.method(mqttRuntime, "connect", () => client as unknown as mqtt.MqttClient);
  const service = new MqttIngestionService(db);
  try {
    await service.onModuleInit();
    assert.equal(typeof service.isReady, "function");
    client.emit("connect");
    await flush();
    assert.equal(service.isReady(), false);
    databaseAvailable = true;
    context.mock.timers.tick(5000);
    await flush();
    assert.equal(service.isReady(), true);
    client.connected = false;
    client.emit("close");
    assert.equal(service.isReady(), false);
    const previousQueries = queries;
    context.mock.timers.tick(10000);
    await flush();
    assert.equal(queries, previousQueries, "a disconnected client must not keep restoring");
  } finally { await service.onModuleDestroy(); }
});

test("late subscription completion cannot make a disconnected session ready", async context => {
  let complete: ((error?: Error) => void) | undefined;
  const db = { query: async (sql: string) => ({ rows: sql.includes("SELECT endpoint") ? [{ endpoint: "energy/test/#" }] : [] }) } as unknown as DatabaseService;
  const client = Object.assign(new EventEmitter(), {
    connected: true,
    subscribe(_topic: string, _options: object, callback: (error?: Error) => void) { complete = callback; },
    end() {},
  });
  context.mock.method(mqttRuntime, "connect", () => client as unknown as mqtt.MqttClient);
  const service = new MqttIngestionService(db);
  try {
    await service.onModuleInit();
    assert.equal(typeof service.isReady, "function");
    client.emit("connect"); await flush();
    assert.equal(service.isReady(), false);
    client.emit("close");
    complete?.(); await flush();
    assert.equal(service.isReady(), false);
    client.emit("connect"); await flush();
    complete?.(); await flush();
    assert.equal(service.isReady(), true);
  } finally { await service.onModuleDestroy(); }
  assert.equal(service.isReady(), false);
});

test("shutdown cancels pending restore retry", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let queries = 0;
  const db = { query: async () => { queries++; throw new Error("temporary DB outage"); } } as unknown as DatabaseService;
  const client = Object.assign(new EventEmitter(), { connected: true, end() {} });
  context.mock.method(mqttRuntime, "connect", () => client as unknown as mqtt.MqttClient);
  const service = new MqttIngestionService(db);
  await service.onModuleInit();
  assert.equal(typeof service.isReady, "function");
  client.emit("connect"); await flush();
  await service.onModuleDestroy();
  const previousQueries = queries;
  context.mock.timers.tick(10000); await flush();
  assert.equal(queries, previousQueries);
});


