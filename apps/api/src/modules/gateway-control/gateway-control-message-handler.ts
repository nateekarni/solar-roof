import { Inject, Injectable, Logger } from '@nestjs/common';
import { observeValue } from '../../common/observability/metrics.js';
import { parseBoundedPayload } from '../telemetry/ingestion-limiter.js';
import { parseGatewayControlPayload, parseGatewayControlTopic } from './gateway-control-payload.js';
import { GatewayRegistrationService } from './gateway-registration.service.js';
import { GatewayConfigurationService } from './gateway-configuration.service.js';

export interface GatewayControlMessage {
  topic: string;
  payload: string | Buffer;
  brokerId: string | null;
  /** Only transport-authenticated metadata; never MQTT user properties or JSON. */
  clientMetadata?: { clientId?: string; sourceAddress?: string | null };
}
type Rejection = 'invalid_topic' | 'outbound_only' | 'invalid_payload' | 'identity_mismatch' | 'handler_failed';

@Injectable()
export class GatewayControlMessageHandler {
  private readonly logger = new Logger(GatewayControlMessageHandler.name);
  constructor(@Inject(GatewayRegistrationService) private readonly registration: GatewayRegistrationService,
    @Inject(GatewayConfigurationService) private readonly configuration: GatewayConfigurationService) {}

  async handle(input: GatewayControlMessage): Promise<{ accepted: boolean }> {
    const route = parseGatewayControlTopic(input.topic);
    if (!route) return this.reject('invalid_topic');
    if (route.kind === 'config') return this.reject('outbound_only');
    let payload;
    try { payload = parseGatewayControlPayload(route.kind, parseBoundedPayload(input.payload)); }
    catch { return this.reject('invalid_payload'); }
    const identity = payload.messageType === 'register' ? payload.gateway.gatewayId : payload.gatewayId;
    if (route.gatewayId !== identity || input.clientMetadata?.clientId !== undefined && input.clientMetadata.clientId !== identity) {
      return this.reject('identity_mismatch');
    }
    try {
      if (payload.messageType === 'register') {
        // Subscriber PUBLISH packets do not expose the originating client ID.
        // The route is the broker-ACL-bound identity, unless a trusted adapter
        // supplied authenticated client metadata (which was checked above).
        await this.registration.record({ brokerId: input.brokerId, clientId: route.gatewayId,
          sourceAddress: input.clientMetadata?.sourceAddress, topic: input.topic, payload });
      } else {
        const control = { brokerId: input.brokerId, gatewayId: route.gatewayId, payload };
        if (payload.messageType === 'configUpdate') await this.configuration.recordProposal(control);
        else if (payload.messageType === 'configStatus') await this.configuration.recordConfigStatus(control);
        else await this.configuration.recordConnectionStatus(control);
      }
      observeValue('gateway_control_accepted', 1);
      return { accepted: true };
    } catch { return this.reject('handler_failed'); }
  }

  private reject(reason: Rejection): { accepted: false } {
    observeValue(`gateway_control_rejected_${reason}`, 1);
    this.logger.warn({ event: 'gateway_control_rejected', reason });
    return { accepted: false };
  }
}
