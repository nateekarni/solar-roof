import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { TeamService, type TeamActor } from './team.service.js';
@Controller('v1/team')
export class TeamController {
 constructor(@Inject(TeamService) private readonly team:TeamService){}
 @Get('catalog') catalog(@Req() req:{user:TeamActor},@Query('domain') domain:string){return this.team.catalog(req.user,domain);}
 @Get('employees') employees(@Req() req:{user:TeamActor},@Query('domain') domain:string){return this.team.employees(req.user,domain);}
 @Get('positions') positions(@Req() req:{user:TeamActor},@Query('domain') domain:string){return this.team.positions(req.user,domain);}
 @Post('positions/:domain') createPosition(@Req() req:{user:TeamActor},@Param('domain') domain:string,@Body() body:unknown){return this.team.savePosition(req.user,domain,body);}
 @Patch('positions/:id/:domain') updatePosition(@Req() req:{user:TeamActor},@Param('id') id:string,@Param('domain') domain:string,@Body() body:unknown){return this.team.savePosition(req.user,domain,body,id);}
 @Post('positions/:id/:domain/impact') positionImpact(@Req() req:{user:TeamActor},@Param('id') id:string,@Param('domain') domain:string,@Body() body:unknown){return this.team.positionImpact(req.user,id,domain,body);}
 @Patch('employees/:id/:domain') grant(@Req() req:{user:TeamActor},@Param('id') id:string,@Param('domain') domain:string,@Body() body:unknown){return this.team.updateGrant(req.user,id,domain,body);}
 @Delete('employees/:id/:domain') revoke(@Req() req:{user:TeamActor},@Param('id') id:string,@Param('domain') domain:string,@Body() body:unknown){return this.team.revokeGrant(req.user,id,domain,body);}
 @Get('employees/:id/deactivation-impact') impact(@Req() req:{user:TeamActor},@Param('id') id:string){return this.team.deactivationImpact(req.user,id);}
 @Post('employees/:id/deactivate') deactivate(@Req() req:{user:TeamActor},@Param('id') id:string,@Body() body:unknown){return this.team.deactivate(req.user,id,body);}
}
