import { Injectable } from "@nestjs/common";

import { buildDependencyHealth, type AppEnv } from "@solar/domain";

@Injectable()
export class HealthService {
  constructor(private readonly env: AppEnv) {}

  getSnapshot() {
    return {
      ...buildDependencyHealth("api", this.env),
      checkedAt: new Date().toISOString()
    };
  }
}

