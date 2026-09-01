import assert from "node:assert/strict";
import test from "node:test";
import { AuthService } from "./auth.service.js";
import { InvitationService } from "./invitation.service.js";
const auth = new AuthService("access-secret-access-secret-access-secret", "refresh-secret-refresh-secret-refresh-secret");
test("password hashing verifies without storing password", () => { const encoded = auth.hashPassword("a-long-password-123"); assert.equal(auth.verifyPassword("a-long-password-123", encoded), true); assert.equal(auth.verifyPassword("wrong-password-123", encoded), false); });
test("access token round trips scoped claims", () => { const tokens = auth.issueTokens({ id: "u1", email: "user@example.com", role: "school_user", schoolId: "s1" }, "session-1"); assert.equal(auth.verifyAccessToken(tokens.accessToken).schoolId, "s1"); });
test("invitation is scoped and single use", () => { const service = new InvitationService(); assert.throws(() => service.create({ email: "u@example.com", role: "school_user" }), /schoolId/); const { invitation, token } = service.create({ email: "u@example.com", role: "school_user", schoolId: "s1" }); const accepted = service.accept(invitation, token); assert.ok(accepted.acceptedAt); assert.throws(() => service.accept(accepted, token), /no longer valid/); });