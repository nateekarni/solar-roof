import { JobAccessService } from '../jobs/job-access.service.js';
import { Body,Controller,ForbiddenException,Get,Headers,HttpCode,Inject,NotFoundException,Param,Post,Req,Res } from '@nestjs/common';
import type { Response } from 'express';
import { DatabaseService } from '../../database/database.service.js';
import { ReportJobService } from './report-job.service.js';
@Controller('v1/reports')
export class ReportsController {
 constructor(@Inject(DatabaseService) private readonly db:DatabaseService,@Inject(ReportJobService) private readonly jobs:ReportJobService,@Inject(JobAccessService) private readonly access:JobAccessService) {}
 @Post()
 @HttpCode(202)
 generateReport(@Req() req:any,@Body() body:any,@Headers('idempotency-key') key?:string){return this.jobs.enqueue(req.user.id,body,key);}
 @Get(':id/download')
 async download(@Param('id') id:string,@Req() req:any,@Res() res:Response){
  const row=(await this.db.query('SELECT content,content_type,format,report_type FROM generated_reports WHERE id::text=$1 AND created_by=$2',[id,req.user.id])).rows[0];
  if(!row)throw new NotFoundException('Report not found');
  const {user,scope}=await this.access.current(req.user.id);
  if(row.report_type==='audit'&&!['owner','admin'].includes(user.role))throw new ForbiddenException({code:'report_permission_revoked',message:'Report permission revoked'});
  if(scope!==null)throw new ForbiddenException({code:'legacy_scope_unknown',message:'Create a new report to verify current school scope'});
  res.setHeader('Content-Type',row.content_type);res.setHeader('Content-Disposition',`attachment; filename="report-${id}.${row.format}"`);res.send(row.content);
 }
}
