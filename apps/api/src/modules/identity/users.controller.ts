import { Body, Controller, Get, Inject, Param, Query, Post, Put, Req } from "@nestjs/common";


import { DatabaseService } from "../../database/database.service.js";
import { InvitationService, type InviteInput } from "./invitation.service.js";
import { Roles } from "../../common/roles.decorator.js";

@Controller("v1")
export class UsersController {


  constructor(
    @Inject(InvitationService) private readonly invitations: InvitationService,
    @Inject(DatabaseService) private readonly db: DatabaseService
  ) {}

  @Roles("owner", "admin")
  @Post("users/invite")
  async inviteUser(@Req() req: any, @Body() body: InviteInput) {
    return this.invitations.invite(body,req.user);
  }

  @Roles("owner", "admin")
  @Get("users/invitations")
  async findInvitation(@Req() req: any, @Query("email") email: string) {
    return this.invitations.findOutstanding(email,req.user);
  }
  @Roles("owner", "admin")
  @Post("users/invitations/:invitationId/resend")
  async resendInvitation(@Req() req: any, @Param("invitationId") invitationId: string) {
    return this.invitations.resend(invitationId,req.user);
  }
  @Put("notifications/settings")
  async updateNotificationSettings(@Req() req: any, @Body() body: {
    criticalEmailAlert?: boolean;
    inAppNotification?: boolean;
    emailAddress?: string;
  }) {
    const settings = {
      criticalEmailAlert: body.criticalEmailAlert ?? true,
      inAppNotification: body.inAppNotification ?? true,
      emailAddress: body.emailAddress?.trim() || "",
    };
    await this.db.query("UPDATE users SET notification_preferences=$1::jsonb,updated_at=now() WHERE id=$2", [JSON.stringify(settings),req.user.id]);
    return {
      success: true,
      settings,
      message: "บันทึกการตั้งค่าการแจ้งเตือนเรียบร้อยแล้ว",
    };
  }
}
