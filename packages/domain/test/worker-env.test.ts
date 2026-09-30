import assert from "node:assert/strict";
import test from "node:test";
import * as config from "../src/config/env.js";

test("worker starts without unrelated API secrets and rejects invalid ports", () => {
  assert.equal(typeof config.loadWorkerEnv, "function");
  assert.deepEqual(config.loadWorkerEnv({}), { NODE_ENV: "development", WORKER_PORT: 3002 });
  assert.throws(() => config.loadWorkerEnv({ WORKER_PORT: "broken" }), /WORKER_PORT/);
});
