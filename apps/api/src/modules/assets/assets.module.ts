import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { TelemetryModule } from "../telemetry/telemetry.module.js";
import { AssetsController } from "./assets.controller.js";
import { AssetsService } from "./assets.service.js";
import { MeasurementComparisonWorker } from './measurement-comparison-worker.js';

@Module({
  imports: [DatabaseModule, TelemetryModule],
  controllers: [AssetsController],
  providers: [AssetsService,MeasurementComparisonWorker],
  exports: [AssetsService],
})
export class AssetsModule {}
