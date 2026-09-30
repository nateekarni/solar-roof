import { BadRequestException, Controller, Get, Inject, Query, Req } from '@nestjs/common';
import { DashboardService, type DashboardPrincipal } from './dashboard.service.js';
import { dashboardRange, type DashboardQuery } from './dashboard-range.js';

@Controller('v1/dashboard')
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboard: DashboardService) {}
  private range(query: DashboardQuery) {
    try { return dashboardRange(query); } catch (error) { throw new BadRequestException((error as Error).message); }
  }
  @Get('summary')
  getSummary(@Req() req: {user:DashboardPrincipal}, @Query() query:DashboardQuery) {
    const {start,end}=this.range(query);
    return this.dashboard.getSummary(req.user,start,end,query.site_id);
  }
  @Get('production')
  async getProduction(@Req() req: {user:DashboardPrincipal}, @Query() query:DashboardQuery) {
    const {start,end}=this.range(query);
    const result = await this.dashboard.getSummary(req.user,start,end,query.site_id);
    return result.production.map(row => ({label:row.date,value:row.value,unit:'kWh'}));
  }
  @Get('revenue')
  async getRevenue(@Req() req: {user:DashboardPrincipal}, @Query() query:DashboardQuery) {
    const {start,end}=this.range(query);
    const result = await this.dashboard.getSummary(req.user,start,end,query.site_id);
    return result.revenue.map(row => ({label:row.date,value:row.value,unit:'THB'}));
  }
  @Get('compare')
  compare(@Req() req: {user:DashboardPrincipal}, @Query() query:DashboardQuery) {
    const {start,end}=this.range(query);
    return this.dashboard.compare(req.user,query.metric || 'periodKwh',query.site_ids?.split(',').filter(Boolean) || [],start,end);
  }
  @Get('power-flow')
  getPowerFlow(@Req() req: {user:DashboardPrincipal}, @Query() query:DashboardQuery) {
    return this.dashboard.getPowerFlow(req.user,query.site_id);
  }
}
