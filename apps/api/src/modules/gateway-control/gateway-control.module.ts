import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { GatewayRegistrationService } from './gateway-registration.service.js';
import { GatewayCredentialService } from './gateway-credential.service.js';
import { GatewayConfigurationService } from './gateway-configuration.service.js';
import { GatewayOnboardingController } from './gateway-onboarding.controller.js';
import { GatewayControlMessageHandler } from './gateway-control-message-handler.js';
import { GatewaySessionRevoker } from './gateway-session-revoker.js';

@Module({
  imports: [DatabaseModule],
  controllers: [GatewayOnboardingController],
  providers: [GatewayRegistrationService, GatewayCredentialService, GatewaySessionRevoker, GatewayConfigurationService, GatewayControlMessageHandler],
  exports: [GatewayRegistrationService, GatewayCredentialService, GatewayConfigurationService, GatewayControlMessageHandler],
})
export class GatewayControlModule {}
