import {Module} from '@nestjs/common';
import {JobsModule} from '../jobs/jobs.module.js';
import {HistoryController} from './history.controller.js';
import {HistoryService} from './history.service.js';
@Module({imports:[JobsModule],controllers:[HistoryController],providers:[HistoryService]})
export class HistoryModule {}
