import { Body, Controller, Delete, Get, Param, Patch, Put } from "@nestjs/common";
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

  @Get("company")
  async getCompanyProfile() {
    return this.settingsService.getCompanyProfile();
  }

  @Roles("admin", "owner")
  @Put("company")
  async updateCompanyProfile(@Body() body: any) {
    const updated = await this.settingsService.updateCompanyProfile(body);
    return {
      success: true,
      message: "บันทึกข้อมูลบริษัทเรียบร้อยแล้ว",
      profile: updated,
    };
  }

  @Get("bank-accounts")
  async listBankAccounts() {
    return this.settingsService.listBankAccounts();
  }

  @Roles("admin", "owner")
  @Put("bank-accounts")
  async saveBankAccount(@Body() body: any) {
    const account = await this.settingsService.saveBankAccount(body);
    return {
      success: true,
      message: "บันทึกข้อมูลบัญชีธนาคารเรียบร้อยแล้ว",
      account,
    };
  }

  @Roles("admin", "owner")
  @Put("bank-accounts/:id")
  async updateBankAccount(@Param("id") id: string, @Body() body: any) {
    const account = await this.settingsService.saveBankAccount({ ...body, id });
    return {
      success: true,
      message: "บันทึกข้อมูลบัญชีธนาคารเรียบร้อยแล้ว",
      account,
    };
  }

  @Roles("admin", "owner")
  @Delete("bank-accounts/:id")
  async deleteBankAccount(@Param("id") id: string) {
    await this.settingsService.deleteBankAccount(id);
    return {
      success: true,
      message: "ลบบัญชีธนาคารเรียบร้อยแล้ว",
    };
  }
}
