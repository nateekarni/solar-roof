import assert from "node:assert/strict";
import test from "node:test";
import { AuthService } from "./auth.service.js";
import { canGrantInvitation } from "./invitation.service.js";
const auth = new AuthService("access-secret-access-secret-access-secret", "refresh-secret-refresh-secret-refresh-secret");
test("password hashing verifies without storing password", () => { const encoded = auth.hashPassword("a-long-password-123"); assert.equal(auth.verifyPassword("a-long-password-123", encoded), true); assert.equal(auth.verifyPassword("wrong-password-123", encoded), false); });
test("access token round trips scoped claims", () => { const tokens = auth.issueTokens({ id: "u1", email: "user@example.com", role: "customer_user", customerId: "s1" }, "session-1"); assert.equal(auth.verifyAccessToken(tokens.accessToken).customerId, "s1"); });
test("invitation policy requires current issuer authority and customer scope", () => {
  const admin={role:'admin',status:'active',customerId:'customer-a'};
  assert.equal(canGrantInvitation(admin,'customer_user','customer-a'),false);
  assert.equal(canGrantInvitation(admin,'customer_user','customer-b'),false);
  assert.equal(canGrantInvitation(admin,'owner',null),false);
  assert.equal(canGrantInvitation(admin,'operator',null),true);
  assert.equal(canGrantInvitation({role:'owner',status:'active'},'accountant',null),true);
  assert.equal(canGrantInvitation({role:'owner',status:'active'},'customer_user','customer-a'),true);
  assert.equal(canGrantInvitation({...admin,status:'disabled'},'customer_user','customer-a'),false);
  assert.equal(canGrantInvitation({role:'owner',status:'active'},'owner',null),false);
});
