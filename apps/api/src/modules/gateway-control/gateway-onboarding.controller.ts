import { BadRequestException, Body, Controller, ForbiddenException, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../../common/roles.decorator.js';
import { GatewayRegistrationService } from './gateway-registration.service.js';
import { GatewayConfigurationService, validateConfirmation } from './gateway-configuration.service.js';

interface AdminRequest { user?: { id?: string | undefined; role?: string | undefined } | undefined }
const uuid = z.uuid();
const emptyBody = z.object({}).strict();
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException('Invalid onboarding request');
  return result.data;
}

@Controller('v1/gateways')
@Roles('admin')
export class GatewayOnboardingController {
  constructor(@Inject(GatewayRegistrationService) private readonly registration: GatewayRegistrationService,
    @Inject(GatewayConfigurationService) private readonly configuration: GatewayConfigurationService) {}

  @Get('discovered')
  async list(@Query('status') status: unknown, @Req() req: AdminRequest): Promise<Awaited<ReturnType<GatewayRegistrationService['list']>>> {
    this.admin(req);
    return this.registration.list(parse(z.enum(['unassigned', 'configuring', 'assigned', 'ignored']).optional(), status));
  }

  @Get('discovered/:id')
  async detail(@Param('id') id: string, @Req() req: AdminRequest) {
    this.admin(req); return this.registration.detail(parse(uuid, id));
  }

  @Post('discovered/:id/confirm')
  async confirm(@Param('id') id: string, @Body() body: unknown, @Req() req: AdminRequest) {
    const actor = this.admin(req); return this.configuration.confirm(parse(uuid, id), validateConfirmation(body), actor);
  }

  @Get(':id/sync-state')
  async syncState(@Param('id') id: string, @Req() req: AdminRequest) {
    this.admin(req); return this.configuration.syncState(parse(uuid, id));
  }

  @Post(':id/credentials/rotate')
  async rotate(@Param('id') id: string, @Body() body: unknown, @Req() req: AdminRequest) {
    const actor = this.admin(req); parse(emptyBody, body ?? {});
    return this.configuration.rotateCredential(parse(uuid, id), actor);
  }

  @Get(':id/config-proposals')
  async proposals(@Param('id') id: string, @Req() req: AdminRequest) {
    this.admin(req); return this.configuration.proposals(parse(uuid, id));
  }

  @Post(':id/config-proposals/:proposalId/approve')
  async approve(@Param('id') id: string, @Param('proposalId') proposalId: string, @Body() body: unknown, @Req() req: AdminRequest) {
    const actor = this.admin(req); parse(emptyBody, body ?? {});
    return this.configuration.approveProposal(parse(uuid, id), parse(uuid, proposalId), actor);
  }

  @Post(':id/config-proposals/:proposalId/reject')
  async reject(@Param('id') id: string, @Param('proposalId') proposalId: string, @Body() body: unknown, @Req() req: AdminRequest) {
    const actor = this.admin(req);
    const input = parse(z.object({ reason: z.string().trim().min(1).max(2048) }).strict(), body);
    return this.configuration.rejectProposal(parse(uuid, id), parse(uuid, proposalId), input.reason, actor);
  }

  private admin(req: AdminRequest): string {
    if (req?.user?.role !== 'admin') throw new ForbiddenException('Only Admin can manage gateway onboarding');
    return parse(uuid, req.user.id);
  }
}
