import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { CustomerPortalController } from './customer-portal.controller.js';
import { CustomerPortalService } from './customer-portal.service.js';

@Module({imports: [DashboardModule, SettingsModule], controllers: [CustomerPortalController], providers: [CustomerPortalService]})
export class CustomerPortalModule {}
