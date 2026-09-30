import { BadRequestException, Body, Controller, ForbiddenException, Get, Inject, NotFoundException, Param, Post, Req, Res } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import { DatabaseService } from "../../database/database.service.js";
import { schoolScope } from "../../common/auth/resource-scope.js";
import { ReportService, type ReportType } from "./report.service.js";

@Controller("v1/reports")
export class ReportsController {
  constructor(@Inject(DatabaseService) private readonly db:DatabaseService,@Inject(ReportService) private readonly reports:ReportService) {}
  @Post()
  async generateReport(@Req() req:any,@Body() body: {
    type?: string;
    dateFrom?: string;
    dateTo?: string;
    format?: string;
  }) {
    const type = body.type === "financial" ? "billing" : body.type === "device" ? "device_health" : body.type || "energy";
    const format = (body.format || "csv").toLowerCase();
    if(format!=="csv") throw new BadRequestException("Only CSV export is available");
    const from=body.dateFrom,to=body.dateTo;
    if(!from||!to||!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||from>to||Date.parse(to)-Date.parse(from)>366*86400000) throw new BadRequestException("Select a valid date range of at most one year");
    const scope=schoolScope(req.user);
    const scoped="($3::uuid[] IS NULL OR s.school_id=ANY($3::uuid[]))";
    const queries:Record<string,string>={
      energy:`SELECT s.name AS site,d.serial_number AS meter,t.source_time,t.received_time,t.normalized_value AS cumulative_kwh,t.quality FROM telemetry_raw t JOIN sites s ON s.id=t.site_id JOIN devices d ON d.id=t.device_id WHERE t.semantic_field='total_energy' AND t.source_time >= $1::date AND t.source_time < $2::date+interval '1 day' AND ${scoped} ORDER BY t.source_time LIMIT 100001`,
      device_health:`SELECT s.name AS site,g.name AS gateway,d.name AS device,d.serial_number,t.source_time AS last_sample,t.received_time,t.quality FROM devices d JOIN gateways g ON g.id=d.gateway_id JOIN sites s ON s.id=d.site_id LEFT JOIN LATERAL (SELECT source_time,received_time,quality FROM telemetry_raw WHERE device_id=d.id AND source_time>=($1::date::timestamp AT TIME ZONE 'Asia/Bangkok') AND source_time<(($2::date+1)::timestamp AT TIME ZONE 'Asia/Bangkok') ORDER BY source_time DESC LIMIT 1) t ON true WHERE ${scoped} ORDER BY s.name LIMIT 100001`,
      billing:`SELECT s.name AS site,b.period_start,b.period_end,b.consumed_kwh,b.rate,b.amount,b.status,b.quality FROM billing_cycles b JOIN sites s ON s.id=b.site_id WHERE b.period_start>=$1::date AND b.period_end<=$2::date AND ${scoped} ORDER BY b.period_start LIMIT 100001`,
      payment:`SELECT s.name AS site,b.period_start,b.amount,p.status,p.paid_at FROM payments p JOIN billing_cycles b ON b.id=p.billing_cycle_id JOIN sites s ON s.id=b.site_id WHERE p.paid_at>=$1::date AND p.paid_at<$2::date+interval '1 day' AND ${scoped} ORDER BY p.paid_at LIMIT 100001`,
      audit:`SELECT a.occurred_at,a.action,a.entity_type,a.entity_id,u.email AS actor,a.reason FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id WHERE a.occurred_at>=$1::date AND a.occurred_at<$2::date+interval '1 day' AND ($3::uuid[] IS NULL OR u.school_id=ANY($3::uuid[])) ORDER BY a.occurred_at LIMIT 100001`,
    };
    if(!queries[type]) throw new BadRequestException("Unknown report type");
    if(type==="audit"&&!["owner","admin"].includes(req.user.role))throw new ForbiddenException();
    const result=await this.db.query(queries[type]!,[from,to,scope]);
    if(result.rows.length>100000)throw new BadRequestException("Report too large; select a smaller date range");
    const id = randomUUID();
    const content=Buffer.from("\uFEFF"+this.reports.createCsv(type as ReportType,result.rows),"utf8");
    await this.db.query("INSERT INTO generated_reports(id,created_by,title,report_type,date_from,date_to,format,status,content,content_type) VALUES($1,$2,$3,$4,$5,$6,'csv','ready',$7,'text/csv; charset=utf-8')",[id,req.user.id,`${type} ${from} – ${to}`,type,from,to,content]);

    return {
      id,
      type,
      format,
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
      status: "ready",
      downloadUrl: `/v1/reports/${id}/download`,
      generatedAt: new Date().toISOString(),
      message: "สร้างรายงานเรียบร้อยแล้ว",
    };
  }

  @Get(":id/download")
  async download(@Param("id") id:string,@Req() req:any,@Res() res:Response) {
    const result=await this.db.query("SELECT content,content_type,format FROM generated_reports WHERE id::text=$1 AND created_by=$2",[id,req.user.id]);
    const row=result.rows[0]; if(!row)throw new NotFoundException("Report not found");
    res.setHeader("Content-Type",row.content_type);
    res.setHeader("Content-Disposition",`attachment; filename="report-${id}.${row.format}"`);
    res.send(row.content);
  }
}
