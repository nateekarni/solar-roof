import assert from "node:assert/strict";
import test from "node:test";
import { routeAllowed, schoolScope } from "./route-policy.js";

test("owner can view but only admin can configure hardware", () => {
  assert.equal(routeAllowed("owner", "GET", "/v1/sites/123"), true);
  assert.equal(routeAllowed("owner", "PATCH", "/v1/sites/123"), false);
  assert.equal(routeAllowed("owner", "POST", "/v1/gateways/GW-1/hardware-config"), false);
  assert.equal(routeAllowed("admin", "POST", "/v1/gateways/GW-1/hardware-config"), true);
});
test("school users cannot issue documents, configure registers or enumerate users", () => {
  assert.equal(routeAllowed("school_user", "POST", "/v1/documents"), false);
  assert.equal(routeAllowed("school_user", "POST", "/v1/devices/123/register-mappings"), false);
  assert.equal(routeAllowed("school_user", "GET", "/v1/operations/users"), false);
  assert.equal(routeAllowed("school_user", "GET", "/v1/operations/audit/export"), false);
  assert.equal(routeAllowed("school_user", "POST", "/v1/billing-cycles/123/pay"), true);
});
test("unknown mutations and HTTP telemetry ingestion fail closed", () => {
  assert.equal(routeAllowed("owner", "POST", "/v1/unknown"), false);
  assert.equal(routeAllowed("admin", "POST", "/v1/telemetry/ingest"), false);
  assert.equal(routeAllowed("bogus", "GET", "/v1/sites"), false);
});
test("school scope never widens missing school membership", () => {
  assert.deepEqual(schoolScope({role:"school_user"}), []);
  assert.deepEqual(schoolScope({role:"school_user",schoolId:"school-a"}), ["school-a"]);
  assert.deepEqual(schoolScope({role:"admin",schoolId:"school-a"}), ["school-a"]);
  assert.equal(schoolScope({role:"owner"}), null);
  assert.deepEqual(schoolScope(undefined), []);
});
