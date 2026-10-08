import {
  BadRequestException,
  UnauthorizedException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Query,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import { SiteSchoolUsersService } from "./site-school-users.service.js";

import { DatabaseService } from "../../database/database.service.js";
import { InvitationService, type InviteInput } from "./invitation.service.js";
import { Roles } from "../../common/roles.decorator.js";

@Controller("v1")
export class UsersController {
  constructor(
    @Inject(InvitationService) private readonly invitations: InvitationService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(SiteSchoolUsersService)
    private readonly siteUsers: SiteSchoolUsersService,
  ) {}

  @Roles("admin")
  @Get("sites/:siteId/school-users")
  listSiteUsers(@Param("siteId") siteId: string, @Req() req: any) {
    return this.siteUsers.list(siteId, req.user.id);
  }
  @Roles("admin")
  @Post("sites/:siteId/school-users")
  inviteSiteUser(
    @Param("siteId") siteId: string,
    @Body() body: { email: string; displayName: string },
    @Req() req: any,
  ) {
    return this.siteUsers.invite(siteId, body, req.user.id);
  }
  @Roles("admin")
  @Put("sites/:siteId/school-users/:userId")
  editSiteUser(
    @Param("siteId") siteId: string,
    @Param("userId") userId: string,
    @Body() body: unknown,
    @Req() req: any,
  ) {
    return this.siteUsers.update(siteId, userId, body, req.user.id);
  }
  @Roles("admin")
  @Delete("sites/:siteId/school-users/:userId")
  deleteSiteUser(
    @Param("siteId") siteId: string,
    @Param("userId") userId: string,
    @Req() req: any,
  ) {
    return this.siteUsers.remove(siteId, userId, req.user.id);
  }

  @Roles("owner", "admin")
  @Post("users/invite")
  async inviteUser(@Req() req: any, @Body() body: InviteInput) {
    return this.invitations.invite(body, req.user);
  }

  @Roles("owner", "admin")
  @Get("users/invitations")
  async findInvitation(@Req() req: any, @Query("email") email: string) {
    return this.invitations.findOutstanding(email, req.user);
  }
  @Roles("owner", "admin")
  @Post("users/invitations/:invitationId/resend")
  async resendInvitation(
    @Req() req: any,
    @Param("invitationId") invitationId: string,
  ) {
    return this.invitations.resend(invitationId, req.user);
  }
  @Get("notifications/settings")
  async getNotificationSettings(@Req() req: { user?: { id: string } }) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException("Not authenticated");
    const result = await this.db.query(
      "SELECT notification_preferences AS settings FROM users WHERE id=$1",
      [userId],
    );
    if (!result.rows.length) throw new UnauthorizedException("User not found");
    const settings = result.rows[0]!.settings;
    return {
      criticalEmailAlert: settings?.criticalEmailAlert ?? true,
      inAppNotification: settings?.inAppNotification ?? true,
      emailAddress: settings?.emailAddress ?? "",
    };
  }
  @Put("notifications/settings")
  async updateNotificationSettings(
    @Req() req: any,
    @Body()
    body: {
      criticalEmailAlert?: boolean;
      inAppNotification?: boolean;
      emailAddress?: string;
    },
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException("Not authenticated");
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some(
        (key) =>
          !["criticalEmailAlert", "inAppNotification", "emailAddress"].includes(
            key,
          ),
      ) ||
      (body.criticalEmailAlert !== undefined &&
        typeof body.criticalEmailAlert !== "boolean") ||
      (body.inAppNotification !== undefined &&
        typeof body.inAppNotification !== "boolean") ||
      (body.emailAddress !== undefined &&
        (typeof body.emailAddress !== "string" ||
          body.emailAddress.length > 254 ||
          (body.emailAddress.trim() !== "" &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.emailAddress.trim()))))
    )
      throw new BadRequestException("Invalid notification settings");
    const settings = {
      criticalEmailAlert: body.criticalEmailAlert ?? true,
      inAppNotification: body.inAppNotification ?? true,
      emailAddress: body.emailAddress?.trim() || "",
    };
    await this.db.query(
      "UPDATE users SET notification_preferences=$1::jsonb,updated_at=now() WHERE id=$2",
      [JSON.stringify(settings), userId],
    );
    return {
      success: true,
      settings,
      message: "บันทึกการตั้งค่าการแจ้งเตือนเรียบร้อยแล้ว",
    };
  }
}
