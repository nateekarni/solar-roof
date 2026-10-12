import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { NotificationFeedController } from './notification-feed.controller.js';
import { NotificationFeedService } from './notification-feed.service.js';
import { OperationalAutomationController } from './operational-automation.controller.js';
import { OperationalAutomationService } from './operational-automation.service.js';
@Module({imports:[DatabaseModule],controllers:[NotificationFeedController,OperationalAutomationController],providers:[NotificationFeedService,OperationalAutomationService]})
export class NotificationFeedModule {}
