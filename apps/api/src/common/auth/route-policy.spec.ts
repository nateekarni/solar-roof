import assert from "node:assert/strict";
import test from "node:test";
import { routeAllowed, schoolScope } from "./route-policy.js";

test("owner cannot access hardware while admin can configure it", () => {
  assert.equal(routeAllowed("owner", "GET", "/v1/sites/123"), false);
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
  assert.equal(schoolScope({role:"admin",schoolId:"school-a"}), null);
  assert.equal(schoolScope({role:"owner"}), null);
  assert.deepEqual(schoolScope(undefined), []);
});

test('business routes exclude operational configuration and user management', () => {
 for(const role of ['owner','school_user']) for(const path of ['/v1/mqtt-brokers','/v1/operations/users','/v1/operations/gateways','/v1/settings','/v1/settings/notifications']) assert.equal(routeAllowed(role,'GET',path),false);
 assert.equal(routeAllowed('owner','POST','/v1/users/invite'),false);
 assert.equal(routeAllowed('owner','PUT','/v1/settings/company'),true);
 assert.equal(routeAllowed('school_user','GET','/v1/settings/bank-accounts'),true);
 assert.equal(routeAllowed('school_user','PUT','/v1/me/preferences'),true);
 for(const path of ['/v1/billing-cycles/1/generate-invoice','/v1/documents']) assert.equal(routeAllowed('admin','POST',path),true);
 assert.equal(routeAllowed('admin','PATCH','/v1/billing-cycles/1/verify-payment'),true);
});
test('business roles can read scoped billing collections and details',()=>{
 for(const role of ['owner','school_user']) for(const path of ['/v1/operations/billing','/v1/operations/billing/records/1']) assert.equal(routeAllowed(role,'GET',path),true);
});

test('Owner receives narrowly scoped dashboard read APIs without technical privileges',()=>{for(const path of ['/v1/dashboard/compare','/v1/dashboard/power-flow']){assert.equal(routeAllowed('owner','GET',path),true);assert.equal(routeAllowed('owner','HEAD',path),true);for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal(routeAllowed('owner',method,path),false);assert.equal(routeAllowed('school_user','GET',path),false);}for(const path of ['/v1/sites','/v1/gateways','/v1/dashboard/technical','/v1/settings/payload-presets'])assert.equal(routeAllowed('owner','GET',path),false);});
