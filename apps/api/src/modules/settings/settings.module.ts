import { Module } from "@nestjs/common";
import { FinancialReadinessModule } from '../financial-readiness/financial-readiness.module.js';
import { SettingsController } from "./settings.controller.js";
import { BrandingController } from './branding.controller.js';
import { MeterPresetsController } from "./meter-presets.controller.js";
import { PayloadPresetsController } from "./payload-presets.controller.js";
import { SettingsService } from "./settings.service.js";

@Module({
  imports: [FinancialReadinessModule],
  controllers: [SettingsController, BrandingController, MeterPresetsController, PayloadPresetsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
