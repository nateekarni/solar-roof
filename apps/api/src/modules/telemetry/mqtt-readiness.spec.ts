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

test('registered external broker mode reports subscriptions and never connects a default broker', async context => {
  const previous = process.env.MQTT_DEFAULT_BROKER_ENABLED;
  process.env.MQTT_DEFAULT_BROKER_ENABLED = 'false';
  let brokers: object[] = [];
  const connections: string[] = [];
  const client = Object.assign(new EventEmitter(), {
    connected: false,
    subscribe(topic: string, _options: object, callback: (error: null, grants: object[]) => void) { callback(null, [{ topic, qos: 1 }]); },
    unsubscribe() {}, end() {}, reconnect() {},
  });
  context.mock.method(mqttRuntime, 'connect', (url: string) => { connections.push(url); return client as unknown as mqtt.MqttClient; });
  const db = { query: async (sql: string) => ({ rows: sql.includes('FROM mqtt_brokers') ? brokers : [] }) } as unknown as DatabaseService;
  const service = new MqttIngestionService(db, db as import('./ingestion-database.service.js').IngestionDatabaseService);
  try {
    await service.onModuleInit(); await flush();
    assert.deepEqual(service.getConnectionHealth(), { status: 'not_configured', configuredBrokers: 0, readyBrokers: 0 });
    brokers = [{ id: 'external', url: 'mqtts://external.example:8883', username: '', password_cipher: null, topics: ['school/#'] }];
    await service.refreshSubscriptions();
    assert.deepEqual(connections, ['mqtts://external.example:8883']);
    assert.equal(service.getConnectionHealth().status, 'not_ready');
    client.connected = true; client.emit('connect'); await flush();
    assert.deepEqual(service.getConnectionHealth(), { status: 'ready', configuredBrokers: 1, readyBrokers: 1 });
    client.connected = false; client.emit('offline');
    assert.equal(service.getConnectionHealth().status, 'not_ready');
    assert.equal(JSON.stringify(service.getConnectionHealth()).includes('external.example'), false);
  } finally {
    await service.onModuleDestroy();
    if (previous === undefined) delete process.env.MQTT_DEFAULT_BROKER_ENABLED; else process.env.MQTT_DEFAULT_BROKER_ENABLED = previous;
  }
});

test('web-only mode starts no MQTT clients or broker discovery',async context=>{
 const previous=process.env.MQTT_ENABLED;process.env.MQTT_ENABLED='false';
 let connections=0,queries=0;
 context.mock.method(mqttRuntime,'connect',()=>{connections++;throw new Error('Must not connect');});
 const db={query:async()=>{queries++;return {rows:[]};}} as unknown as DatabaseService;
 const service=new MqttIngestionService(db,db as import('./ingestion-database.service.js').IngestionDatabaseService);
 try {await service.onModuleInit();await service.refreshSubscriptions();
  assert.equal(connections,0);assert.equal(queries,0);
  assert.deepEqual(service.getConnectionHealth(),{status:'disabled',configuredBrokers:0,readyBrokers:0});
 }finally{await service.onModuleDestroy();if(previous===undefined)delete process.env.MQTT_ENABLED;else process.env.MQTT_ENABLED=previous;}
});

test("subscription failure keeps readiness false and retries without reconnecting", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let databaseAvailable = false;
  let queries = 0;
  const db = { query: async () => { queries++; if (!databaseAvailable) throw new Error("temporary DB outage"); return { rows: [] }; } } as unknown as DatabaseService;
  const client = Object.assign(new EventEmitter(), { connected: true, end() {} });
  context.mock.method(mqttRuntime, "connect", () => client as unknown as mqtt.MqttClient);
  const service = new MqttIngestionService(db, db as import("./ingestion-database.service.js").IngestionDatabaseService);
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
  const service = new MqttIngestionService(db, db as import("./ingestion-database.service.js").IngestionDatabaseService);
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
  const service = new MqttIngestionService(db, db as import("./ingestion-database.service.js").IngestionDatabaseService);
  await service.onModuleInit();
  assert.equal(typeof service.isReady, "function");
  client.emit("connect"); await flush();
  await service.onModuleDestroy();
  const previousQueries = queries;
  context.mock.timers.tick(10000); await flush();
  assert.equal(queries, previousQueries);
});


