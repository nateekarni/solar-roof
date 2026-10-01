import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller.js';
import { JobAccessService } from './job-access.service.js';
import { ReportJobService } from '../reports/report-job.service.js';
@Module({controllers:[JobsController],providers:[JobAccessService,ReportJobService],exports:[JobAccessService,ReportJobService]})
export class JobsModule {}
