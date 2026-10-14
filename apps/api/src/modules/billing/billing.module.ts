import {SiteBillingService} from './site-billing.service.js';
import {SiteBillingController} from './site-billing.controller.js';
import { BillingSourceBindingController } from './billing-source-binding.controller.js';
import { BillingSourceBindingService } from './billing-source-binding.service.js';
import { ContractPdfService } from '../documents/contract-pdf.service.js';
import { FinancialApplicationService } from './financial-application.service.js';
import { FinancialScheduler } from './financial-scheduler.js';
import { FinancialReadinessModule } from "../financial-readiness/financial-readiness.module.js";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { BillingCalculationService } from "./billing-calculation.service.js";
import { BillingController } from "./billing.controller.js";
import { BillingCycleService } from "./billing-cycle.service.js";
import { ContractService } from "./contract.service.js";
import { RateService } from "./rate.service.js";

@Module({
  imports: [DatabaseModule, FinancialReadinessModule],
  controllers: [SiteBillingController, BillingController, BillingSourceBindingController],
  providers: [SiteBillingService, ContractPdfService, BillingSourceBindingService, FinancialApplicationService, FinancialScheduler, ContractService, RateService, BillingCalculationService, BillingCycleService],
  exports: [ContractService, RateService, BillingCalculationService, BillingCycleService],
})
export class BillingModule {}

