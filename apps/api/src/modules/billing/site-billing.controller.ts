import {Body,Controller,Get,Inject,Optional,Param,Patch,Post,Put,Req} from '@nestjs/common';
import {Roles} from '../../common/roles.decorator.js';
import type {ScopePrincipal} from '../../common/auth/route-policy.js';
import {SiteBillingService,type BillingSettingsInput,type RateChangeInput} from './site-billing.service.js';
import type {ManualLine} from './site-billing-policy.js';
import {FinancialReadinessService} from '../financial-readiness/financial-readiness.service.js';
@Controller('v1')
@Roles('owner','accountant')
export class SiteBillingController {
 constructor(@Inject(SiteBillingService) private service:SiteBillingService,@Optional() @Inject(FinancialReadinessService) private readiness?:FinancialReadinessService){}
 @Get('sites/:id/billing-settings') settings(@Param('id') id:string,@Req() r:{user:ScopePrincipal}){return this.service.settings(id,r.user);}
 @Put('sites/:id/billing-settings') save(@Param('id') id:string,@Body() b:BillingSettingsInput,@Req() r:{user:ScopePrincipal}){return this.service.saveSettings(id,b,r.user);}
 @Get('tariff-catalog') catalog(@Req() r:{user:ScopePrincipal}){return this.service.catalog(r.user);}
 @Post('tariff-catalog') add(@Body() b:{name:string;rate:string|number},@Req() r:{user:ScopePrincipal}){return this.service.addCatalog(b,r.user);}
 @Get('site-rates') rates(@Req() r:{user:ScopePrincipal}){return this.service.listRates(r.user);}
 @Post('site-rates/preview') preview(@Body() b:RateChangeInput,@Req() r:{user:ScopePrincipal}){return this.service.previewRates(b,r.user);}
 @Post('site-rates/apply') apply(@Body() b:RateChangeInput,@Req() r:{user:ScopePrincipal}){return this.service.applyRates(b,r.user);}
 @Roles('owner') @Patch('billing-cycles/:id/rate') async reprice(@Param('id') id:string,@Body() b:{rate:string|number;reason:string;replaceFuture?:boolean},@Req() r:{user:ScopePrincipal}){
  if(this.readiness)await this.readiness.assertEnabled('adjust',{billingCycleId:id});
  return this.service.reprice(id,b,r.user);
 }
 @Post('manual-bills/preview') manualPreview(@Body() b:{siteId:string;lines:ManualLine[]},@Req() r:{user:ScopePrincipal}){return this.service.manualPreview(b,r.user);}
 @Post('manual-bills') manual(@Body() b:{siteId:string;lines:ManualLine[];note?:string;dueDate?:string;idempotencyKey?:string},@Req() r:{user:ScopePrincipal}){return this.service.manual(b,r.user);}
}
