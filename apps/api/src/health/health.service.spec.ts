import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { HealthService } from "./health.service.js";

test("readiness fails closed when a dependency fails and never exposes its error", async () => {
  const service = new HealthService([
    { name: "database", check: async () => { throw new Error("postgres://secret"); } },
    { name: "mqtt", check: async () => true },
  ]);
  assert.equal(typeof service.getReadiness, "function");
  const result = await service.getReadiness();
  assert.equal(result.status, "not_ready");
  assert.deepEqual(result.dependencies, [{ name: "database", status: "unavailable" }, { name: "mqtt", status: "healthy" }]);
  assert.ok(!JSON.stringify(result).includes("secret"));
});

test("readiness notices disconnects and recovery on subsequent checks", async () => {
  let connected = true;
  const service = new HealthService([{ name: "mqtt", check: async () => connected }]);
  assert.equal(typeof service.getReadiness, "function");
  assert.equal((await service.getReadiness()).status, "ready");
  connected = false;
  assert.equal((await service.getReadiness()).status, "not_ready");
  connected = true;
  assert.equal((await service.getReadiness()).status, "ready");
});

test("a stalled dependency is bounded and liveness remains independent", async () => {
  const service = new HealthService([{ name: "database", check: () => new Promise(() => {}) }], 20);
  assert.equal(typeof service.getReadiness, "function");
  assert.equal((await service.getReadiness()).status, "not_ready");
  assert.equal(service.getSnapshot().status, "healthy");
});
