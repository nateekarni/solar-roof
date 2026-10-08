import test from "node:test";
import assert from "node:assert/strict";
import { submitOwnPasswordChange } from "./organization-settings-model";
test("shared password workflow rejects invalid lengths before API and clears identity before login after success", async () => {
  const calls: string[] = [];
  const actions = {
    update: async () => {
      calls.push("update");
    },
    clear: () => {
      calls.push("clear");
    },
    redirect: (path: string) => {
      calls.push(path);
    },
  };
  await assert.rejects(
    () =>
      submitOwnPasswordChange("current", "12345678", "12345678", "en", actions),
    /12/,
  );
  assert.deepEqual(calls, []);
  await submitOwnPasswordChange(
    "current",
    "abcdefghijkl",
    "abcdefghijkl",
    "en",
    actions,
  );
  assert.deepEqual(calls, ["update", "clear", "/login?password_changed=1"]);
  calls.length = 0;
  await assert.rejects(
    () =>
      submitOwnPasswordChange("current", "abcdefghijkl", "abcdefghijkl", "en", {
        ...actions,
        update: async () => {
          throw new Error("wrong current password");
        },
      }),
    /wrong current password/,
  );
  assert.deepEqual(calls, []);
});
