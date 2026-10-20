import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import * as argon2 from 'argon2';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service.js';
import { parseGatewayControlTopic } from './gateway-control-payload.js';

interface CredentialRow {
  id: string;
  external_gateway_id: string;
  username: string;
  password_hash: string;
  revoked_at: string | null;
  retired_at: string | null;
  lifecycle_state: string;
  protocol: string;
  gateway_status: string;
  site_status: string;
  mqtt_access_suspended: boolean;
}

interface VerificationOptions {
  env?: Record<string, string | undefined>;
  now?: () => number;
  verifyHash?: (hash: string, password: string) => Promise<boolean>;
}

export interface GatewayCredentialContext { sourceAddress?: string }
export const GATEWAY_CREDENTIAL_VERIFICATION = Symbol('GATEWAY_CREDENTIAL_VERIFICATION');

/** Only numeric transport IPs become keys; never retain arbitrary input. */
export function normalizeMqttSourceAddress(input: unknown): string {
  const missing = '<missing-source>';
  if (typeof input !== 'string' || input.length > 128) return missing;
  const trimmed = input.trim();
  const value = trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed;
  const family = isIP(value);
  if (family === 4) return value;
  if (family !== 6) return missing;
  try {
    const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1).toLowerCase();
    const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(canonical);
    if (!mapped) return canonical;
    const high = Number.parseInt(mapped[1]!, 16), low = Number.parseInt(mapped[2]!, 16);
    return `${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`;
  } catch { return missing; }
}

