import assert from "node:assert/strict";
import test from "node:test";
import { AuthService } from "./auth.service.js";
import { canGrantInvitation } from "./invitation.service.js";
const auth = new AuthService("access-secret-access-secret-access-secret", "refresh-secret-refresh-secret-refresh-secret");
test("password hashing verifies without storing password", () => { const encoded = auth.hashPassword("a-long-password-123"); assert.equal(auth.verifyPassword("a-long-password-123", encoded), true); assert.equal(auth.verifyPassword("wrong-password-123", encoded), false); });
test("access token round trips scoped claims", () => { const tokens = auth.issueTokens({ id: "u1", email: "user@example.com", role: "school_user", schoolId: "s1" }, "session-1"); assert.equal(auth.verifyAccessToken(tokens.accessToken).schoolId, "s1"); });
test("invitation policy requires current issuer authority and school scope", () => {
  const admin={role:'admin',status:'active',schoolId:'school-a'};
  assert.equal(canGrantInvitation(admin,'school_user','school-a'),true);
  assert.equal(canGrantInvitation(admin,'school_user','school-b'),false);
  assert.equal(canGrantInvitation(admin,'owner',null),false);
  assert.equal(canGrantInvitation({...admin,status:'disabled'},'school_user','school-a'),false);
  assert.equal(canGrantInvitation({role:'owner',status:'active'},'owner',null),true);
});
