import { Module } from "@nestjs/common";

import { WorkerHealthModule } from "./health/health.module.js";

@Module({
  imports: [WorkerHealthModule]
})
export class WorkerAppModule {}

