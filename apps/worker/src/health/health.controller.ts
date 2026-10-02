import { Controller, Get, Inject } from "@nestjs/common";

import { WorkerHealthService } from "./health.service.js";
import {workerReleaseIdentity} from './release-identity.js';

@Controller("health")
export class WorkerHealthController {
  constructor(@Inject(WorkerHealthService) private readonly healthService: WorkerHealthService) {}

  @Get()
  getHealth() {
    return this.healthService.getSnapshot();
  }

  @Get('release-identity')
  releaseIdentity(){return workerReleaseIdentity();}
}
