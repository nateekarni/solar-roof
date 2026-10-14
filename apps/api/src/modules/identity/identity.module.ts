import { FinancialReadinessModule } from "../financial-readiness/financial-readiness.module.js";
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
import {SiteCustomerUsersService} from './site-customer-users.service.js';
import { AuthorizationService } from './authorization.service.js';
import { TeamService } from './team.service.js';
import { TeamController } from './team.controller.js';
import {TwoFactorController} from './two-factor.controller.js';
import {TwoFactorService} from './two-factor.service.js';
import {PasswordResetController} from './password-reset.controller.js';
import {AvatarController} from './avatar.controller.js';
import {PersonalSignatureController} from './personal-signature.controller.js';
import {DatabaseService} from '../../database/database.service.js';

@Module({
  imports: [DatabaseModule, FinancialReadinessModule],
  controllers: [AuthController, MeController, UsersController, InvitationController, TeamController, TwoFactorController, AvatarController, PersonalSignatureController, PasswordResetController],
  providers: [
    {
      provide: AuthService,
      useFactory: () => {
        const env = loadEnv(process.env);
        return new AuthService(env.JWT_ACCESS_SECRET, env.JWT_REFRESH_SECRET);
      },
    },
    SessionService,
    {provide:TwoFactorService,inject:[DatabaseService,AuthService],useFactory:(db:DatabaseService,auth:AuthService)=>new TwoFactorService(db,auth)},
    AuthorizationService,
    TeamService,
    InvitationService,
    SiteCustomerUsersService,
    JwtAuthGuard,
  ],
  exports: [SessionService, AuthService, InvitationService, JwtAuthGuard, AuthorizationService],
})
export class IdentityModule {}
