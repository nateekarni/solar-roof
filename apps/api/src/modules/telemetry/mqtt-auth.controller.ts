import { Controller, Post, Body, Headers, Inject, Logger } from "@nestjs/common";
import { Public } from "../identity/public.decorator.js";
import { DatabaseService } from "../../database/database.service.js";

export interface EmqxAuthDto {
  clientid?: string;
  username?: string;
  password?: string;
  peerhost?: string;
}

export interface EmqxAclDto {
  clientid?: string;
  username?: string;
  action?: 'publish' | 'subscribe';
  topic?: string;
}

export interface EmqxAuthResponse {
  result: 'allow' | 'deny';
  is_superuser?: boolean;
}

export interface EmqxAclResponse {
  result: 'allow' | 'deny';
}

@Controller("v1/internal/mqtt")
export class MqttAuthController {
  private readonly logger = new Logger(MqttAuthController.name);

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Public()
  @Post("auth")
  async authenticate(
    @Body() dto: EmqxAuthDto,
    @Headers() headers?: Record<string, string>
  ): Promise<EmqxAuthResponse> {
    const internalSecret = process.env.INTERNAL_MQTT_SECRET || process.env.MQTT_CREDENTIAL_SECRET;
    if (internalSecret && headers?.['x-internal-secret'] && headers['x-internal-secret'] !== internalSecret) {
      this.logger.warn("EMQX Auth request rejected: invalid x-internal-secret");
      return { result: 'deny' };
    }

    const username = (dto?.username ?? '').trim();
    const password = dto?.password ?? '';

    if (!username) {
      return { result: 'deny' };
    }

    // 1. Backend / Superuser verification
    if (username === 'solar-backend') {
      const backendPassword = process.env.MQTT_PASSWORD;
      if (backendPassword && password === backendPassword) {
        return { result: 'allow', is_superuser: true };
      }
      this.logger.warn("solar-backend authentication rejected: invalid password");
      return { result: 'deny' };
    }

    // 2. Gateway username pattern validation
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(username)) {
      return { result: 'deny' };
    }

    // 3. Registered gateway check
    try {
      const existing = await this.db.query(
        `SELECT id FROM gateways WHERE (external_gateway_id = $1 OR name = $1) AND retired_at IS NULL LIMIT 1`,
        [username]
      );

      const registeredRow = existing.rows[0];
      if (registeredRow) {
        await this.db.query(
          `UPDATE gateways SET last_seen_at = now() WHERE id = $1`,
          [registeredRow.id]
        ).catch(err => this.logger.warn(`Failed to update gateway last_seen_at: ${err.message}`));
        return { result: 'allow', is_superuser: false };
      }

      // 4. Auto-Discovery flow for new/unregistered gateways
      const payload = JSON.stringify({
        clientid: dto.clientid ?? username,
        peerhost: dto.peerhost ?? null,
        registeredVia: 'emqx_auth',
      });

      await this.db.query(
        `INSERT INTO discovered_gateways (
          external_gateway_id, protocol, raw_payload, first_seen_at, last_seen_at
        ) VALUES ($1, 'mqtt', $2::jsonb, now(), now())
        ON CONFLICT (external_gateway_id) DO UPDATE SET last_seen_at = now()`,
        [username, payload]
      ).catch(err => this.logger.warn(`Failed to record discovered gateway: ${err.message}`));

      return { result: 'allow', is_superuser: false };
    } catch (error: any) {
      this.logger.error(`Error in MQTT auth for ${username}: ${error.message}`);
      return { result: 'deny' };
    }
  }

  @Public()
  @Post("acl")
  async authorize(
    @Body() dto: EmqxAclDto,
    @Headers() headers?: Record<string, string>
  ): Promise<EmqxAclResponse> {
    const internalSecret = process.env.INTERNAL_MQTT_SECRET || process.env.MQTT_CREDENTIAL_SECRET;
    if (internalSecret && headers?.['x-internal-secret'] && headers['x-internal-secret'] !== internalSecret) {
      return { result: 'deny' };
    }

    const username = (dto?.username ?? '').trim();
    const action = dto?.action;
    const topic = (dto?.topic ?? '').trim();

    if (!username || !action || !topic) {
      return { result: 'deny' };
    }

    // Superuser has full access
    if (username === 'solar-backend') {
      return { result: 'allow' };
    }

    const safeUser = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (action === 'publish') {
      // Standard telemetry: solar/v1/sites/<siteId>/gateways/<gatewayId>/devices/<deviceId>/telemetry
      const standardPubRegex = new RegExp(`^solar\/v1\/sites\/[^/]+\/gateways\/${safeUser}\/devices\/[^/]+\/telemetry$`);
      // Legacy telemetry: energy/<gatewayId>/telemetry
      const legacyPubRegex = new RegExp(`^energy\/${safeUser}\/telemetry$`);

      if (standardPubRegex.test(topic) || legacyPubRegex.test(topic)) {
        return { result: 'allow' };
      }
      return { result: 'deny' };
    }

    if (action === 'subscribe') {
      // Standard ACK: solar/v1/sites/<siteId or +>/gateways/<gatewayId>/dataAcept
      const standardSubRegex = new RegExp(`^solar\/v1\/sites\/([^/]+|\\+)\/gateways\/${safeUser}\/dataAcept$`);
      // Legacy config / response: energy/<gatewayId>/config or energy/<gatewayId>/response
      const legacySubRegex = new RegExp(`^energy\/${safeUser}\/(config|response)$`);

      if (standardSubRegex.test(topic) || legacySubRegex.test(topic)) {
        return { result: 'allow' };
      }
      return { result: 'deny' };
    }

    return { result: 'deny' };
  }
}
