import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { Roles } from '../../common/roles.decorator.js';
import { BillingSourceBindingService } from './billing-source-binding.service.js';
@Controller('v1/sites/:siteId/billing-source')
export class BillingSourceBindingController {
 constructor(@Inject(BillingSourceBindingService) private readonly sources:BillingSourceBindingService){}
 @Get() @Roles('admin') get(@Param('siteId') siteId:string){return this.sources.get(siteId);}
 @Post() @Roles('admin') bind(@Param('siteId') siteId:string,@Body() body:unknown,@Req() req:{user?:{id:string}}){return this.sources.bind(siteId,body,req.user?.id);}
}
