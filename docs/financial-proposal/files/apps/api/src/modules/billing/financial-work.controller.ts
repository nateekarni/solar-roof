import { Controller, ForbiddenException, Get, Inject, Req } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { schoolScope } from '../../common/auth/route-policy.js';
@Controller('v1/financial-work')
export class FinancialWorkController {
 constructor(@Inject(DatabaseService) private readonly db:DatabaseService){}
 @Get()
 async list(@Req() req:any){
  if(!['owner','accountant','admin'].includes(req.user?.role))throw new ForbiddenException('Financial staff access required');
  const scope=schoolScope(req.user);
  const notices=(await this.db.query(`SELECT n.* FROM financial_staff_notices n LEFT JOIN sites s ON s.id=n.site_id WHERE $1::uuid[] IS NULL OR s.school_id=ANY($1::uuid[]) ORDER BY n.created_at DESC LIMIT 100`,[scope])).rows;
  const jobs=(await this.db.query(`SELECT j.*,s.name AS site_name,sc.name AS school_name FROM financial_month_jobs j JOIN sites s ON s.id=j.site_id JOIN schools sc ON sc.id=s.school_id WHERE j.state<>'done' AND ($1::uuid[] IS NULL OR s.school_id=ANY($1::uuid[])) ORDER BY j.period_start`,[scope])).rows;
  const deliveries=(await this.db.query(`SELECT o.*,d.document_number FROM financial_delivery_outbox o JOIN documents d ON d.id=o.document_id JOIN sites s ON s.id=d.site_id WHERE o.state<>'sent' AND ($1::uuid[] IS NULL OR s.school_id=ANY($1::uuid[])) ORDER BY o.created_at DESC LIMIT 100`,[scope])).rows;
  return {notices,jobs,deliveries};
 }
}
