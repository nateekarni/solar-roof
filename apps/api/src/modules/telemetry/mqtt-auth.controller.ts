import { Controller, Post, Body, Headers, Inject } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../identity/public.decorator.js';
import { DatabaseService } from '../../database/database.service.js';
import { GatewayCredentialService, normalizeMqttSourceAddress } from '../gateway-control/gateway-credential.service.js';
import { gatewayControlTopic, parseGatewayControlTopic } from '../gateway-control/gateway-control-payload.js';
import { gatewayPrefix, payloadTopic } from './payload-ingestion.js';

export interface EmqxAuthDto { clientid?: string; username?: string; password?: string; peerhost?: string }
export interface EmqxAclDto { clientid?: string; username?: string; password?: string; action?: 'publish' | 'subscribe'; topic?: string }
export interface EmqxAuthResponse { result: 'allow' | 'deny'; is_superuser?: boolean }
export interface EmqxAclResponse { result: 'allow' | 'deny' }
interface GatewayIdentity {
  id: string; external_gateway_id: string; site_id: string; external_site_id: string;
  lifecycle_state: string; retired_at: string | null; protocol: string;
  gateway_status: string; site_status: string; credential_id: string | null;
  username: string | null; revoked_at: string | null;
}
interface DeviceIdentity { gateway_id: string; site_id: string; external_device_id: string; status: string }

function equalSecret(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string') return false;
  const actualBytes = Buffer.from(provided), expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}
function callbackAllowed(headers?: Record<string, string>): boolean {
  const secret = process.env.INTERNAL_MQTT_SECRET || process.env.MQTT_CREDENTIAL_SECRET;
  return !secret || equalSecret(headers?.['x-internal-secret'], secret);
}
function validIdentity(value: unknown): value is string {
  return typeof value === 'string' && !!parseGatewayControlTopic(`solar/v1/gateways/${value}/register`);
}
function bodyValid(dto: unknown): dto is EmqxAuthDto & EmqxAclDto {
  return !!dto && typeof dto === 'object' && !Array.isArray(dto)
    && ['username', 'password', 'clientid'].every(key => {
      const value = (dto as Record<string, unknown>)[key];
      return value === undefined || typeof value === 'string';
    });
}

