import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { type Request, type Response } from "express";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import { AuthService } from "./auth.service.js";
import { Public } from "./public.decorator.js";

function extractCookie(req: Request, name: string): string | undefined {
  if (req.cookies && req.cookies[name]) return req.cookies[name];
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  const match = cookieHeader.split(";").map(c => c.trim()).find(c => c.startsWith(`${name}=`));
  if (!match) return undefined;
  return decodeURIComponent(match.substring(name.length + 1));
}

@Controller("v1/auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(DatabaseService) private readonly db: DatabaseService
  ) {}

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: { email?: string; password?: string },
    @Res({ passthrough: true }) res: Response
  ) {
    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    if (!email || !password) {
      throw new UnauthorizedException("Email and password are required");
    }

    const query = `
      SELECT id, email, display_name, role, status, school_id, password_hash, preferred_language, preferred_theme
      FROM users
      WHERE email = $1
    `;
    const result = await this.db.query(query, [email]);
    const user = result.rows[0];
    if (!user) {
      throw new UnauthorizedException("Invalid email or password");
    }

    if (user.status !== "active") {
      throw new UnauthorizedException("User account is inactive");
    }

    if (!user.password_hash || !this.authService.verifyPassword(password, user.password_hash)) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const sessionId = randomUUID();
    const tokens = this.authService.issueTokens(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        schoolId: user.school_id || undefined,
      },
      sessionId
    );

    const refreshTokenHash = createHash("sha256").update(tokens.refreshToken).digest("hex");
    await this.db.query("UPDATE users SET refresh_token_hash = $1 WHERE id = $2", [
      refreshTokenHash,
      user.id,
    ]);

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
      [auditId, user.id, user.id, sessionId]
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
        schoolId: user.school_id,
        preferredLanguage: user.preferred_language,
        preferredTheme: user.preferred_theme,
      },
    };
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Body() body: { refreshToken?: string },
    @Res({ passthrough: true }) res: Response
  ) {
    const refreshToken = extractCookie(req, "refresh_token") || body?.refreshToken;
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
      SELECT id, email, display_name, role, status, school_id, refresh_token_hash, preferred_language, preferred_theme
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

    const expectedHash = createHash("sha256").update(refreshToken).digest("hex");
    if (!user.refresh_token_hash || user.refresh_token_hash !== expectedHash) {
      throw new UnauthorizedException("Refresh token revoked or reused");
    }

    const newSessionId = randomUUID();
    const tokens = this.authService.issueTokens(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        schoolId: user.school_id || undefined,
      },
      newSessionId
    );

    const newRefreshTokenHash = createHash("sha256").update(tokens.refreshToken).digest("hex");
    await this.db.query("UPDATE users SET refresh_token_hash = $1 WHERE id = $2", [
      newRefreshTokenHash,
      user.id,
    ]);

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
        schoolId: user.school_id,
        preferredLanguage: user.preferred_language,
        preferredTheme: user.preferred_theme,
      },
    };
  }

  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const refreshToken = extractCookie(req, "refresh_token");
    if (refreshToken) {
      const hash = createHash("sha256").update(refreshToken).digest("hex");
      const userRes = await this.db.query("SELECT id FROM users WHERE refresh_token_hash = $1", [hash]);
      const userId = userRes.rows[0]?.id;
      if (userId) {
        const auditId = randomUUID();
        await this.db.query(
          `INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, correlation_id, occurred_at)
           VALUES ($1, $2, 'user.logout', 'user', $3, $4, NOW())`,
          [auditId, userId, userId, randomUUID()]
        );
      }
      await this.db.query("UPDATE users SET refresh_token_hash = NULL WHERE refresh_token_hash = $1", [hash]);
    }

    res.clearCookie("refresh_token", { path: "/" });
    res.clearCookie("access_token", { path: "/" });

    return { success: true };
  }

  @Get("me")
  async me(@Req() req: Request & { user?: { id: string } }) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }

    const query = `
      SELECT id, email, display_name AS "displayName", role, status, school_id AS "schoolId",
             preferred_language AS "preferredLanguage", preferred_theme AS "preferredTheme"
      FROM users
      WHERE id = $1
    `;
    const result = await this.db.query(query, [userId]);
    const user = result.rows[0];
    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    return user;
  }
}
