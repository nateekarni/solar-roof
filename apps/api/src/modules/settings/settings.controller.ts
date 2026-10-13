import { Body, Controller, Delete, ForbiddenException, Get, Inject, Param, Patch, Put, Req } from "@nestjs/common";
import { hasPermission, type AuthorizationPrincipal } from '../../common/auth/authorization.js';
import { SettingsService, type SystemSettings } from "./settings.service.js";
import { Roles } from "../../common/roles.decorator.js";

@Controller("v1/settings")
export class SettingsController {
  constructor(@Inject(SettingsService) private readonly settingsService: SettingsService) {}

  @Get('business') getBusiness(){return this.settingsService.getDomainSettings('business');}
  @Get('technical') getTechnical(){return this.settingsService.getDomainSettings('technical');}
  @Patch('business') updateBusiness(@Body() body:unknown,@Req() req:{user:AuthorizationPrincipal&{id:string}}){
    if(!hasPermission(req.user,'business.settings.edit'))throw new ForbiddenException();
    return this.settingsService.updateDomainSettings('business',body,req.user.id);
  }
  @Patch('technical') updateTechnical(@Body() body:unknown,@Req() req:{user:AuthorizationPrincipal&{id:string}}){
    if(!hasPermission(req.user,'technical.settings.edit'))throw new ForbiddenException();
    return this.settingsService.updateDomainSettings('technical',body,req.user.id);
  }

  @Get()
  async getSettings(): Promise<SystemSettings> {
    return this.settingsService.getSettings();
  }

  @Roles("owner")
  @Put()
  async updateSettingsPut(@Body() body: Partial<SystemSettings>): Promise<SystemSettings> {
    throw new ForbiddenException('Use revisioned domain settings');
  }

  @Roles("owner")
  @Patch()
  async updateSettingsPatch(@Body() body: Partial<SystemSettings>): Promise<SystemSettings> {
    throw new ForbiddenException('Use revisioned domain settings');
  }

  @Roles("owner", "admin")
  @Put("notifications")
  async updateNotificationSettings(@Body() body: {
    criticalEmailAlert?: boolean;
    inAppNotification?: boolean;
  }) {
    throw new ForbiddenException('Use revisioned technical settings');
  }

  @Get("company")
  async getCompanyProfile() {
    return this.settingsService.getCompanyProfile();
  }

  @Roles("owner")
  @Put("company")
  async updateCompanyProfile(@Body() body: any, @Req() req: {user:{id:string}}) {
    const updated = await this.settingsService.updateCompanyProfile(body, req.user.id);
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

  @Roles("owner")
  @Put("bank-accounts")
  async saveBankAccount(@Body() body: any, @Req() req: {user:{id:string}}) {
    const account = await this.settingsService.saveBankAccount(body, req.user.id);
    return {
      success: true,
      message: "บันทึกข้อมูลบัญชีธนาคารเรียบร้อยแล้ว",
      account,
    };
  }

  @Roles("owner")
  @Put("bank-accounts/:id")
  async updateBankAccount(@Param("id") id: string, @Body() body: any, @Req() req: {user:{id:string}}) {
    const account = await this.settingsService.saveBankAccount({ ...body, id }, req.user.id);
    return {
      success: true,
      message: "บันทึกข้อมูลบัญชีธนาคารเรียบร้อยแล้ว",
      account,
    };
  }

  @Roles("owner")
  @Delete("bank-accounts/:id")
  async deleteBankAccount(@Param("id") id: string, @Req() req: {user:{id:string}}) {
    await this.settingsService.deleteBankAccount(id, req.user.id);
    return {
      success: true,
      message: "ลบบัญชีธนาคารเรียบร้อยแล้ว",
    };
  }
}
