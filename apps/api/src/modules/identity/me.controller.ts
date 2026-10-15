import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Put,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { type Request, type Response } from "express";
import { DatabaseService } from "../../database/database.service.js";

@Controller("v1/me")
export class MeController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Get()
  async getMe(@Req() req: Request & { user?: { id: string;authorization?:unknown } }) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException("Not authenticated");

    const query = `
      SELECT u.id, u.email, u.display_name AS "displayName", u.role, u.status, u.customer_id AS "customerId",
             u.preferred_language AS "preferredLanguage", u.preferred_theme AS "preferredTheme", u.avatar_data AS "avatarData",
             p.name AS "companyPosition", (u.signature_data IS NOT NULL) AS "hasSignature"
      FROM users u LEFT JOIN employee_positions p ON p.id = u.company_position_id
      WHERE u.id = $1
    `;
    const result = await this.db.query(query, [userId]);
    if (result.rows.length === 0)
      throw new UnauthorizedException("User not found");
    const user = result.rows[0]!;
    return {...user, displayName: user.displayName, companyPosition: user.companyPosition,
      hasSignature: user.hasSignature, authorization: req.user?.authorization};
  }

  @Put("profile")
  async updateProfile(
    @Req() req: Request & { user?: { id: string } },
    @Body() body: unknown,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException("Not authenticated");
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      !Object.keys(body).length ||
      Object.keys(body).some((key) => key !== "displayName" && key !== "companyPosition")
    )
      throw new BadRequestException("Invalid profile fields");

    const payload = body as { displayName?: unknown; companyPosition?: unknown };

    let newDisplayName: string | undefined = undefined;
    if ("displayName" in payload) {
      const name = payload.displayName;
      if (typeof name !== "string" || !name.trim() || name.trim().length > 120)
        throw new BadRequestException("Invalid display name");
      newDisplayName = name.trim();
    }

    let hasPositionUpdate = false;
    let newCompanyPositionId: string | null = null;
    let newCompanyPositionName: string | null = null;

    if ("companyPosition" in payload) {
      hasPositionUpdate = true;
      const rawPos = payload.companyPosition;
      if (rawPos === null || (typeof rawPos === "string" && !rawPos.trim())) {
        newCompanyPositionId = null;
        newCompanyPositionName = null;
      } else if (typeof rawPos === "string") {
        const trimmedPos = rawPos.trim();
        if (trimmedPos.length > 120) throw new BadRequestException("Invalid position");
        const inserted = (await this.db.query(
          "INSERT INTO employee_positions(id,name) VALUES($1,$2) ON CONFLICT (employee_position_name_key(name)) DO NOTHING RETURNING id,name",
          [randomUUID(), trimmedPos],
        )).rows[0];
        const position = inserted ?? (await this.db.query(
          "SELECT id,name FROM employee_positions WHERE employee_position_name_key(name)=employee_position_name_key($1) FOR SHARE",
          [trimmedPos],
        )).rows[0];
        newCompanyPositionId = position?.id ?? null;
        newCompanyPositionName = position?.name ?? trimmedPos;
      } else {
        throw new BadRequestException("Invalid position");
      }
    }

    if (newDisplayName !== undefined && hasPositionUpdate) {
      const result = await this.db.query(
        `UPDATE users SET display_name = $1, company_position_id = $2, updated_at = NOW() WHERE id = $3 RETURNING display_name AS "displayName"`,
        [newDisplayName, newCompanyPositionId, userId],
      );
      if (!result.rows.length) throw new UnauthorizedException("User not found");
      return { displayName: result.rows[0].displayName, companyPosition: newCompanyPositionName };
    } else if (newDisplayName !== undefined) {
      const result = await this.db.query(
        `UPDATE users SET display_name = $1, updated_at = NOW() WHERE id = $2 RETURNING display_name AS "displayName"`,
        [newDisplayName, userId],
      );
      if (!result.rows.length) throw new UnauthorizedException("User not found");
      return { displayName: result.rows[0].displayName };
    } else if (hasPositionUpdate) {
      const result = await this.db.query(
        `UPDATE users SET company_position_id = $1, updated_at = NOW() WHERE id = $2 RETURNING display_name AS "displayName"`,
        [newCompanyPositionId, userId],
      );
      if (!result.rows.length) throw new UnauthorizedException("User not found");
      return { displayName: result.rows[0].displayName, companyPosition: newCompanyPositionName };
    }
  }

  @Get("profile")
  async getProfile(@Req() req: Request & { user?: { id: string } }) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException("Not authenticated");
    const result = await this.db.query(`
      SELECT u.display_name AS "displayName", p.name AS "companyPosition",
             (u.signature_data IS NOT NULL) AS "hasSignature", u.signature_data AS "signatureDataUri"
      FROM users u LEFT JOIN employee_positions p ON p.id = u.company_position_id
      WHERE u.id = $1
    `, [userId]);
    if (!result.rows.length) throw new UnauthorizedException("User not found");
    return result.rows[0];
  }

  @Put("preferences")
  async updatePreferences(
    @Req() req: Request & { user?: { id: string } },
    @Body() body: { preferredLanguage?: string; preferredTheme?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException("Not authenticated");

    if(!body||typeof body!=='object'||Array.isArray(body)||!Object.keys(body).length||Object.keys(body).some(key=>!['preferredLanguage','preferredTheme'].includes(key))||
      (body.preferredLanguage!==undefined&&!['th','en'].includes(body.preferredLanguage))||
      (body.preferredTheme!==undefined&&!['light','dark','system'].includes(body.preferredTheme)))throw new BadRequestException('Invalid preferences');
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
    const result = await this.db.query(query, [
      lang ?? null,
      theme ?? null,
      userId,
    ]);
    if (result.rows.length === 0)
      throw new UnauthorizedException("User not found");

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
