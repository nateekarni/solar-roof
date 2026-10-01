import { Module } from "@nestjs/common";
import { TelemetryService } from "./telemetry.service.js";
import { MqttIngestionService } from "./mqtt-ingestion.service.js";
import { TelemetryController } from "./telemetry.controller.js";
import { IngestionDatabaseService } from './ingestion-database.service.js';

@Module({
  controllers: [TelemetryController],
  providers: [TelemetryService, IngestionDatabaseService, MqttIngestionService],
  exports: [TelemetryService, MqttIngestionService],
})
export class TelemetryModule {}
