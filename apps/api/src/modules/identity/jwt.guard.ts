import { type CanActivate, type ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthService } from "./auth.service.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";
import { DatabaseService } from "../../database/database.service.js";

function extractToken(request: any): string | undefined {
  if (request.cookies && request.cookies.access_token) {
    return request.cookies.access_token;
  }
  const cookieHeader = request.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.split(";").map((c: string) => c.trim()).find((c: string) => c.startsWith("access_token="));
    if (match) {
      return decodeURIComponent(match.substring("access_token=".length));
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
      throw new UnauthorizedException("Missing authentication token");
    }

    try {
      const user = this.authService.verifyAccessToken(token);
      const result = await this.db.query("SELECT id, role, school_id, status FROM users WHERE id=$1", [user.id]);
      const current = result.rows[0];
      if (!current || current.status !== "active") throw new UnauthorizedException("Account is inactive");
      request.user = { ...user, role: current.role, schoolId: current.school_id ?? undefined };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired access token");
    }
  }
}
