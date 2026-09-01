import { Module } from "@nestjs/common";
import { ContractService } from "./contract.service.js";
import { RateService } from "./rate.service.js";
import { BillingCalculationService } from "./billing-calculation.service.js";
import { BillingCycleService } from "./billing-cycle.service.js";
@Module({ providers: [ContractService, RateService, BillingCalculationService, BillingCycleService], exports: [ContractService, RateService, BillingCalculationService, BillingCycleService] })
export class BillingModule {}
