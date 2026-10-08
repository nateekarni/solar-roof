import { BillingSourceBindingController } from './billing-source-binding.controller.js';
import { BillingSourceBindingService } from './billing-source-binding.service.js';
import { LocalFinancialApplicationService } from './local-financial-application.service.js';
import { LocalFinancialScheduler } from './local-financial-scheduler.js';
import { FinancialReadinessService } from "./financial-readiness.service.js";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { BillingCalculationService } from "./billing-calculation.service.js";
import { BillingController } from "./billing.controller.js";
import { BillingCycleService } from "./billing-cycle.service.js";
import { ContractService } from "./contract.service.js";
import { RateService } from "./rate.service.js";

@Module({
  imports: [DatabaseModule],
  controllers: [BillingController, BillingSourceBindingController],
  providers: [BillingSourceBindingService, LocalFinancialApplicationService, LocalFinancialScheduler, FinancialReadinessService, ContractService, RateService, BillingCalculationService, BillingCycleService],
  exports: [ContractService, RateService, BillingCalculationService, BillingCycleService],
})
export class BillingModule {}
