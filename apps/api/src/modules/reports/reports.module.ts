import { Module } from "@nestjs/common";
import { ReportService } from "./report.service.js";
import { ReportsController } from "./reports.controller.js";

@Module({
  controllers: [ReportsController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportsModule {}
