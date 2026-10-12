import assert from "node:assert/strict";
import test from "node:test";
import { canAccess, type AccessActor } from "../src/access/access-policy.js";

const owner: AccessActor = { id: "o", role: "owner" };
const admin: AccessActor = { id: "a", role: "admin", assignedCustomerIds: ["customer-a"] };
const user: AccessActor = { id: "u", role: "customer_user", customerId: "customer-a", assignedSiteIds:["site-a"] };

test("owner can access every resource", () => assert.equal(canAccess(owner, "manage", { customerId: "customer-z" }), true));
test("admin has global resource access", () => {
  assert.equal(canAccess(admin, "manage", { customerId: "customer-a", siteId:"site-a" }), true);
  assert.equal(canAccess(admin, "manage", { customerId: "customer-z" }), true);
});
test("customer user can read and upload evidence only in own customer", () => {
  assert.equal(canAccess(user, "read", { customerId: "customer-a", siteId:"site-a" }), true);
  assert.equal(canAccess(user, "upload_evidence", { customerId: "customer-a", siteId:"site-a" }), true);
  assert.equal(canAccess(user, "finalize", { customerId: "customer-a" }), false);
  assert.equal(canAccess(user, "read", { customerId: "customer-z" }), false);
});
test('unknown resource roles cannot gain access through a matching customer',()=>{
 const actor={id:'x',role:'unknown',customerId:'customer-a'} as unknown as AccessActor;
 assert.equal(canAccess(actor,'read',{customerId:'customer-a'}),false);
});

test('customer access requires the exact persisted site assignment',()=>{
 const scoped:AccessActor={...user,assignedSiteIds:['site-a']};
 assert.equal(canAccess(scoped,'read',{customerId:'customer-a',siteId:'site-b'}),false);
 assert.equal(canAccess({...user,assignedSiteIds:[]},'read',{customerId:'customer-a',siteId:'site-a'}),false);
 assert.equal(canAccess(scoped,'read',{customerId:'customer-a',siteId:'site-a'}),true);
});
