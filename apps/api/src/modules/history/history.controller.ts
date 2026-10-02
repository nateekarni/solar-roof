import {Controller,Get,Post,Body,Headers,Req,Inject,HttpCode,BadRequestException} from '@nestjs/common';
import {HistoryService} from './history.service.js';
@Controller('v1/history')
export class HistoryController {
 constructor(@Inject(HistoryService) private readonly history:HistoryService){}
 @Get('options') options(){return this.history.options();}
 @Post('restore') @HttpCode(202)
 restore(@Req() req:any,@Body() body:any,@Headers('idempotency-key') key?:string){
  if(!body||typeof body!=='object'||Array.isArray(body))throw new BadRequestException('Invalid history request');
  return this.history.requestRestore(req.user.id,body.siteId,body.from,body.to,key);
 }
}
