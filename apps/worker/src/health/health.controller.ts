import { Controller, Get, Inject } from "@nestjs/common";

import { WorkerHealthService } from "./health.service.js";

@Controller("health")
export class WorkerHealthController {
  constructor(@Inject(WorkerHealthService) private readonly healthService: WorkerHealthService) {}

  @Get()
  getHealth() {
    return this.healthService.getSnapshot();
  }
}