function boundedSetting(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

interface AttemptEntry { failures: number; inFlight: number; expiresAt: number }

/** Synchronous admission prevents work from entering Argon2's native queue. */
export class GatewayCredentialVerification {
  private readonly concurrency: number;
  private readonly failureLimit: number;
  private readonly windowMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly verifyHash: (hash: string, password: string) => Promise<boolean>;
  private readonly attempts = new Map<string, AttemptEntry>();
  private active = 0;

  constructor(options: VerificationOptions = {}) {
    const env = options.env ?? process.env;
    this.concurrency = boundedSetting(env.MQTT_ARGON2_CONCURRENCY, 2, 1, 4);
    this.failureLimit = boundedSetting(env.MQTT_AUTH_FAILURE_LIMIT, 5, 1, 20);
    this.windowMs = boundedSetting(env.MQTT_AUTH_FAILURE_WINDOW_MS, 60000, 1000, 300000);
    this.maxEntries = boundedSetting(env.MQTT_AUTH_FAILURE_MAX_ENTRIES, 4096, 64, 16384);
    this.now = options.now ?? (() => performance.now());
    this.verifyHash = options.verifyHash ?? argon2.verify;
  }

  async verify(gatewayId: string, hash: string, password: string, sourceAddress?: string): Promise<boolean> {
    if (this.active >= this.concurrency) return false;
    const now = this.now();
    for (const [key, entry] of this.attempts) {
      if (entry.inFlight === 0 && entry.expiresAt <= now) this.attempts.delete(key);
    }
    const key = JSON.stringify([gatewayId, normalizeMqttSourceAddress(sourceAddress)]);
    let entry = this.attempts.get(key);
    if (!entry) {
      // Fail closed at capacity. Evicting live failures would let key churn bypass
      // a gateway's budget. Expiry or successful verification reclaims the slot.
      if (this.attempts.size >= this.maxEntries) return false;
      entry = { failures: 0, inFlight: 0, expiresAt: now + this.windowMs };
      this.attempts.set(key, entry);
    }
    if (entry.failures + entry.inFlight >= this.failureLimit) return false;
    entry.inFlight++;
    this.active++;
    try {
      const verified = await this.verifyHash(hash, password);
      if (verified) entry.failures = 0;
      else entry.failures++;
      return verified;
    } catch {
      entry.failures++;
      return false;
    } finally {
      entry.inFlight--;
      this.active--;
      if (entry.failures === 0 && entry.inFlight === 0) this.attempts.delete(key);
    }
  }
}

// A single default admission budget spans every service instance in this process.
// Explicit injection provides deterministic clock/hash boundaries in tests.
let processVerification: GatewayCredentialVerification | undefined;

@Injectable()
export class GatewayCredentialService {
  private readonly verification: GatewayCredentialVerification;
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Optional() @Inject(GATEWAY_CREDENTIAL_VERIFICATION) verification?: GatewayCredentialVerification,
  ) {
    this.verification = verification ?? (processVerification ??= new GatewayCredentialVerification());
  }

  private async create(client: PoolClient, gatewayId: string, createdBy: string): Promise<{ id:string;username: string; password: string }> {
    // The caller owns BEGIN/COMMIT so issuance is atomic with approval. Locking
    // the gateway also serializes concurrent rotations before the partial indexes.
    const rows = (await client.query(`SELECT id,external_gateway_id,retired_at,protocol FROM gateways WHERE id=$1 FOR UPDATE`, [gatewayId])).rows;
    const gateway = rows[0];
    const username: unknown = gateway?.external_gateway_id;
    if (rows.length !== 1 || gateway.retired_at !== null || gateway.protocol !== 'mqtt'
      || typeof username !== 'string' || username === 'solar-backend'
      || !parseGatewayControlTopic(`solar/v1/gateways/${username}/register`)) {
      throw new Error('Gateway cannot receive MQTT credentials');
    }
    const password = randomBytes(32).toString('base64url');
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    const id=randomUUID();
    await client.query('UPDATE gateway_mqtt_credentials SET revoked_at=clock_timestamp() WHERE gateway_id=$1 AND revoked_at IS NULL', [gatewayId]);
    await client.query(`INSERT INTO gateway_mqtt_credentials(id,gateway_id,username,password_hash,created_by)
      VALUES($1,$2,$3,$4,$5)`, [id,gatewayId, username, hash, createdBy]);
    return {id,username, password };
  }

  async issue(client: PoolClient, gatewayId: string, createdBy: string): Promise<{ username: string; password: string }> {
    const {username,password}=await this.create(client,gatewayId,createdBy);
    return {username,password};
  }

  async rotate(client: PoolClient, gatewayId: string, createdBy: string): Promise<{ username: string; password: string }> {
    const {username,password}=await this.create(client,gatewayId,createdBy);
    return {username,password};
  }

  async rotateWithGeneration(client:PoolClient,gatewayId:string,createdBy:string):Promise<{id:string;username:string;password:string}>{
    return this.create(client,gatewayId,createdBy);
  }

  async verify(gatewayId: string, password: string, context?: GatewayCredentialContext): Promise<boolean> {
    if (typeof password !== 'string' || !password) return false;
    try {
      const rows = (await this.db.query<CredentialRow>(`SELECT c.id,c.username,c.password_hash,c.revoked_at,
        g.external_gateway_id,g.retired_at,g.lifecycle_state,g.protocol,g.status AS gateway_status,s.status AS site_status,g.mqtt_access_suspended
        FROM gateway_mqtt_credentials c JOIN gateways g ON g.id=c.gateway_id JOIN sites s ON s.id=g.site_id
        WHERE c.gateway_id=$1 AND c.revoked_at IS NULL LIMIT 2`, [gatewayId])).rows;
      const row = rows[0];
      if (rows.length !== 1 || !row || row.revoked_at !== null || row.retired_at !== null
        || !['configuring', 'active'].includes(row.lifecycle_state) || row.protocol !== 'mqtt'
        || !['online', 'offline', 'active'].includes(row.gateway_status)
        || !['online', 'offline', 'active'].includes(row.site_status)
        || row.mqtt_access_suspended
        || row.username !== row.external_gateway_id || row.username === 'solar-backend'
        || !parseGatewayControlTopic(`solar/v1/gateways/${row.external_gateway_id}/register`)
        || typeof row.password_hash !== 'string' || !row.password_hash.startsWith('$argon2id$')) return false;
      const verified=await this.verification.verify(gatewayId, row.password_hash, password, context?.sourceAddress);
      if(!verified)return false;
      // Argon2 intentionally runs outside a database lock. A rotation can commit
      // while the hash is in flight, so authorize only after proving that the
      // exact generation we verified is still the sole active generation and
      // gateway access has not been suspended by the rotation workflow.
      const current=(await this.db.query<Pick<CredentialRow,'id'|'revoked_at'|'mqtt_access_suspended'>>(`SELECT c.id,c.revoked_at,g.mqtt_access_suspended
        FROM gateway_mqtt_credentials c JOIN gateways g ON g.id=c.gateway_id
        WHERE c.gateway_id=$1 AND c.id=$2 AND c.revoked_at IS NULL LIMIT 2`,[gatewayId,row.id])).rows;
      return current.length===1&&current[0]?.id===row.id&&current[0].revoked_at===null&&!current[0].mqtt_access_suspended;
    } catch {
      // Driver/hash errors may contain sensitive values. Fail closed without logging.
      return false;
    }
  }
}
