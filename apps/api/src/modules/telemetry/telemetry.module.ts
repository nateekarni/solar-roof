import { Module } from "@nestjs/common";
import { TelemetryService } from "./telemetry.service.js";
import { MqttIngestionService } from "./mqtt-ingestion.service.js";
import { TelemetryController } from "./telemetry.controller.js";
import { MqttAuthController } from "./mqtt-auth.controller.js";
import { IngestionDatabaseService } from './ingestion-database.service.js';
import { GatewayControlModule } from '../gateway-control/gateway-control.module.js';

@Module({
  imports: [GatewayControlModule],
  controllers: [TelemetryController, MqttAuthController],
  providers: [TelemetryService, IngestionDatabaseService, MqttIngestionService],
  exports: [TelemetryService, MqttIngestionService],
})
export class TelemetryModule {}
