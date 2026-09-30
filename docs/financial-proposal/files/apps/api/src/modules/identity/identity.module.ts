import { Module } from "@nestjs/common";
import { loadEnv } from "@solar/domain";
import { DatabaseModule } from "../../database/database.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { InvitationService } from "./invitation.service.js";
import { JwtAuthGuard } from "./jwt.guard.js";
import { MeController } from "./me.controller.js";
import { UsersController } from "./users.controller.js";
import { EmailVerificationController } from "./email-verification.controller.js";

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController, MeController, UsersController, EmailVerificationController],
  providers: [
    {
      provide: AuthService,
      useFactory: () => {
        const env = loadEnv(process.env);
        return new AuthService(env.JWT_ACCESS_SECRET, env.JWT_REFRESH_SECRET);
      },
    },
    InvitationService,
    JwtAuthGuard,
  ],
  exports: [AuthService, InvitationService, JwtAuthGuard],
})
export class IdentityModule {}
