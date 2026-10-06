import { Controller, Get, Inject, Res } from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../modules/identity/public.decorator.js";
import { HealthService } from "./health.service.js";
import { MqttIngestionService } from "../modules/telemetry/mqtt-ingestion.service.js";

@Controller()
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService,
    @Inject(MqttIngestionService) private readonly mqtt: MqttIngestionService) {}

  @Public()
  @Get("ready/mqtt")
  getMqttReadiness(@Res({ passthrough: true }) response: Response) {
    const snapshot = this.mqtt.getConnectionHealth();
    response.status(snapshot.status === 'ready' || snapshot.status === 'disabled' ? 200 : 503);
    response.setHeader('Cache-Control', 'no-store');
    return snapshot;
  }

  @Public()
  @Get("health")
  getHealth() { return this.healthService.getSnapshot(); }

  @Public()
  @Get("ready")
  async getReadiness(@Res({ passthrough: true }) response: Response) {
    const snapshot = await this.healthService.getReadiness();
    response.status(snapshot.status === "ready" ? 200 : 503);
    response.setHeader("Cache-Control", "no-store");
    return snapshot;
  }
}
