import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { MeController } from "./me.controller.js";
import { UsersController } from "./users.controller.js";
import type { DatabaseService } from "../../database/database.service.js";
test("own profile changes display name using session id, never supplied identity/legal fields", async () => {
  const statements: { sql: string; params: unknown[] }[] = [];
  const db = {
    query: async (sql: string, params: unknown[]) => {
      statements.push({ sql, params });
      return { rows: [{ displayName: "Saved" }] };
    },
  } as unknown as DatabaseService;
  const controller = new MeController(db);
  await controller.updateProfile({ user: { id: "current" } } as never, {
    displayName: "  Saved  ",
  });
  assert.deepEqual(statements[0]?.params, ["Saved", "current"]);
  assert.match(statements[0]!.sql, /WHERE id = \$2/);
  assert.doesNotMatch(statements[0]!.sql, /email\s*=|role\s*=|school_id\s*=/);
  await assert.rejects(
    () => controller.updateProfile({} as never, { displayName: "Saved" }),
    /authenticated/i,
  );
  for (const body of [
    { displayName: "" },
    { displayName: "Saved", id: "other" },
    { displayName: "Saved", taxId: "tax" },
    { displayName: "Saved", email: "changed" },
  ])
    await assert.rejects(
      () =>
        controller.updateProfile({ user: { id: "current" } } as never, body),
      /display name|profile/i,
    );
});
test("own notification GET reads only current user and rejects anonymous request", async () => {
  const calls: unknown[][] = [];
  const db = {
    query: async (_sql: string, params: unknown[]) => {
      calls.push(params);
      return {
        rows: [
          {
            settings: {
              criticalEmailAlert: false,
              inAppNotification: true,
              emailAddress: "saved@example.test",
            },
          },
        ],
      };
    },
  } as unknown as DatabaseService;
  const controller = new UsersController({} as never, db, {} as never);
  assert.deepEqual(
    await controller.getNotificationSettings({ user: { id: "current" } }),
    {
      criticalEmailAlert: false,
      inAppNotification: true,
      emailAddress: "saved@example.test",
    },
  );
  assert.deepEqual(calls, [["current"]]);
  await assert.rejects(
    () => controller.getNotificationSettings({}),
    /authenticated/i,
  );
});

test("notification updates validate booleans/email and reject anonymous or extra identities", async () => {
  const writes: unknown[][] = [];
  const db = {
    query: async (_sql: string, params: unknown[]) => {
      writes.push(params);
      return { rows: [], rowCount: 1 };
    },
  } as unknown as DatabaseService;
  const controller = new UsersController({} as never, db, {} as never);
  await assert.rejects(
    () =>
      controller.updateNotificationSettings({}, { criticalEmailAlert: true }),
    /authenticated/i,
  );
  for (const body of [
    { criticalEmailAlert: "yes" },
    { userId: "other" },
    { emailAddress: "invalid" },
  ])
    await assert.rejects(
      () =>
        controller.updateNotificationSettings(
          { user: { id: "current" } },
          body as never,
        ),
      /notification/i,
    );
  await controller.updateNotificationSettings(
    { user: { id: "current" } },
    {
      criticalEmailAlert: false,
      inAppNotification: true,
      emailAddress: "alerts@example.test",
    },
  );
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.[1], "current");
});
