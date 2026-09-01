import { Module } from "@nestjs/common";

import { HealthModule } from "./health/health.module.js";
import { AssetsModule } from "./modules/assets/assets.module.js";

@Module({
  imports: [HealthModule, AssetsModule]
})
export class AppModule {}

