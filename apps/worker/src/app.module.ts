import { Module } from "@nestjs/common";
import { WorkerHealthModule } from "./health/health.module.js";
import { CloseBillingCycleJob } from "./jobs/close-billing-cycle.job.js";
@Module({ imports: [WorkerHealthModule], providers: [CloseBillingCycleJob], exports: [CloseBillingCycleJob] })
export class WorkerAppModule {}
