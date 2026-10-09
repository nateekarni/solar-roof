import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { NotificationFeedController } from './notification-feed.controller.js';
import { NotificationFeedService } from './notification-feed.service.js';
@Module({imports:[DatabaseModule],controllers:[NotificationFeedController],providers:[NotificationFeedService]})
export class NotificationFeedModule {}
