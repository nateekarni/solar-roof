import { Module } from "@nestjs/common";
import { SettingsController } from "./settings.controller.js";
import { MeterPresetsController } from "./meter-presets.controller.js";
import { SettingsService } from "./settings.service.js";

@Module({
  controllers: [SettingsController, MeterPresetsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