@Controller('v1/internal/mqtt')
export class MqttAuthController {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(GatewayCredentialService) private readonly credentials: GatewayCredentialService,
  ) {}

  @Public()
  @Post('auth')
  async authenticate(@Body() dto: EmqxAuthDto, @Headers() headers?: Record<string, string>): Promise<EmqxAuthResponse> {
    if (!callbackAllowed(headers) || !bodyValid(dto)) return { result: 'deny' };
    const username = dto.username ?? '', password = dto.password ?? '';
    if (username === 'solar-backend') {
      const expected = process.env.MQTT_PASSWORD;
      return expected && equalSecret(password, expected) ? { result: 'allow', is_superuser: true } : { result: 'deny' };
    }
    if (!validIdentity(dto.clientid) || dto.clientid === 'solar-backend') return { result: 'deny' };
    try {
      if (username === '' && password === '') {
        return await this.isAnonymous(dto.clientid) ? { result: 'allow', is_superuser: false } : { result: 'deny' };
      }
      if (username !== dto.clientid || !password) return { result: 'deny' };
      const gateway = await this.registeredIdentity(username);
      if (!gateway || !await this.credentials.verify(gateway.id, password, { sourceAddress: normalizeMqttSourceAddress(dto.peerhost) })) return { result: 'deny' };
      return { result: 'allow', is_superuser: false };
    } catch {
      // Do not log driver errors: error text can contain credentials or hashes.
      return { result: 'deny' };
    }
  }

  @Public()
  @Post('acl')
  async authorize(@Body() dto: EmqxAclDto, @Headers() headers?: Record<string, string>): Promise<EmqxAclResponse> {
    if (!callbackAllowed(headers) || !bodyValid(dto)
      || !['publish', 'subscribe'].includes(dto.action ?? '') || typeof dto.topic !== 'string' || !dto.topic) return { result: 'deny' };
    // EMQX supplies this authenticated identity; the callback secret protects that
    // trust boundary. Backend CONNECT still requires MQTT_PASSWORD above.
    if (dto.username === 'solar-backend') return { result: 'allow' };
    if (!validIdentity(dto.clientid) || dto.clientid === 'solar-backend') return { result: 'deny' };
    try {
      if ((dto.username ?? '') === '') {
        const registration = gatewayControlTopic(dto.clientid, 'register');
        return !dto.password && dto.action === 'publish' && dto.topic === registration && await this.isAnonymous(dto.clientid)
          ? { result: 'allow' } : { result: 'deny' };
      }
      if (dto.username !== dto.clientid) return { result: 'deny' };
      const gateway = await this.registeredIdentity(dto.username);
      if (!gateway) return { result: 'deny' };
      const id = gateway.external_gateway_id;
      const allowedControl = dto.action === 'subscribe'
        ? dto.topic === gatewayControlTopic(id, 'config')
        : (['configUpdate', 'configStatus', 'status'] as const).some(kind => dto.topic === gatewayControlTopic(id, kind));
      if (allowedControl) return { result: 'allow' };
      if (gateway.lifecycle_state !== 'active' || !validIdentity(gateway.external_site_id)) return { result: 'deny' };
      const devices = (await this.db.query<DeviceIdentity>(`SELECT gateway_id,site_id,external_device_id,status FROM devices
        WHERE gateway_id=$1 AND site_id=$2`, [gateway.id, gateway.site_id])).rows.filter(device =>
        device.gateway_id === gateway.id && device.site_id === gateway.site_id && validIdentity(device.external_device_id)
        && ['online', 'offline', 'active'].includes(device.status));
      if (dto.action === 'publish') {
        return devices.some(device => dto.topic === payloadTopic(gateway.external_site_id, id, device.external_device_id))
          ? { result: 'allow' } : { result: 'deny' };
      }
      // dataAcept is deliberately gateway-scoped in the existing data plane.
      return devices.length > 0 && dto.topic === `${gatewayPrefix(gateway.external_site_id, id)}/dataAcept`
        ? { result: 'allow' } : { result: 'deny' };
    } catch {
      return { result: 'deny' };
    }
  }

  private async isAnonymous(clientId: string): Promise<boolean> {
    // Include retired identities: a failed/disabled gateway cannot downgrade.
    return (await this.db.query('SELECT g.id FROM gateways g WHERE g.external_gateway_id=$1 LIMIT 1', [clientId])).rows.length === 0;
  }

  private async registeredIdentity(username: string): Promise<GatewayIdentity | null> {
    const rows = (await this.db.query<GatewayIdentity>(`SELECT g.id,g.external_gateway_id,g.site_id,s.external_site_id,
      g.lifecycle_state,g.retired_at,g.protocol,g.status AS gateway_status,s.status AS site_status,
      c.id AS credential_id,c.username,c.revoked_at FROM gateways g JOIN sites s ON s.id=g.site_id
      LEFT JOIN gateway_mqtt_credentials c ON c.gateway_id=g.id AND c.revoked_at IS NULL
      WHERE g.external_gateway_id=$1 LIMIT 2`, [username])).rows;
    const row = rows[0];
    if (rows.length !== 1 || !row || row.external_gateway_id !== username || !validIdentity(row.external_gateway_id)
      || row.username !== row.external_gateway_id || !row.credential_id || row.revoked_at !== null
      || row.retired_at !== null || row.protocol !== 'mqtt' || !['configuring', 'active'].includes(row.lifecycle_state)
      || !['online', 'offline', 'active'].includes(row.gateway_status)
      || !['online', 'offline', 'active'].includes(row.site_status)) return null;
    return row;
  }
}
