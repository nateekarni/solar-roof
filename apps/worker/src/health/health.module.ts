import { Module } from "@nestjs/common";

import { loadEnv } from "@solar/domain";

import { WorkerHealthController } from "./health.controller.js";
import { WorkerHealthService } from "./health.service.js";

const envProvider = {
  provide: "APP_ENV",
  useFactory: () => loadEnv(process.env)
};

@Module({
  controllers: [WorkerHealthController],
  providers: [
    envProvider,
    {
      provide: WorkerHealthService,
      useFactory: (env: ReturnType<typeof loadEnv>) => new WorkerHealthService(env),
      inject: ["APP_ENV"]
    }
  ],
  exports: [WorkerHealthService]
})
export class WorkerHealthModule {}

