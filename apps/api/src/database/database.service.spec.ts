import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseService } from "./database.service.js";

test("idle PostgreSQL disconnects do not escape as an uncaught error", async () => {
  const service = new DatabaseService();
  try {
    assert.doesNotThrow(() => service.pool.emit("error", new Error("terminating connection due to administrator command")));
    // A second outage must remain handled, rather than using a one-shot listener.
    assert.doesNotThrow(() => service.pool.emit("error", new Error("Connection terminated unexpectedly")));
  } finally { await service.onModuleDestroy(); }
});
