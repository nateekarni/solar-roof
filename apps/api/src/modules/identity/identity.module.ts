import { Module } from "@nestjs/common";
import { loadEnv } from "@solar/domain";
import { DatabaseModule } from "../../database/database.module.js";
import { AuthController } from "./auth.controller.js";
import { SessionService } from "./session.service.js";
import { AuthService } from "./auth.service.js";
import { InvitationService } from "./invitation.service.js";
import { JwtAuthGuard } from "./jwt.guard.js";
import { MeController } from "./me.controller.js";
import { InvitationController } from "./invitation.controller.js";
import { UsersController } from "./users.controller.js";

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController, MeController, UsersController, InvitationController],
  providers: [
    {
      provide: AuthService,
      useFactory: () => {
        const env = loadEnv(process.env);
        return new AuthService(env.JWT_ACCESS_SECRET, env.JWT_REFRESH_SECRET);
      },
    },
    SessionService,
    InvitationService,
    JwtAuthGuard,
  ],
  exports: [SessionService, AuthService, InvitationService, JwtAuthGuard],
})
export class IdentityModule {}
