import { Module } from "@nestjs/common";

import { loadEnv } from "@solar/domain";

import { HealthController } from "./health.controller.js";
import { HealthService } from "./health.service.js";

const envProvider = {
  provide: "APP_ENV",
  useFactory: () => loadEnv(process.env)
};

@Module({
  controllers: [HealthController],
  providers: [
    envProvider,
    {
      provide: HealthService,
      useFactory: (env: ReturnType<typeof loadEnv>) => new HealthService(env),
      inject: ["APP_ENV"]
    }
  ],
  exports: [HealthService]
})
export class HealthModule {}

