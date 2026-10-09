import { Body, Controller, Get, Inject, Put, Query, Req } from '@nestjs/common';
import type { ScopePrincipal } from '../../common/auth/route-policy.js';
import { NotificationFeedService } from './notification-feed.service.js';
@Controller('v1/me/notification-feed')
export class NotificationFeedController {
 constructor(@Inject(NotificationFeedService) private readonly feedService:NotificationFeedService){}
 @Get() feed(@Req() req:{user:ScopePrincipal},@Query('site_id') site?:string){return this.feedService.feed(req.user,site);}
 @Put('read') read(@Req() req:{user:ScopePrincipal},@Body() body:{ids?:unknown;siteId?:unknown}){return this.feedService.read(req.user,body?.ids,body?.siteId);}
 @Put('read-all') readAll(@Req() req:{user:ScopePrincipal},@Body() body?:{siteId?:unknown}){return this.feedService.readAll(req.user,body?.siteId);}
}
