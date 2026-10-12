import { type CanActivate, type ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SessionService } from "./session.service.js";
import { AuthService } from "./auth.service.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";
import { DatabaseService } from "../../database/database.service.js";
import { AuthorizationService } from './authorization.service.js';

function extractToken(request: any): string | undefined {
  if (request.cookies && request.cookies.access_token) {
    return request.cookies.access_token;
  }
  const cookieHeader = request.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.split(";").map((c: string) => c.trim()).find((c: string) => c.startsWith("access_token="));
    if (match) {
      try { return decodeURIComponent(match.substring("access_token=".length)); } catch { return "invalid-cookie"; }
    }
  }
  const authHeader = request.headers.authorization;
  if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  return undefined;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(Reflector) private readonly reflector: Reflector
    , @Inject(DatabaseService) private readonly db: DatabaseService
    , @Inject(SessionService) private readonly sessions: SessionService
    , @Inject(AuthorizationService) private readonly authorization: AuthorizationService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = extractToken(request);
    if (!token) {
      context.switchToHttp().getResponse().setHeader("X-Auth-Retry-Safe", "1");
      throw new UnauthorizedException("Missing authentication token");
    }

    try {
      const user = this.authService.verifyAccessToken(token);
      if (!(await this.sessions.isActive(user.sessionId, user.id))) throw new UnauthorizedException("Session is inactive");
      const result = await this.db.query("SELECT id, role, customer_id, status, ARRAY(SELECT site_id::text FROM site_account_assignments WHERE user_id=users.id AND revoked_at IS NULL) AS assigned_site_ids FROM users WHERE id=$1", [user.id]);
      const current = result.rows[0];
      if (!current || current.status !== "active") throw new UnauthorizedException("Account is inactive");
      request.user = { ...user, role: current.role, customerId: current.customer_id ?? undefined, assignedSiteIds: current.assigned_site_ids ?? [], authorization:await this.authorization.load(user.id,current.role) };
      return true;
    } catch {
      context.switchToHttp().getResponse().setHeader("X-Auth-Retry-Safe", "1");
      throw new UnauthorizedException("Invalid or expired access token");
    }
  }
}
