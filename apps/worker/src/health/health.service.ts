import { Injectable } from "@nestjs/common";

import { buildDependencyHealth, type AppEnv } from "@solar/domain";

@Injectable()
export class WorkerHealthService {
  constructor(private readonly env: AppEnv) {}

  getSnapshot() {
    return {
      ...buildDependencyHealth("worker", this.env),
      checkedAt: new Date().toISOString(),
      queue: "idle"
    };
  }
}

