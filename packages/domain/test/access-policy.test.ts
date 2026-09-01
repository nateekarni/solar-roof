import assert from "node:assert/strict";
import test from "node:test";
import { canAccess, type AccessActor } from "../src/access/access-policy.js";

const owner: AccessActor = { id: "o", role: "owner" };
const admin: AccessActor = { id: "a", role: "admin", assignedSchoolIds: ["school-a"] };
const user: AccessActor = { id: "u", role: "school_user", schoolId: "school-a" };

test("owner can access every resource", () => assert.equal(canAccess(owner, "manage", { schoolId: "school-z" }), true));
test("admin is limited to assigned schools", () => {
  assert.equal(canAccess(admin, "manage", { schoolId: "school-a" }), true);
  assert.equal(canAccess(admin, "manage", { schoolId: "school-z" }), false);
});
test("school user can read and upload evidence only in own school", () => {
  assert.equal(canAccess(user, "read", { schoolId: "school-a" }), true);
  assert.equal(canAccess(user, "upload_evidence", { schoolId: "school-a" }), true);
  assert.equal(canAccess(user, "finalize", { schoolId: "school-a" }), false);
  assert.equal(canAccess(user, "read", { schoolId: "school-z" }), false);
});