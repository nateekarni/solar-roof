import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
test("password verifies current secret and atomically changes own hash and revokes sessions", async () => {
  const auth = new AuthService("test-access-secret", "test-refresh-secret");
  const old = auth.hashPassword("old-password-123");
  const calls: { sql: string; params: unknown[] }[] = [];
  const db = {
    transaction: async (action: (client: unknown) => Promise<unknown>) =>
      action({
        query: async (sql: string, params: unknown[]) => {
          calls.push({ sql, params });
          return {
            rows: sql.includes("SELECT password_hash")
              ? [{ password_hash: old }]
              : [],
            rowCount: 1,
          };
        },
      }),
  };
  const controller = new AuthController(
    auth,
    db as never,
    {} as never,
    {} as never,
  );
  const cleared: string[] = [];
  const response = { clearCookie: (name: string) => cleared.push(name) };
  await controller.changePassword(
    { user: { id: "current" } } as never,
    { currentPassword: "old-password-123", newPassword: "new-password-123" },
    response as never,
  );
  assert.deepEqual(calls[0]?.params, ["current"]);
  assert.match(calls[0]!.sql, /FOR UPDATE/);
  const updated = calls.find((call) => call.sql.includes("UPDATE users"))!;
  assert.equal(updated.params[1], "current");
  assert.ok(auth.verifyPassword("new-password-123", String(updated.params[0])));
  assert.ok(
    calls.some(
      (call) =>
        call.sql.includes("UPDATE auth_sessions") &&
        call.params[0] === "current",
    ),
  );
  assert.deepEqual(cleared, ["access_token", "refresh_token"]);
  calls.length = 0;
  await assert.rejects(
    () =>
      controller.changePassword(
        { user: { id: "current" } } as never,
        { currentPassword: "wrong", newPassword: "new-password-123" },
        response as never,
      ),
    /password/i,
  );
  assert.equal(calls.length, 1);
  await assert.rejects(
    () =>
      controller.changePassword(
        {} as never,
        {
          currentPassword: "old-password-123",
          newPassword: "new-password-123",
        },
        response as never,
      ),
    /authenticated/i,
  );
  await assert.rejects(
    () =>
      controller.changePassword(
        { user: { id: "current" } } as never,
        {
          currentPassword: "old-password-123",
          newPassword: "new-password-123",
          userId: "other",
        },
        response as never,
      ),
    /password/i,
  );
});
