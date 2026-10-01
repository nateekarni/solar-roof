import { JobsModule } from './modules/jobs/jobs.module.js';
import { Module } from "@nestjs/common";
import { DatabaseModule } from "./database/database.module.js";
import { HealthModule } from "./health/health.module.js";
import { AlarmsModule } from "./modules/alarms/alarms.module.js";
import { AssetsModule } from "./modules/assets/assets.module.js";
import { BillingModule } from "./modules/billing/billing.module.js";
import { DashboardModule } from "./modules/dashboard/dashboard.module.js";
import { DocumentsModule } from "./modules/documents/documents.module.js";
import { IdentityModule } from "./modules/identity/identity.module.js";
import { PaymentsModule } from "./modules/payments/payments.module.js";
import { ReportsModule } from "./modules/reports/reports.module.js";
import { SettingsModule } from "./modules/settings/settings.module.js";
import { TelemetryModule } from "./modules/telemetry/telemetry.module.js";

import { APP_GUARD } from "@nestjs/core";
import { JwtAuthGuard } from "./modules/identity/jwt.guard.js";
import { RolesGuard } from "./common/roles.guard.js";
import { PlatformAccessGuard } from "./common/auth/platform-access.guard.js";
import { RequestOriginGuard } from "./common/auth/request-origin.guard.js";

@Module({
  imports: [
    DatabaseModule,
    DashboardModule,
    HealthModule,
    IdentityModule,
    AssetsModule,
    TelemetryModule,
    AlarmsModule,
    BillingModule,
    DocumentsModule,
    PaymentsModule,
    ReportsModule,
    JobsModule,
    SettingsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: RequestOriginGuard },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    { provide: APP_GUARD, useClass: PlatformAccessGuard },
  ],
})
export class AppModule {}
