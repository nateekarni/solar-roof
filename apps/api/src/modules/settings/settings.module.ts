import { Module } from "@nestjs/common";
import { SettingsController } from "./settings.controller.js";
import { MeterPresetsController } from "./meter-presets.controller.js";
import { PayloadPresetsController } from "./payload-presets.controller.js";
import { SettingsService } from "./settings.service.js";

@Module({
  controllers: [SettingsController, MeterPresetsController, PayloadPresetsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
