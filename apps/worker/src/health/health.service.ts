import { Injectable } from "@nestjs/common";
import type { WorkerEnv } from "@solar/domain";

@Injectable()
export class WorkerHealthService {
  constructor(private readonly env: WorkerEnv) {}

  getSnapshot() {
    return {
      service: "worker",
      status: "healthy",
      checkedAt: new Date().toISOString(),
      queue: "idle"
    };
  }
}
