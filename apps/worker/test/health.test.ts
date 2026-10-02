import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { NestFactory } from "@nestjs/core";
import { WorkerAppModule } from "../src/app.module.js";
import {workerReleaseIdentity} from '../src/health/release-identity.js';

test("worker health responds without API secrets or external clients", async () => {
  const app = await NestFactory.create(WorkerAppModule, { logger: false });
  try {
    await app.listen(0, "127.0.0.1");
    const response = await fetch(`${await app.getUrl()}/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.partialDeepStrictEqual(body, { service: "worker", status: "healthy" });
    assert.ok(body && typeof body === "object" && !("dependencies" in body));
    const identity=await fetch(`${await app.getUrl()}/health/release-identity`);
    assert.equal(identity.status,200);
    assert.deepEqual(await identity.json(),workerReleaseIdentity());
  } finally { await app.close(); }
});

