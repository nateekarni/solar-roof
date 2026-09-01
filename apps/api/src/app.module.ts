import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module.js";
import { AssetsModule } from "./modules/assets/assets.module.js";
import { TelemetryModule } from "./modules/telemetry/telemetry.module.js";
import { AlarmsModule } from "./modules/alarms/alarms.module.js";
import { BillingModule } from "./modules/billing/billing.module.js";
@Module({ imports: [HealthModule, AssetsModule, TelemetryModule, AlarmsModule, BillingModule] })
export class AppModule {}
