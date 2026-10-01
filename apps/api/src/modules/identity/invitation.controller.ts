import {Body,Controller,HttpCode,Inject,Post,Req} from '@nestjs/common';
import type {Request} from 'express';
import {InvitationService} from './invitation.service.js';
import {Public} from './public.decorator.js';
@Controller('v1/auth')
export class InvitationController {
  constructor(@Inject(InvitationService) private readonly invitations:InvitationService) {}
  @Public()
  @Post('activate')
  @HttpCode(200)
  async activate(@Req() request:Request,@Body() body:{token:string;password:string}) {
    // Express resolves IP only through the explicitly configured socket/CIDR chain.
    await this.invitations.activationAttempt(request.ip ?? request.socket.remoteAddress ?? 'unknown',body?.token,body?.password);
    return {success:true};
  }
}
