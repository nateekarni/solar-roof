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
    // Forwarded client identity is untrusted until S3 defines the proxy boundary.
    await this.invitations.activationAttempt(request.socket.remoteAddress ?? 'unknown',body?.token,body?.password);
    return {success:true};
  }
}
