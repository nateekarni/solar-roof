import { Controller, Get } from "@nestjs/common";
import { Public } from "../modules/identity/public.decorator.js";
import { HealthService } from "./health.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  getHealth() {
    return this.healthService.getSnapshot();
  }
}

