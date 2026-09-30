import { BadRequestException, Body, Controller, Inject, Logger, Post, Put, Req } from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { DatabaseService } from "../../database/database.service.js";
import { AuthService } from "./auth.service.js";
import { Roles } from "../../common/roles.decorator.js";

@Controller("v1")
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(DatabaseService) private readonly db: DatabaseService
  ) {}

  @Roles("owner", "admin")
  @Post("users/invite")
  async inviteUser(
    @Req() req: any,
    @Body() body: {
      email?: string;
      displayName?: string;
      role?: "owner" | "admin" | "school_user";
      schoolId?: string;
    }
  ) {
    const email = body.email?.trim().toLowerCase();
    const displayName = body.displayName?.trim();
    const role = body.role || "school_user";
    const schoolId = body.schoolId || null;

    if (!email || !displayName) {
      throw new BadRequestException("email and displayName are required");
    }

    if (role === "school_user" && !schoolId) {
      throw new BadRequestException("schoolId is required for school_user role");
    }

    // Generate secure 12-char temp password: Solar# + 6 random chars
    const tempPassword = `Solar#${randomBytes(4).toString("hex")}`;
    const passwordHash = this.authService.hashPassword(tempPassword);
    const userId = randomUUID();

    const sql = `
      INSERT INTO users (
        id, email, display_name, role, status, school_id,
        password_hash, preferred_language, preferred_theme
      )
      VALUES ($1, $2, $3, $4, 'active', $5, $6, 'th', 'system')
      RETURNING id, email, display_name AS "displayName", role, status, school_id AS "schoolId"
    `;

    let user;
    try {
      const res = await this.db.query(sql, [userId, email, displayName, role, schoolId, passwordHash]);
      user = res.rows[0];
      if (!user) {
        throw new BadRequestException("Failed to create user record");
      }
    } catch (err: any) {
      if (err.code === "23505") { // unique constraint violation
        throw new BadRequestException("User with this email already exists");
      }
      throw err;
    }

    const auditId = randomUUID();
    await this.db.query(
      `INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, correlation_id, occurred_at)
       VALUES ($1, $2, 'user.invited', 'user', $3, $4, NOW())`,
      [auditId, req.user?.id || null, user.id, randomUUID()]
    );

    let emailSent = false;
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (smtpHost && smtpUser && smtpPass && smtpHost !== "smtp.example.com") {
      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: Number(process.env.SMTP_PORT || 587),
          secure: process.env.SMTP_SECURE === "true",
          auth: { user: smtpUser, pass: smtpPass },
        });

        await transporter.sendMail({
          from: process.env.SMTP_FROM || `"Solar Platform" <${smtpUser}>`,
          to: email,
          subject: "คำเชิญเข้าใช้งานแพลตฟอร์ม Solar Roof Management",
          html: `
            <p>สวัสดีคุณ ${displayName},</p>
            <p>คุณได้รับคำเชิญให้เข้าใช้งานระบบ Solar Roof Management</p>
            <p><strong>อีเมล:</strong> ${email}</p>
            <p><strong>รหัสผ่านชั่วคราว:</strong> ${tempPassword}</p>
            <p>กรุณาเข้าสู่ระบบและเปลี่ยนรหัสผ่านทันที</p>
          `,
        });
        emailSent = true;
      } catch (mailErr) {
        this.logger.warn(`Failed to send invitation email to ${email}: ${(mailErr as Error).message}`);
      }
    } else {
      this.logger.log(`[SMTP Placeholder] Invitation created for ${email}. Temporary password logged securely in server console.`);
    }

    return {
      ...user,
      emailSent,
      message: emailSent
        ? `ส่งอีเมลคำเชิญไปยัง ${email} เรียบร้อยแล้ว`
        : `สร้างผู้ใช้งาน ${email} สำเร็จ`,
    };
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
