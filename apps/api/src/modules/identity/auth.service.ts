import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export interface AuthUser { id: string; email: string; role: "owner" | "admin" | "school_user"; schoolId?: string | undefined; }
export interface TokenPair { accessToken: string; refreshToken: string; expiresInSeconds: number; }

function encode(input: string): string { return Buffer.from(input).toString("base64url"); }
function sign(payload: Record<string, unknown>, secret: string): string {
  const body = encode(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return body + "." + signature;
}
function verify(token: string, secret: string): Record<string, unknown> {
  const [body, signature] = token.split(".");
  if (!body || !signature) throw new Error("Invalid token");
  const expected = createHmac("sha256", secret).update(body).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Invalid token");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
  if (typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)) throw new Error("Token expired");
  return payload;
}
export class AuthService {
  constructor(private readonly accessSecret: string, private readonly refreshSecret: string, private readonly accessTtlSeconds = 900, private readonly refreshTtlSeconds = 604800) {}
  hashPassword(password: string): string {
    if (password.length < 12) throw new Error("Password must be at least 12 characters");
    const salt = randomBytes(16).toString("hex");
    return "scrypt:" + salt + ":" + scryptSync(password, salt, 64).toString("hex");
  }
  verifyPassword(password: string, encoded: string): boolean {
    const [algorithm, salt, expectedHex] = encoded.split(":");
    if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
    const actual = scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, "hex");
    return expected.length === actual.length && timingSafeEqual(actual, expected);
  }
  issueTokens(user: AuthUser, sessionId: string): TokenPair {
    const now = Math.floor(Date.now() / 1000);
    const claims = { sub: user.id, email: user.email, role: user.role, schoolId: user.schoolId, sid: sessionId };
    return { accessToken: sign({ ...claims, iat: now, exp: now + this.accessTtlSeconds, typ: "access" }, this.accessSecret), refreshToken: sign({ ...claims, iat: now, exp: now + this.refreshTtlSeconds, typ: "refresh" }, this.refreshSecret), expiresInSeconds: this.accessTtlSeconds };
  }
  verifyAccessToken(token: string): AuthUser & { sessionId: string } {
    const payload = verify(token, this.accessSecret);
    if (payload.typ !== "access" || typeof payload.sub !== "string" || typeof payload.email !== "string" || typeof payload.role !== "string" || typeof payload.sid !== "string") throw new Error("Invalid access claims");
    return { id: payload.sub, email: payload.email, role: payload.role as AuthUser["role"], schoolId: typeof payload.schoolId === "string" ? payload.schoolId : undefined, sessionId: payload.sid };
  }
}