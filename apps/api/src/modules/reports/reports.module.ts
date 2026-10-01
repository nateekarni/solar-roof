import { JobsModule } from '../jobs/jobs.module.js';
import { Module } from "@nestjs/common";
import { ReportService } from "./report.service.js";
import { ReportsController } from "./reports.controller.js";

@Module({ imports:[JobsModule],
  controllers: [ReportsController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportsModule {}
