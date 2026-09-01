import { Controller, Get } from "@nestjs/common";

import { WorkerHealthService } from "./health.service.js";

@Controller("health")
export class WorkerHealthController {
  constructor(private readonly healthService: WorkerHealthService) {}

  @Get()
  getHealth() {
    return this.healthService.getSnapshot();
  }
}

