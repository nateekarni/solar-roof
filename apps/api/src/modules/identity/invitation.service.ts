import { createHash, randomBytes } from "node:crypto";
export interface Invitation { id: string; email: string; role: "admin" | "school_user"; schoolId?: string | undefined; tokenHash: string; expiresAt: Date; acceptedAt?: Date; }
export class InvitationService {
  constructor(private readonly ttlMs = 86400000) {}
  create(input: { email: string; role: "admin" | "school_user"; schoolId?: string }): { invitation: Invitation; token: string } {
    if (input.role === "school_user" && !input.schoolId) throw new Error("school_user invitation requires schoolId");
    const token = randomBytes(32).toString("base64url");
    return { token, invitation: { id: randomBytes(16).toString("hex"), email: input.email.trim().toLowerCase(), role: input.role, schoolId: input.schoolId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + this.ttlMs) } };
  }
  accept(invitation: Invitation, token: string): Invitation {
    if (invitation.acceptedAt || invitation.expiresAt.getTime() <= Date.now()) throw new Error("Invitation is no longer valid");
    if (createHash("sha256").update(token).digest("hex") !== invitation.tokenHash) throw new Error("Invalid invitation token");
    return { ...invitation, acceptedAt: new Date() };
  }
}