import { Module } from "@nestjs/common";

import { loadWorkerEnv } from "@solar/domain";

import { WorkerHealthController } from "./health.controller.js";
import { WorkerHealthService } from "./health.service.js";

const envProvider = {
  provide: "APP_ENV",
  useFactory: () => loadWorkerEnv(process.env)
};

@Module({
  controllers: [WorkerHealthController],
  providers: [
    envProvider,
    {
      provide: WorkerHealthService,
      useFactory: (env: ReturnType<typeof loadWorkerEnv>) => new WorkerHealthService(env),
      inject: ["APP_ENV"]
    }
  ],
  exports: [WorkerHealthService]
})
export class WorkerHealthModule {}
