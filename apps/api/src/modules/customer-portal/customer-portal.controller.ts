import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import { Roles } from '../../common/roles.decorator.js';
import type { DashboardPrincipal } from '../dashboard/dashboard.service.js';
import { CustomerPortalService, parseCustomerPortalRange } from './customer-portal.service.js';

@Controller('v1/customer/portal')
@Roles('customer_user')
export class CustomerPortalController {
  constructor(@Inject(CustomerPortalService) private readonly portal: CustomerPortalService) {}

  @Get('payment-instructions')
  paymentInstructions(@Req() req: {user: DashboardPrincipal}) {
    return this.portal.paymentInstructions(req.user);
  }

  @Get('home')
  home(@Req() req: {user: DashboardPrincipal}, @Query('range') range = '7d') {
    return this.portal.home(req.user, parseCustomerPortalRange(range));
  }
}
