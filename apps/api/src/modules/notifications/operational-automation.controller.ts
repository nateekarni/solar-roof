import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { ScopePrincipal } from '../../common/auth/route-policy.js';
import { OperationalAutomationService } from './operational-automation.service.js';
@Controller('v1/alert-rules')
export class OperationalAutomationController {
 constructor(@Inject(OperationalAutomationService) private readonly service:OperationalAutomationService){}
 @Get() list(@Req() req:{user:ScopePrincipal}){return this.service.list(req.user);}
 @Get('sites') sites(@Req() req:{user:ScopePrincipal}){return this.service.sites(req.user);}
 @Get('recipients') recipients(@Req() req:{user:ScopePrincipal},@Query('site_id') siteId?:string,@Query('site_ids') siteIds?:string){return this.service.recipients(req.user,siteId??siteIds??'');}
 @Post() save(@Req() req:{user:ScopePrincipal},@Body() body:unknown){return this.service.save(req.user,body);}
 @Patch(':id') update(@Req() req:{user:ScopePrincipal},@Param('id') id:string,@Body() body:unknown){return this.service.update(req.user,id,body);}
 @Delete(':id') remove(@Req() req:{user:ScopePrincipal},@Param('id') id:string){return this.service.remove(req.user,id);}
}
