import { Module } from "@nestjs/common";

import { HealthModule } from "./health/health.module.js";
import { AssetsModule } from "./modules/assets/assets.module.js";
import { TelemetryModule } from "./modules/telemetry/telemetry.module.js";

@Module({
  imports: [HealthModule, AssetsModule, TelemetryModule]
})
export class AppModule {}

