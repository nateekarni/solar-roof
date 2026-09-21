import { Body, Controller, Get, Patch, Put } from "@nestjs/common";
import { SettingsService, type SystemSettings } from "./settings.service.js";
import { Roles } from "../../common/roles.decorator.js";

@Controller("v1/settings")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async getSettings(): Promise<SystemSettings> {
    return this.settingsService.getSettings();
  }

  @Roles("owner")
  @Put()
  async updateSettingsPut(@Body() body: Partial<SystemSettings>): Promise<SystemSettings> {
    return this.settingsService.updateSettings(body);
  }

  @Roles("owner")
  @Patch()
  async updateSettingsPatch(@Body() body: Partial<SystemSettings>): Promise<SystemSettings> {
    return this.settingsService.updateSettings(body);
  }

  @Roles("owner", "admin")
  @Put("notifications")
  async updateNotificationSettings(@Body() body: {
    criticalEmailAlert?: boolean;
    inAppNotification?: boolean;
  }) {
    const patch: Partial<SystemSettings> = {};
    if (typeof body.criticalEmailAlert === "boolean") {
      patch.criticalEmailAlert = body.criticalEmailAlert;
    }
    if (typeof body.inAppNotification === "boolean") {
      patch.inAppNotification = body.inAppNotification;
    }
    await this.settingsService.updateSettings(patch);
    return {
      success: true,
      message: "บันทึกการตั้งค่าการแจ้งเตือนเรียบร้อยแล้ว",
    };
  }
}
