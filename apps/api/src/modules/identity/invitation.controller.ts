import {Body,Controller,Get,HttpCode,Inject,Post,Query,Req} from '@nestjs/common';
import type {Request} from 'express';
import {InvitationService} from './invitation.service.js';
import {Public} from './public.decorator.js';

@Controller('v1/auth')
export class InvitationController {
  constructor(@Inject(InvitationService) private readonly invitations: InvitationService) {}

  @Public()
  @Get('invitation-details')
  async getInvitationDetails(@Query('token') token: string) {
    return this.invitations.getInvitationDetails(token);
  }

  @Public()
  @Post('activate')
  @HttpCode(200)
  async activate(
    @Req() request: Request,
    @Body() body: { token: string; password: string; displayName?: string; avatarData?: string }
  ) {
    await this.invitations.activationAttempt(
      request.ip ?? request.socket.remoteAddress ?? 'unknown',
      body?.token,
      body?.password,
      body?.displayName,
      body?.avatarData
    );
    return { success: true };
  }
}
