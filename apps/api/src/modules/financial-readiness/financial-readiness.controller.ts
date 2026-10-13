import { Controller, Get, Inject, Post, Query, Req } from '@nestjs/common';
import type { FinancialReadinessContext } from '@solar/api-contracts';
import { Roles } from '../../common/roles.decorator.js';
import type { ScopePrincipal } from '../../common/auth/route-policy.js';
import { FinancialReadinessService } from './financial-readiness.service.js';

@Controller('v1/settings/finance-readiness')
@Roles('owner')
export class FinancialReadinessController {
  constructor(@Inject(FinancialReadinessService) private readonly readiness:FinancialReadinessService) {}
  @Get()
  status(@Req() request:{user:ScopePrincipal},@Query() context:FinancialReadinessContext) {return this.readiness.status(request.user,context);}
  @Post('confirm')
  confirm(@Req() request:{user:ScopePrincipal}) {return this.readiness.confirm(request.user);}
}
