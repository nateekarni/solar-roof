import { FinancialWorkController } from "./financial-work.controller.js";
import { FinancialAutomationService } from "./financial-automation.service.js";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { BillingCalculationService } from "./billing-calculation.service.js";
import { BillingController } from "./billing.controller.js";
import { BillingCycleService } from "./billing-cycle.service.js";
import { ContractService } from "./contract.service.js";
import { RateService } from "./rate.service.js";

@Module({
  imports: [DatabaseModule],
  controllers: [BillingController, FinancialWorkController],
  providers: [FinancialAutomationService, ContractService, RateService, BillingCalculationService, BillingCycleService],
  exports: [ContractService, RateService, BillingCalculationService, BillingCycleService],
})
export class BillingModule {}


