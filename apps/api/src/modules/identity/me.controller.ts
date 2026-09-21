import { Body, Controller, Get, Inject, Put, Req, Res, UnauthorizedException } from "@nestjs/common";
import { type Request, type Response } from "express";
import { DatabaseService } from "../../database/database.service.js";

@Controller("v1/me")
export class MeController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Get()
  async getMe(@Req() req: Request & { user?: { id: string } }) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException("Not authenticated");

    const query = `
      SELECT id, email, display_name AS "displayName", role, status, school_id AS "schoolId",
             preferred_language AS "preferredLanguage", preferred_theme AS "preferredTheme"
      FROM users
      WHERE id = $1
    `;
    const result = await this.db.query(query, [userId]);
    if (result.rows.length === 0) throw new UnauthorizedException("User not found");
    return result.rows[0];
  }

  @Put("preferences")
  async updatePreferences(
    @Req() req: Request & { user?: { id: string } },
    @Body() body: { preferredLanguage?: string; preferredTheme?: string },
    @Res({ passthrough: true }) res: Response
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException("Not authenticated");

    const lang = body.preferredLanguage;
    const theme = body.preferredTheme;

    const query = `
      UPDATE users
      SET preferred_language = COALESCE($1, preferred_language),
          preferred_theme = COALESCE($2, preferred_theme),
          updated_at = NOW()
      WHERE id = $3
      RETURNING preferred_language AS "preferredLanguage", preferred_theme AS "preferredTheme"
    `;
    const result = await this.db.query(query, [lang ?? null, theme ?? null, userId]);
    if (result.rows.length === 0) throw new UnauthorizedException("User not found");

    if (lang) {
      const isProd = process.env.NODE_ENV === "production";
      res.cookie("locale", lang, {
        httpOnly: false,
        secure: isProd,
        sameSite: "lax",
        path: "/",
        maxAge: 365 * 24 * 60 * 60 * 1000,
      });
    }

    return result.rows[0];
  }
}
