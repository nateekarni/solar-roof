import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { HealthController } from "./health.controller.js";
import { HealthService } from "./health.service.js";
import { JwtAuthGuard } from "../modules/identity/jwt.guard.js";
import { SessionService } from "../modules/identity/session.service.js";
import { AuthService } from "../modules/identity/auth.service.js";
import { DatabaseService } from "../database/database.service.js";
import { PlatformAccessGuard } from "../common/auth/platform-access.guard.js";
import { RolesGuard } from "../common/roles.guard.js";

test("public readiness returns 503 on outage and recovers while liveness remains 200", async () => {
  let connected = true;
  const service = new HealthService([{ name: "mqtt", check: async () => connected }]);
  @Module({
    controllers: [HealthController],
    providers: [
      { provide: HealthService, useValue: service },
      { provide: AuthService, useValue: {} },
      { provide: DatabaseService, useValue: {} },
      { provide: SessionService, useValue: {} },
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
      { provide: APP_GUARD, useClass: PlatformAccessGuard },
    ],
  })
  class TestModule {}
  const app = await NestFactory.create(TestModule, { logger: false });
  try {
    await app.listen(0, "127.0.0.1");
    const url = await app.getUrl();
    assert.equal((await fetch(`${url}/ready`)).status, 200);
    connected = false;
    const failed = await fetch(`${url}/ready`);
    assert.equal(failed.status, 503);
    assert.equal(failed.headers.get("cache-control"), "no-store");
    assert.partialDeepStrictEqual(await failed.json(), { status: "not_ready" });
    assert.equal((await fetch(`${url}/health`)).status, 200);
    connected = true;
    assert.equal((await fetch(`${url}/ready`)).status, 200);
  } finally { await app.close(); }
});

