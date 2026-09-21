import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { BillingCalculationService } from "./billing-calculation.service.js";
import { BillingController } from "./billing.controller.js";
import { BillingCycleService } from "./billing-cycle.service.js";
import { ContractService } from "./contract.service.js";
import { RateService } from "./rate.service.js";

@Module({
  imports: [DatabaseModule],
  controllers: [BillingController],
  providers: [ContractService, RateService, BillingCalculationService, BillingCycleService],
  exports: [ContractService, RateService, BillingCalculationService, BillingCycleService],
})
export class BillingModule {}
