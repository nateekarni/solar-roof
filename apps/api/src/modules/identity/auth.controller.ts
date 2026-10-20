import { FinancialReadinessService } from "../financial-readiness/financial-readiness.service.js";
import { customerScope } from "../../common/auth/route-policy.js";
import type { Authorization } from '../../common/auth/authorization.js';
import {
  BadRequestException,
  Put,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { type Request, type Response } from "express";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import { SessionService } from "./session.service.js";
import { AuthService } from "./auth.service.js";
import { Public } from "./public.decorator.js";
import { TwoFactorService } from './two-factor.service.js';
import { HttpException } from '@nestjs/common';

function extractCookie(req: Request, name: string): string | undefined {
  if (req.cookies && req.cookies[name]) return req.cookies[name];
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  if (!match) return undefined;
  try {
    return decodeURIComponent(match.substring(name.length + 1));
  } catch {
    return "invalid-cookie";
  }
}

@Controller("v1/auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(FinancialReadinessService)
    private readonly readiness: FinancialReadinessService,
    @Inject(TwoFactorService) private readonly twoFactor: TwoFactorService = new TwoFactorService(db,authService),
  ) {}

  @Get("capabilities")
  async capabilities(
    @Req() req: Request & { user?: { role: string; customerId?: string; authorization?:Authorization } },
  ) {
    const scope = customerScope(req.user);
    return {...await this.readiness.capabilities(
      req.user?.role ?? "",
      scope === null || scope.length > 0,
      req.user,
    ),authorization:req.user?.authorization};
  }

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: { email?: string; password?: string; secondFactorCode?: string; recoveryCode?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body || typeof body.email !== 'string' || typeof body.password !== 'string' || body.email.length>320 || body.password.length>128 ||
      (body.secondFactorCode!==undefined && (typeof body.secondFactorCode!=='string'||body.secondFactorCode.length>16)) ||
      (body.recoveryCode!==undefined && (typeof body.recoveryCode!=='string'||body.recoveryCode.length>32)))throw new UnauthorizedException('Invalid login fields');
    const email = body.email.trim().toLowerCase();
    const password = body.password;
    if (!email || !password) {
      throw new UnauthorizedException("Email and password are required");
    }

    const attempt = await this.db.transaction(async client=>{
      const query = `
        SELECT id, email, display_name, role, status, customer_id, ARRAY(SELECT site_id::text FROM site_account_assignments WHERE user_id=users.id AND revoked_at IS NULL) AS assigned_site_ids, password_hash, preferred_language, preferred_theme, avatar_data, phone
        FROM users
        WHERE email = $1 FOR UPDATE
      `;
      const result = await client.query(query, [email]);
      const user = result.rows[0];
      if (!user) {
        throw new UnauthorizedException("Invalid email or password");
      }

      if (user.status !== "active") {
        throw new UnauthorizedException("User account is inactive");
      }

      if (
        !user.password_hash ||
        !this.authService.verifyPassword(password, user.password_hash)
      ) {
        throw new UnauthorizedException("Invalid email or password");
      }

      const factor=await this.twoFactor.loginFactorInTransaction(client,user.id,body);
      if(factor!=='verified')return {factor,...await this.twoFactor.challengeInTransaction(client,user.id)};
      const sessionId=randomUUID();
      await client.query('INSERT INTO auth_sessions(sid,user_id) VALUES($1,$2)',[sessionId,user.id]);
      const tokens = this.authService.issueTokens(
        {
          id: user.id,
          email: user.email,
          role: user.role,
          customerId: user.customer_id || undefined,
        },
        sessionId,
      );

      const refreshTokenHash = createHash("sha256")
        .update(tokens.refreshToken)
        .digest("hex");
      await client.query('UPDATE auth_sessions SET refresh_hash=$3,expires_at=$4 WHERE sid=$1 AND user_id=$2',[sessionId,user.id,refreshTokenHash,this.authService.verifyRefreshToken(tokens.refreshToken).expiresAt]);
      return {factor:'verified' as const,user,tokens,sessionId};
    });
    if(attempt.factor==='required')return {requiresTwoFactor:true,method:attempt.method,...('maskedTarget' in attempt?{maskedTarget:attempt.maskedTarget}:{})};
    if(attempt.factor==='limited')throw new HttpException('Too many second-factor attempts; retry in 5 minutes',429);
    if(attempt.factor!=='verified'||!('tokens' in attempt))throw new UnauthorizedException('Invalid second factor');
    const {user,tokens,sessionId}=attempt;

    const isProd = process.env.NODE_ENV === "production";
    res.cookie("refresh_token", tokens.refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.cookie("access_token", tokens.accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60 * 1000,
    });
    res.cookie("locale", user.preferred_language || "th", {
      httpOnly: false,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });

    const auditId = randomUUID();
    await this.db.query(
      `INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, correlation_id, occurred_at)
       VALUES ($1, $2, 'user.login', 'user', $3, $4, NOW())`,
      [auditId, user.id, user.id, sessionId],
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresInSeconds: tokens.expiresInSeconds,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        customerId: user.customer_id,
        assignedSiteIds:user.assigned_site_ids ?? [],
        preferredLanguage: user.preferred_language,
        preferredTheme: user.preferred_theme,
        avatarData: user.avatar_data ?? null,
        phoneNumber: user.phone ?? null,
      },
    };
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Body() body: { refreshToken?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken =
      extractCookie(req, "refresh_token") || body?.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException("Refresh token is required");
    }

    let decoded;
    try {
      decoded = this.authService.verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const query = `
      SELECT id, email, display_name, role, status, customer_id, ARRAY(SELECT site_id::text FROM site_account_assignments WHERE user_id=users.id AND revoked_at IS NULL) AS assigned_site_ids, refresh_token_hash, preferred_language, preferred_theme, avatar_data, phone
      FROM users
      WHERE id = $1
    `;
    const result = await this.db.query(query, [decoded.id]);
    const user = result.rows[0];
    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    if (user.status !== "active") {
      throw new UnauthorizedException("User account is inactive");
    }

    const expectedHash = createHash("sha256")
      .update(refreshToken)
      .digest("hex");
    if (!(await this.sessions.isActive(decoded.sessionId, decoded.id))) {
      throw new UnauthorizedException("Refresh token revoked or reused");
    }

    const newSessionId = decoded.sessionId;
    const tokens = this.authService.issueTokens(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        customerId: user.customer_id || undefined,
      },
      newSessionId,
    );

    const newRefreshTokenHash = createHash("sha256")
      .update(tokens.refreshToken)
      .digest("hex");
    if (
      !(await this.sessions.rotate(
        decoded.sessionId,
        expectedHash,
        newRefreshTokenHash,
      ))
    ) {
      throw new UnauthorizedException("Refresh token revoked or reused");
    }

    const isProd = process.env.NODE_ENV === "production";
    res.cookie("refresh_token", tokens.refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.cookie("access_token", tokens.accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60 * 1000,
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresInSeconds: tokens.expiresInSeconds,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        customerId: user.customer_id,
        assignedSiteIds:user.assigned_site_ids ?? [],
        preferredLanguage: user.preferred_language,
        preferredTheme: user.preferred_theme,
        avatarData: user.avatar_data ?? null,
        phoneNumber: user.phone ?? null,
      },
    };
  }

  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Access identifies the verified device even if its refresh cookie is stale.
    const accessToken =
      extractCookie(req, "access_token") ||
      (req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7).trim()
        : undefined);
    const refreshToken = extractCookie(req, "refresh_token");
    let verified;
    try {
      if (accessToken)
        verified = this.authService.verifyAccessToken(accessToken);
    } catch {}
    if (!verified) {
      try {
        if (refreshToken)
          verified = this.authService.verifyRefreshToken(refreshToken);
      } catch {}
    }
    if (
      verified &&
      (await this.sessions.isActive(verified.sessionId, verified.id))
    ) {
      await this.sessions.revoke(verified.sessionId);
    } else if (!req.headers.origin && !req.headers.cookie) {
      // The nonbrowser origin exception still requires a verified active JWT.
      throw new UnauthorizedException("Invalid or inactive logout token");
    }

    res.clearCookie("refresh_token", { path: "/" });
    res.clearCookie("access_token", { path: "/" });

    return { success: true };
  }

  @Put("password")
  async changePassword(
    @Req() req: Request & { user?: { id: string } },
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException("Not authenticated");
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some(
        (key) => !["currentPassword", "newPassword"].includes(key),
      )
    )
      throw new BadRequestException("Invalid password fields");
    const { currentPassword, newPassword } = body as {
      currentPassword?: unknown;
      newPassword?: unknown;
    };
    if (
      typeof currentPassword !== "string" ||
      currentPassword.length > 128 ||
      typeof newPassword !== "string" ||
      newPassword.length < 12 ||
      newPassword.length > 128
    )
      throw new BadRequestException(
        "Password must be between 12 and 128 characters",
      );
    await this.db.transaction(async (client) => {
      const result = await client.query(
        "SELECT password_hash FROM users WHERE id=$1 AND status='active' FOR UPDATE",
        [userId],
      );
      const hash = result.rows[0]?.password_hash;
      if (!hash || !this.authService.verifyPassword(currentPassword, hash))
        throw new UnauthorizedException("Current password is incorrect");
      // Password rotation invalidates every previously issued recovery challenge
      // while retaining the users lock shared by reset and second-factor flows.
      await client.query(
        "UPDATE user_password_resets SET consumed_at=NOW() WHERE user_id=$1 AND consumed_at IS NULL",
        [userId],
      );
      await client.query("DELETE FROM user_email_otp WHERE user_id=$1", [userId]);
      const updated = this.authService.hashPassword(newPassword);
      await client.query(
        "UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2",
        [updated, userId],
      );
      await client.query(
        "UPDATE auth_sessions SET revoked_at=NOW(),refresh_hash=NULL WHERE user_id=$1 AND revoked_at IS NULL",
        [userId],
      );
      await client.query(
        `INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,correlation_id) VALUES($1,$2,'user.password_changed','user',$2,$3)`,
        [randomUUID(), userId, randomUUID()],
      );
    });
    res.clearCookie("access_token", { path: "/" });
    res.clearCookie("refresh_token", { path: "/" });
    return { success: true };
  }

  @Get("me")
  async me(@Req() req: Request & { user?: { id: string;authorization?:unknown } }) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }

    const query = `
      SELECT id, email, display_name AS "displayName", role, status, customer_id AS "customerId", ARRAY(SELECT site_id::text FROM site_account_assignments WHERE user_id=users.id AND revoked_at IS NULL) AS "assignedSiteIds",
             preferred_language AS "preferredLanguage", preferred_theme AS "preferredTheme", avatar_data AS "avatarData", phone AS "phoneNumber"
      FROM users
      WHERE id = $1
    `;
    const result = await this.db.query(query, [userId]);
    const user = result.rows[0];
    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    return {...user,authorization:req.user?.authorization};
  }
}
