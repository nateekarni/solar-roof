import { Body, Controller, Post } from "@nestjs/common";
import { randomUUID } from "node:crypto";

@Controller("v1/reports")
export class ReportsController {
  @Post()
  async generateReport(@Body() body: {
    type?: string;
    dateFrom?: string;
    dateTo?: string;
    format?: string;
  }) {
    const type = body.type || "energy";
    const format = (body.format || "csv").toLowerCase();
    const id = randomUUID();

    return {
      id,
      type,
      format,
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
      status: "ready",
      downloadUrl: `/v1/operations/reports/export`,
      generatedAt: new Date().toISOString(),
      message: "สร้างรายงานเรียบร้อยแล้ว",
    };
  }
}
