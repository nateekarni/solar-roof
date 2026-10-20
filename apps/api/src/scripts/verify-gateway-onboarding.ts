import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import mqtt, { type IClientOptions, type IPublishPacket, type MqttClient } from 'mqtt';
import { Pool } from 'pg';
import { parseGatewayControlPayload } from '../modules/gateway-control/gateway-control-payload.js';
import type { GatewayConfigPayload } from '@solar/api-contracts';

const requiredEnvironment = [
  'MQTT_E2E_URL',
  'DATABASE_URL',
  'E2E_ADMIN_ACCESS_TOKEN',
  'E2E_SITE_ID',
] as const;

export interface GatewayOnboardingE2EConfig {
  mqttUrl: string;
  databaseUrl: string;
  adminAccessToken: string;
  siteId: string;
  apiUrl: string;
  caFile?: string | undefined;
  pollTimeoutMs: number;
  operationTimeoutMs: number;
  scenarioTimeoutMs: number;
  cleanupUsername?: string | undefined;
  cleanupPassword?: string | undefined;
}

export function assertConfigDeliveryPacket(packet: Pick<IPublishPacket, 'qos' | 'retain'>): void {
  assert.equal(packet.qos, 1, 'configuration must be delivered at QoS 1');
  assert.equal(packet.retain, true, 'configuration must be retained');
}

export function assertDataAcceptedPacket(packet: Pick<IPublishPacket, 'qos' | 'retain'>): void {
  assert.equal(packet.qos, 1, 'dataAcept must be delivered at QoS 1');
  assert.equal(packet.retain, false, 'dataAcept must not be retained');
}

export function buildAppliedConfigTelemetry(config:GatewayConfigPayload,input:{messageId:string;sequence:number;lotNumber:number;deviceId:string;value:number;polledAt:string;sentAt:string}) {
  const device=config.devices.find(candidate=>candidate.deviceId===input.deviceId&&candidate.enabled);
  assert.ok(device?.deviceType&&device.profileId&&device.profileVersion,'applied config must pin an enabled device profile');
  return {schemaVersion:'1.1',messageType:'telemetry',messageId:input.messageId,sequence:input.sequence,lotNumber:input.lotNumber,
    configurationVersion:config.configVersion,siteId:config.siteId,gatewayId:config.gatewayId,
    device:{deviceId:input.deviceId,deviceType:device.deviceType,profileId:device.profileId,profileVersion:device.profileVersion},
    pollGroup:'energy',timestamps:{polledAt:input.polledAt,sentAt:input.sentAt},
    data:{values:{'energy.active.import.total':input.value},units:{'energy.active.import.total':'Wh'}},
    quality:{status:'good',communication:'online'}};
}

export function combineVerificationErrors(original: unknown, cleanupErrors: unknown[]): unknown {
  if (cleanupErrors.length === 0) return original;
  if (original === undefined && cleanupErrors.length === 1) return cleanupErrors[0];
  return new AggregateError(
    original === undefined ? cleanupErrors : [original, ...cleanupErrors],
    original === undefined ? 'Gateway onboarding cleanup failed' : 'Gateway onboarding verification and cleanup failed',
  );
}

export async function runWithinScenarioBudget<T>(timeoutMs: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Gateway onboarding scenario timeout exceeded')), timeoutMs);
  try {
    const result = await run(controller.signal);
    if (controller.signal.aborted) throw abortReason(controller.signal);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

export function sanitizeVerificationError(error: unknown, environment: NodeJS.ProcessEnv): string {
  let message = error instanceof Error ? error.message : 'unknown error';
  const sensitiveValues = Object.entries(environment)
    .filter(([name, value]) => Boolean(value) && /(?:TOKEN|PASSWORD|SECRET|DATABASE_URL)$/i.test(name))
    .map(([, value]) => value!)
    .sort((left, right) => right.length - left.length);
  for (const value of sensitiveValues) message = message.replaceAll(value, '[redacted]');
  message = message
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/([?&](?:access_token|token|password|secret|api_key)=)[^&#\s]+/gi, '$1[redacted]')
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi, '$1[redacted]@');
  return message;
}

export interface GatewayOnboardingVerificationResult {
  runId: string;
  gatewayId: string;
  deviceId: string;
  siteId: string;
  discoveryId: string;
  internalGatewayId: string;
  configVersions: { version: number; hash: string }[];
  messageIds: string[];
  checks: string[];
  cleanup: 'credential-revoked-gateway-disabled-and-retired';
}

export function gatewayOnboardingE2EDecision(environment: NodeJS.ProcessEnv): { skip: boolean } {
  const configured = requiredEnvironment.every(name => Boolean(environment[name]?.trim()));
  return { skip: !configured && environment.MQTT_E2E_REQUIRED !== 'true' };
}

export function loadGatewayOnboardingE2EConfig(environment: NodeJS.ProcessEnv): GatewayOnboardingE2EConfig {
  const missing = requiredEnvironment.filter(name => !environment[name]?.trim());
  if (missing.length > 0) throw new Error(`Missing required gateway onboarding E2E settings: ${missing.join(', ')}`);
  const mqttUrl = environment.MQTT_E2E_URL!.trim();
  const apiUrl = environment.E2E_API_URL?.trim() || 'http://127.0.0.1:3001';
  const siteId = environment.E2E_SITE_ID!.trim();
  const pollTimeoutMs = Number(environment.MQTT_E2E_POLL_TIMEOUT_MS ?? 20_000);
  const operationTimeoutMs = Number(environment.MQTT_E2E_OPERATION_TIMEOUT_MS ?? 10_000);
  const scenarioTimeoutMs = Number(environment.MQTT_E2E_SCENARIO_TIMEOUT_MS ?? 300_000);
  let parsedMqttUrl: URL;
  let parsedApiUrl: URL;
  try { parsedMqttUrl = new URL(mqttUrl); }
  catch { throw new Error('MQTT_E2E_URL must be a valid URL'); }
  try { parsedApiUrl = new URL(apiUrl); }
  catch { throw new Error('E2E_API_URL must be a valid URL'); }
  if (!['mqtt:', 'mqtts:', 'ws:', 'wss:'].includes(parsedMqttUrl.protocol)) throw new Error('MQTT_E2E_URL must use mqtt, mqtts, ws, or wss');
  if (parsedMqttUrl.username || parsedMqttUrl.password) throw new Error('MQTT_E2E_URL must not include username or password');
  if (!['http:', 'https:'].includes(parsedApiUrl.protocol)) throw new Error('E2E_API_URL must use http or https');
  if (parsedApiUrl.username || parsedApiUrl.password) throw new Error('E2E_API_URL must not include username or password');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(siteId)) throw new Error('E2E_SITE_ID must be a UUID');
  if (!Number.isSafeInteger(pollTimeoutMs) || pollTimeoutMs < 1_000 || pollTimeoutMs > 120_000) throw new Error('MQTT_E2E_POLL_TIMEOUT_MS must be an integer between 1000 and 120000');
  if (!Number.isSafeInteger(operationTimeoutMs) || operationTimeoutMs < 1_000 || operationTimeoutMs > 30_000) throw new Error('MQTT_E2E_OPERATION_TIMEOUT_MS must be an integer between 1000 and 30000');
  if (!Number.isSafeInteger(scenarioTimeoutMs) || scenarioTimeoutMs < 30_000 || scenarioTimeoutMs > 900_000) throw new Error('MQTT_E2E_SCENARIO_TIMEOUT_MS must be an integer between 30000 and 900000');
  return {
    mqttUrl,
    databaseUrl: environment.DATABASE_URL!.trim(),
    adminAccessToken: environment.E2E_ADMIN_ACCESS_TOKEN!.trim(),
    siteId,
    apiUrl: apiUrl.replace(/\/$/, ''),
    caFile: environment.MQTT_E2E_CA_FILE?.trim() || undefined,
    pollTimeoutMs,
    operationTimeoutMs,
    scenarioTimeoutMs,
    cleanupUsername: environment.MQTT_E2E_CLEANUP_USERNAME?.trim() || environment.MQTT_USERNAME?.trim() || undefined,
    cleanupPassword: environment.MQTT_E2E_CLEANUP_PASSWORD || environment.MQTT_PASSWORD || undefined,
  };
}

type Json = Record<string, unknown>;

function abortReason(signal: AbortSignal): unknown {
  return signal.reason instanceof Error ? signal.reason : new Error('Gateway onboarding scenario aborted');
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Unknown verification failure');
}

async function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return await new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));
  if (signal.aborted) throw abortReason(signal);
  await new Promise<void>((resolveDelay, reject) => {
    const timer = setTimeout(() => { signal.removeEventListener('abort', aborted); resolveDelay(); }, milliseconds);
    const aborted = () => { clearTimeout(timer); reject(abortReason(signal)); };
    signal.addEventListener('abort', aborted, { once: true });
  });
}

async function poll<T>(read: () => Promise<T>, accept: (value: T) => boolean, label: string, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T;
  do {
    if (signal?.aborted) throw abortReason(signal);
    last = await read();
    if (accept(last)) return last;
    await delay(100, signal);
  } while (Date.now() < deadline);
  throw new Error(`Timed out waiting for ${label}`);
}

async function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw abortReason(signal);
  let timer: NodeJS.Timeout | undefined;
  let abortListener: (() => void) | undefined;
  try {
    const contenders: Promise<T>[] = [
      promise,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), timeoutMs); }),
    ];
    if (signal) contenders.push(new Promise<never>((_, reject) => {
      abortListener = () => reject(abortReason(signal));
      signal.addEventListener('abort', abortListener, { once: true });
    }));
    return await Promise.race(contenders);
  } finally {
    if (timer) clearTimeout(timer);
    if (signal && abortListener) signal.removeEventListener('abort', abortListener);
  }
}

type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> };

async function databaseQuery(queryable: Queryable, text: string, values: unknown[] | undefined, timeoutMs: number, label: string, signal?: AbortSignal) {
  return await withTimeout(queryable.query(text, values), `database ${label}`, timeoutMs, signal);
}

async function publish(client: MqttClient, topic: string, payload: string | Buffer, options: { qos: 1; retain: boolean }, timeoutMs: number, signal?: AbortSignal): Promise<void> {
  await withTimeout(client.publishAsync(topic, payload, options), `MQTT PUBACK for ${topic}`, timeoutMs, signal);
}

async function subscribe(client: MqttClient, topic: string | string[], timeoutMs: number, signal?: AbortSignal): Promise<void> {
  await withTimeout(client.subscribeAsync(topic, { qos: 1 }), 'MQTT SUBACK', timeoutMs, signal);
}

async function unsubscribe(client: MqttClient, topic: string, timeoutMs: number, signal?: AbortSignal): Promise<void> {
  await withTimeout(client.unsubscribeAsync(topic), `MQTT UNSUBACK for ${topic}`, timeoutMs, signal);
}

async function apiRequest<T>(config: GatewayOnboardingE2EConfig, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const method = body === undefined ? 'GET' : 'POST';
  const response = await fetch(config.apiUrl + path, {
    method,
    headers: {
      Authorization: `Bearer ${config.adminAccessToken}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(config.operationTimeoutMs)]) : AbortSignal.timeout(config.operationTimeoutMs),
  });
  if (!response.ok) throw new Error(`${method} ${path} failed with HTTP ${response.status}`);
  return await response.json() as T;
}

class Messages {
  private readonly packets: { topic: string; payload: Json; packet: IPublishPacket }[] = [];
  constructor(client: MqttClient) {
    client.on('message', (topic, bytes, packet) => {
      try {
        const payload = JSON.parse(bytes.toString('utf8')) as unknown;
        if (payload && typeof payload === 'object' && !Array.isArray(payload)) this.packets.push({ topic, payload: payload as Json, packet });
      } catch {
        // The verifier ignores unrelated non-JSON messages instead of logging them.
      }
    });
  }
  clear(topic: string): void { for (let index = this.packets.length - 1; index >= 0; index--) if (this.packets[index]?.topic === topic) this.packets.splice(index, 1); }
  find(topic: string, predicate: (payload: Json) => boolean): { payload: Json; packet: IPublishPacket } | undefined {
    const found = this.packets.find(entry => entry.topic === topic && predicate(entry.payload));
    return found ? { payload: found.payload, packet: found.packet } : undefined;
  }
}

async function connectClient(url: string, options: IClientOptions, timeoutMs: number, signal?: AbortSignal): Promise<MqttClient> {
  const client = mqtt.connect(url, { protocolVersion: 5, clean: true, reconnectPeriod: 0, connectTimeout: timeoutMs, ...options });
  try {
    await withTimeout(new Promise<void>((resolveConnect, reject) => {
      const cleanup = () => { client.off('connect', connected); client.off('error', failed); };
      const connected = () => { cleanup(); resolveConnect(); };
      const failed = () => { cleanup(); reject(new Error('MQTT connection failed')); };
      client.once('connect', connected);
      client.once('error', failed);
    }), 'MQTT CONNACK', timeoutMs, signal);
    return client;
  } catch (error) {
    try {
      await endClient(client, timeoutMs, true);
    } catch (cleanupError) {
      client.stream.destroy();
      throw combineVerificationErrors(error, [cleanupError]);
    }
    throw error;
  }
}

function denialCode(error: unknown): number | undefined {
  const value = error as { code?: unknown; reasonCode?: unknown };
  return typeof value?.code === 'number' ? value.code : typeof value?.reasonCode === 'number' ? value.reasonCode : undefined;
}

async function expectSubscribeDenied(client: MqttClient, topic: string, timeoutMs: number, signal?: AbortSignal): Promise<void> {
  try {
    const grants = await withTimeout(client.subscribeAsync(topic, { qos: 1 }), `denied SUBACK for ${topic}`, timeoutMs, signal);
    if (grants.some(grant => grant.qos === 128)) return;
  } catch (error) {
    if ((denialCode(error) ?? 0) >= 128) return;
    throw new Error(`Subscription denial was not confirmed for ${topic}`);
  }
  throw new Error(`Subscription was unexpectedly granted for ${topic}`);
}

async function expectPublishDenied(client: MqttClient, topic: string, payload: unknown, timeoutMs: number, signal?: AbortSignal): Promise<void> {
  try {
    await withTimeout(client.publishAsync(topic, JSON.stringify(payload), { qos: 1, retain: false }), `denied PUBACK for ${topic}`, timeoutMs, signal);
  } catch (error) {
    if ((denialCode(error) ?? 0) >= 128) return;
    throw new Error(`Publication denial was not confirmed for ${topic}`);
  }
  throw new Error(`Publication was unexpectedly accepted for ${topic}`);
}

async function endClient(client: MqttClient | undefined, timeoutMs: number, force = false): Promise<void> {
  if (!client) return;
  await withTimeout(client.endAsync(force), 'MQTT client shutdown', timeoutMs);
}

function statusPayload(gatewayId: string, sessionId: string, state: 'online' | 'offline', version: number | null, hash: string | null, messageId = randomUUID()) {
  return { schemaVersion: '1.1', messageType: 'status', messageId, gatewayId, sessionId,
    firmwareVersion: 'e2e-1.0.0', status: state, appliedConfigVersion: version,
    appliedConfigHash: hash, reportedAt: new Date().toISOString() };
}

function configStatusPayload(gatewayId: string, version: number, hash: string, status: 'received' | 'applied') {
  return { schemaVersion: '1.1', messageType: 'configStatus', messageId: randomUUID(), gatewayId,
    configVersion: version, configHash: hash, status, reportedAt: new Date().toISOString() };
}

async function containTestGateway(pool: Pool, siteId: string, gatewayId: string, timeoutMs: number, internalGatewayId?: string): Promise<void> {
  const client = await withTimeout(pool.connect(), 'database cleanup connection', timeoutMs);
  let transactionOpen = false;
  let releaseError: Error | undefined;
  try {
    await databaseQuery(client, 'BEGIN', undefined, timeoutMs, 'cleanup begin');
    transactionOpen = true;
    const discovery = (await databaseQuery(client, `SELECT id,assigned_gateway_id FROM discovered_gateways
      WHERE external_gateway_id=$1 AND (assigned_site_id IS NULL OR assigned_site_id=$2) FOR UPDATE`, [gatewayId, siteId], timeoutMs, 'cleanup discovery lock')).rows;
    assert.ok(discovery.length <= 1, 'cleanup identity is unique');
    const assigned = internalGatewayId ?? discovery[0]?.assigned_gateway_id;
    if (assigned) {
      const gateway = (await databaseQuery(client, `SELECT id,external_gateway_id,site_id FROM gateways WHERE id=$1 FOR UPDATE`, [assigned], timeoutMs, 'cleanup gateway lock')).rows[0];
      assert.equal(gateway?.external_gateway_id, gatewayId, 'cleanup can only target the generated gateway identity');
      assert.equal(gateway?.site_id, siteId, 'cleanup can only target the configured test site');
      await databaseQuery(client, 'UPDATE gateway_mqtt_credentials SET revoked_at=coalesce(revoked_at,now()) WHERE gateway_id=$1', [assigned], timeoutMs, 'credential revocation');
      await databaseQuery(client, `UPDATE gateways SET lifecycle_state='disabled',status='offline',retired_at=coalesce(retired_at,now()) WHERE id=$1`, [assigned], timeoutMs, 'gateway retirement');
    }
    await databaseQuery(client, `UPDATE discovered_gateways SET status='ignored' WHERE external_gateway_id=$1
      AND (assigned_site_id IS NULL OR assigned_site_id=$2)`, [gatewayId, siteId], timeoutMs, 'discovery containment');
    await databaseQuery(client, 'COMMIT', undefined, timeoutMs, 'cleanup commit');
    transactionOpen = false;
  } catch (error) {
    if (!transactionOpen) throw error;
    try {
      await databaseQuery(client, 'ROLLBACK', undefined, timeoutMs, 'cleanup rollback');
    } catch (rollbackError) {
      releaseError = asError(rollbackError);
      throw combineVerificationErrors(error, [rollbackError]);
    }
    throw error;
  } finally {
    client.release(releaseError);
  }
}

async function clearRetainedControlState(config: GatewayOnboardingE2EConfig, mqttBase: IClientOptions, gatewayId: string, signal?: AbortSignal): Promise<void> {
  if (!config.cleanupUsername || !config.cleanupPassword) {
    throw new Error('MQTT_E2E_CLEANUP_USERNAME/MQTT_E2E_CLEANUP_PASSWORD or MQTT_USERNAME/MQTT_PASSWORD are required to clear test-owned retained control packets');
  }
  const client = await connectClient(config.mqttUrl, {
    ...mqttBase,
    clientId: `solar-e2e-cleanup-${randomUUID()}`,
    username: config.cleanupUsername,
    password: config.cleanupPassword,
  }, config.operationTimeoutMs, signal);
  const errors: unknown[] = [];
  for (const topic of [`solar/v1/gateways/${gatewayId}/config`, `solar/v1/gateways/${gatewayId}/status`]) {
    try { await publish(client, topic, Buffer.alloc(0), { qos: 1, retain: true }, config.operationTimeoutMs, signal); }
    catch (error) { errors.push(error); }
  }
  try {
    await endClient(client, config.operationTimeoutMs);
  } catch (gracefulError) {
    try {
      await endClient(client, config.operationTimeoutMs, true);
      errors.push(gracefulError);
    } catch (forcedError) {
      client.stream.destroy();
      errors.push(combineVerificationErrors(gracefulError, [forcedError]));
    }
  }
  if (errors.length > 0) throw combineVerificationErrors(undefined, errors);
}

async function executeGatewayOnboardingVerification(config: GatewayOnboardingE2EConfig, signal: AbortSignal): Promise<GatewayOnboardingVerificationResult> {
  const runId = randomUUID().replaceAll('-', '').slice(0, 16);
  const gatewayId = `E2E-GW-${runId}`;
  const deviceId = `E2E-METER-${runId}`;
  const sessionId = `E2E-BOOT-${runId}`;
  const registerMessageId = randomUUID();
  const messageIds = [registerMessageId];
  const checks: string[] = [];
  const versions: { version: number; hash: string }[] = [];
  if (!config.cleanupUsername || !config.cleanupPassword) {
    throw new Error('Broker cleanup credentials are required before the live verifier can create retained control packets');
  }
  const pool = new Pool({
    connectionString: config.databaseUrl,
    connectionTimeoutMillis: config.operationTimeoutMs,
    query_timeout: config.operationTimeoutMs,
    statement_timeout: config.operationTimeoutMs,
  });
  const clients = new Set<MqttClient>();
  let anonymous: MqttClient | undefined;
  let gateway: MqttClient | undefined;
  let discoveryId = '';
  let internalGatewayId = '';
  let cleanupComplete = false;
  let retainedStateCleared = false;
  let stateMayExist = false;
  let primaryError: unknown;
  let mqttBase: IClientOptions = {};

  const registerTopic = `solar/v1/gateways/${gatewayId}/register`;
  const configTopic = `solar/v1/gateways/${gatewayId}/config`;
  const configStatusTopic = `solar/v1/gateways/${gatewayId}/configStatus`;
  const configUpdateTopic = `solar/v1/gateways/${gatewayId}/configUpdate`;
  const statusTopic = `solar/v1/gateways/${gatewayId}/status`;

  try {
    const caReadSignal = AbortSignal.any([signal, AbortSignal.timeout(config.operationTimeoutMs)]);
    const ca = config.caFile
      ? await withTimeout(readFile(config.caFile, { signal: caReadSignal }), 'MQTT CA file read', config.operationTimeoutMs, signal)
      : undefined;
    mqttBase = { ...(ca ? { ca } : {}) };
    const site = (await databaseQuery(pool, `SELECT id,external_site_id,status FROM sites WHERE id=$1`, [config.siteId], config.operationTimeoutMs, 'site precondition', signal)).rows[0];
    assert.ok(site && site.status !== 'archived' && site.external_site_id, 'E2E_SITE_ID must identify an active site with an external identity');
    const occupied = Number((await databaseQuery(pool, 'SELECT count(*)::int AS count FROM gateways WHERE site_id=$1 AND retired_at IS NULL', [config.siteId], config.operationTimeoutMs, 'dedicated-site precondition', signal)).rows[0]?.count ?? 0);
    assert.equal(occupied, 0, 'E2E_SITE_ID must be a dedicated site without an active gateway');
    const externalSiteId = String(site.external_site_id);
    const ackTopic = `solar/v1/sites/${externalSiteId}/gateways/${gatewayId}/dataAcept`;
    const telemetryTopic = `solar/v1/sites/${externalSiteId}/gateways/${gatewayId}/devices/${deviceId}/telemetry`;

    // Prove that cleanup credentials can tombstone this unique control scope
    // before registration can create any durable or retained state.
    await clearRetainedControlState(config, mqttBase, gatewayId, signal);

    anonymous = await connectClient(config.mqttUrl, { ...mqttBase, clientId: gatewayId }, config.operationTimeoutMs, signal);
    clients.add(anonymous);
    await expectSubscribeDenied(anonymous, configTopic, config.operationTimeoutMs, signal);
    checks.push('anonymous config subscription denied by broker');

    const register = {
      schemaVersion: '1.1', messageType: 'register', messageId: registerMessageId, sentAt: new Date().toISOString(),
      gateway: { gatewayId, model: 'E2E-Simulator', firmwareVersion: 'e2e-1.0.0' },
      reportedSiteId: `UNTRUSTED-${runId}`,
      devices: [{ deviceId, deviceType: 'energy-meter', manufacturer: 'Synthetic E2E fixture', model: 'UNVERIFIED-METER',
        firmwareVersion: 'e2e-1.0.0', serialNumber: `E2E-SERIAL-${runId}`, protocol: 'modbus-tcp',
        connection: { host: '192.0.2.10', port: 502, slaveId: 1 }, pollGroups: ['energy'],
        mappings: [{ tag: 'energy.active.import.total', required: true, registerAddress: '1',
          displayName: 'Synthetic cumulative import', pollGroup: 'energy', sourceUnit: 'Wh', targetUnit: 'kWh',
          conversion: 'wh-to-kwh', role: 'billing-import', registerCount: 2, dataType: 'uint32',
          byteOrder: 'big_endian', wordOrder: 'big_word_first', scale: 1, offset: 0 }] }],
    };
    stateMayExist = true;
    await publish(anonymous, registerTopic, JSON.stringify(register), { qos: 1, retain: false }, config.operationTimeoutMs, signal);

    type Discovery = { id: string; externalGatewayId: string; discoveryRevision: number };
    const discovery = await poll(async () => {
      const rows = await apiRequest<Discovery[]>(config, '/v1/gateways/discovered?status=unassigned', undefined, signal);
      return rows.find(row => row.externalGatewayId === gatewayId);
    }, Boolean, 'discovered gateway admin row', config.pollTimeoutMs, signal);
    assert.ok(discovery);
    discoveryId = discovery.id;
    checks.push('anonymous registration appeared in the unconnected admin API');

    const deviceConfig = {
      ...register.devices[0], mappingSource: 'manual', enabled: true,
    };
    type Confirmation = { gatewayId: string; configVersion: number; configHash: string;
      credential: { username: string; password: string } };
    const confirmation = await apiRequest<Confirmation>(config, `/v1/gateways/discovered/${discovery.id}/confirm`, {
      discoveryRevision: discovery.discoveryRevision, siteId: config.siteId, devices: [deviceConfig],
    }, signal);
    internalGatewayId = confirmation.gatewayId;
    assert.equal(confirmation.configVersion, 1);
    assert.equal(confirmation.credential.username, gatewayId);
    assert.ok(confirmation.credential.password.length >= 32);
    const credentialRow = (await databaseQuery(pool, 'SELECT password_hash FROM gateway_mqtt_credentials WHERE gateway_id=$1 AND revoked_at IS NULL', [internalGatewayId], config.operationTimeoutMs, 'credential hash proof', signal)).rows[0];
    assert.ok(credentialRow?.password_hash && credentialRow.password_hash !== confirmation.credential.password, 'database stores only the credential hash');
    versions.push({ version: confirmation.configVersion, hash: confirmation.configHash });
    await endClient(anonymous, config.operationTimeoutMs);
    clients.delete(anonymous);
    anonymous = undefined;

    const firstWill = statusPayload(gatewayId, sessionId, 'offline', null, null);
    messageIds.push(firstWill.messageId);
    gateway = await connectClient(config.mqttUrl, { ...mqttBase, clientId: gatewayId, username: confirmation.credential.username,
      password: confirmation.credential.password, will: { topic: statusTopic, payload: JSON.stringify(firstWill), qos: 1, retain: true } }, config.operationTimeoutMs, signal);
    clients.add(gateway);
    const messages = new Messages(gateway);
    await subscribe(gateway, configTopic, config.operationTimeoutMs, signal);
    const onlineBeforeApply = statusPayload(gatewayId, sessionId, 'online', null, null);
    messageIds.push(onlineBeforeApply.messageId);
    await publish(gateway, statusTopic, JSON.stringify(onlineBeforeApply), { qos: 1, retain: true }, config.operationTimeoutMs, signal);
    const retained1 = await poll(async () => messages.find(configTopic, payload => payload.configVersion === 1), Boolean,
      'retained configuration version 1', config.pollTimeoutMs, signal);
    assert.ok(retained1);
    assertConfigDeliveryPacket(retained1.packet);
    const desired1 = parseGatewayControlPayload('config', retained1.payload);
    assert.equal(desired1.configHash, confirmation.configHash);
    assert.equal(desired1.siteId, externalSiteId);
    assert.equal(desired1.gatewayId, gatewayId);
    checks.push('one-time credential reconnect received matching retained config');

    const configuredDevice = desired1.devices.find(device => device.deviceId === deviceId);
    assert.ok(configuredDevice?.profileId && configuredDevice.profileVersion, 'retained config pins the generated device profile');
    const preApplyMessageId = randomUUID();
    messageIds.push(preApplyMessageId);
    const preApplyTelemetry = buildAppliedConfigTelemetry(desired1,{messageId:preApplyMessageId,sequence:0,lotNumber:1,deviceId,value:123_455,
      polledAt:new Date(Date.now()-1_000).toISOString(),sentAt:new Date().toISOString()});
    await expectSubscribeDenied(gateway, ackTopic, config.operationTimeoutMs, signal);
    await expectPublishDenied(gateway, telemetryTopic, preApplyTelemetry, config.operationTimeoutMs, signal);
    assert.equal(Number((await databaseQuery(pool, `SELECT count(*)::int AS count FROM payload_messages
      WHERE gateway_id=$1 AND message_id=$2`, [internalGatewayId, preApplyMessageId], config.operationTimeoutMs, 'pre-apply denial proof', signal)).rows[0]?.count ?? 0), 0,
    'pre-apply telemetry denial cannot create a durable message');
    checks.push('pre-apply dataAcept subscription and telemetry publication denied');

    for (const state of ['received', 'applied'] as const) {
      const payload = configStatusPayload(gatewayId, desired1.configVersion, desired1.configHash, state);
      messageIds.push(payload.messageId);
      await publish(gateway, configStatusTopic, JSON.stringify(payload), { qos: 1, retain: false }, config.operationTimeoutMs, signal);
      if (state === 'received') await poll(async () => (await databaseQuery(pool, `SELECT count(*)::int AS count FROM gateway_config_status_events
        WHERE gateway_id=$1 AND message_id=$2 AND status='received'`, [internalGatewayId, payload.messageId], config.operationTimeoutMs, 'received status persistence', signal)).rows[0]?.count,
      count => Number(count) === 1, 'received config status persistence', config.pollTimeoutMs, signal);
    }
    type Sync = { lifecycleState: string; configState: string; connectionState: string;
      activeConfigVersion: number; activeConfigHash: string };
    await poll(() => apiRequest<Sync>(config, `/v1/gateways/${internalGatewayId}/sync-state`, undefined, signal), state =>
      state.lifecycleState === 'active' && state.configState === 'applied' && state.connectionState === 'online'
      && state.activeConfigVersion === 1 && state.activeConfigHash === desired1.configHash,
    'active/applied gateway transition', config.pollTimeoutMs, signal);
    checks.push('matching received/applied configStatus activated the gateway');

    await subscribe(gateway, ackTopic, config.operationTimeoutMs, signal);
    messages.clear(ackTopic);
    const onlineAfterApply = statusPayload(gatewayId, sessionId, 'online', 1, desired1.configHash);
    messageIds.push(onlineAfterApply.messageId);
    await publish(gateway, statusTopic, JSON.stringify(onlineAfterApply), { qos: 1, retain: true }, config.operationTimeoutMs, signal);
    await poll(async () => (await databaseQuery(pool, `SELECT status FROM gateway_connection_events
      WHERE gateway_id=$1 AND message_id=$2`, [internalGatewayId, onlineAfterApply.messageId], config.operationTimeoutMs,
    'pre-barrier online status persistence', signal)).rows[0]?.status,
    state => state === 'online', 'online status committed before telemetry barrier', config.pollTimeoutMs, signal);

    const telemetryMessageId = randomUUID();
    messageIds.push(telemetryMessageId);
    const telemetry=buildAppliedConfigTelemetry(desired1,{messageId:telemetryMessageId,sequence:1,lotNumber:1,deviceId,value:123_456,
      polledAt:new Date(Date.now()-1_000).toISOString(),sentAt:new Date().toISOString()});
    const barrier = await withTimeout(pool.connect(), 'database commit barrier connection', config.operationTimeoutMs, signal);
    let barrierOpen = false;
    let barrierReleaseError: Error | undefined;
    try {
      await databaseQuery(barrier, 'BEGIN', undefined, config.operationTimeoutMs, 'commit barrier begin', signal);
      barrierOpen = true;
      const lockerPid = Number((await databaseQuery(barrier, 'SELECT pg_backend_pid() AS pid', undefined,
        config.operationTimeoutMs, 'commit barrier pid', signal)).rows[0]?.pid);
      await databaseQuery(barrier, 'SELECT id FROM gateways WHERE id=$1 FOR UPDATE', [internalGatewayId],
        config.operationTimeoutMs, 'commit barrier gateway lock', signal);
      await publish(gateway, telemetryTopic, JSON.stringify(telemetry), { qos: 1, retain: false }, config.operationTimeoutMs, signal);
      await poll(async () => Number((await databaseQuery(pool, `SELECT count(*)::int AS count FROM pg_stat_activity
        WHERE $1::int = ANY(pg_blocking_pids(pid)) AND wait_event_type='Lock'
          AND position('applied_config_version=$6' in query)>0
          AND position('active_config_hash=$7' in query)>0`, [lockerPid], config.operationTimeoutMs,
      'telemetry commit barrier observation', signal)).rows[0]?.count ?? 0),
      count => count === 1, 'telemetry transaction blocked before commit', config.pollTimeoutMs, signal);
      assert.equal(messages.find(ackTopic, payload => payload.messageId === telemetryMessageId), undefined,
        'dataAcept cannot be emitted while the telemetry transaction is blocked before commit');
      await databaseQuery(barrier, 'COMMIT', undefined, config.operationTimeoutMs, 'commit barrier release', signal);
      barrierOpen = false;
    } catch (error) {
      if (barrierOpen) {
        try { await databaseQuery(barrier, 'ROLLBACK', undefined, config.operationTimeoutMs, 'commit barrier rollback'); }
        catch (rollbackError) {
          barrierReleaseError = asError(rollbackError);
          throw combineVerificationErrors(error, [rollbackError]);
        }
      }
      throw error;
    } finally {
      barrier.release(barrierReleaseError);
    }
    const accepted = await poll(async () => messages.find(ackTopic, payload => payload.messageId === telemetryMessageId), Boolean,
      'post-commit dataAcept', config.pollTimeoutMs, signal);
    assert.ok(accepted);
    assert.equal(accepted.payload.status, 'accepted');
    assertDataAcceptedPacket(accepted.packet);
    type DurableTelemetryEffects = {
      messageCount: number; sampleCount: number; rawCount: number; lastSeenAt: string | Date | null;
      messageIds: string[]; sampleIds: string[]; rawIds: string[];
    };
    const durableEffects = async (): Promise<DurableTelemetryEffects> => {
      const row = (await databaseQuery(pool, `SELECT
        (SELECT count(*)::int FROM payload_messages m WHERE m.gateway_id=$1 AND m.message_id=$2) AS "messageCount",
        (SELECT count(*)::int FROM payload_samples s JOIN payload_messages m ON m.id=s.message_id WHERE m.gateway_id=$1 AND m.message_id=$2) AS "sampleCount",
        (SELECT count(*)::int FROM telemetry_raw r WHERE r.ingestion_id IN
          (SELECT 'payload:'||m.id::text FROM payload_messages m WHERE m.gateway_id=$1 AND m.message_id=$2)) AS "rawCount",
        (SELECT array_agg(m.id::text ORDER BY m.id::text) FROM payload_messages m WHERE m.gateway_id=$1 AND m.message_id=$2) AS "messageIds",
        (SELECT array_agg(s.id::text ORDER BY s.id::text) FROM payload_samples s JOIN payload_messages m ON m.id=s.message_id
          WHERE m.gateway_id=$1 AND m.message_id=$2) AS "sampleIds",
        (SELECT array_agg(r.id::text ORDER BY r.id::text) FROM telemetry_raw r WHERE r.ingestion_id IN
          (SELECT 'payload:'||m.id::text FROM payload_messages m WHERE m.gateway_id=$1 AND m.message_id=$2)) AS "rawIds",
        (SELECT last_seen_at FROM gateways WHERE id=$1) AS "lastSeenAt"`, [internalGatewayId, telemetryMessageId],
      config.operationTimeoutMs, 'durable telemetry effects', signal)).rows[0];
      return {
        messageCount: Number(row?.messageCount ?? 0), sampleCount: Number(row?.sampleCount ?? 0),
        rawCount: Number(row?.rawCount ?? 0), lastSeenAt: row?.lastSeenAt ?? null,
        messageIds: row?.messageIds ?? [], sampleIds: row?.sampleIds ?? [], rawIds: row?.rawIds ?? [],
      };
    };
    const firstEffects = await durableEffects();
    assert.deepEqual(
      { messageCount: firstEffects.messageCount, sampleCount: firstEffects.sampleCount, rawCount: firstEffects.rawCount },
      { messageCount: 1, sampleCount: 1, rawCount: 1 },
      'dataAcept corresponds to committed message, canonical sample, and downstream telemetry rows',
    );
    messages.clear(ackTopic);
    await publish(gateway, telemetryTopic, JSON.stringify(telemetry), { qos: 1, retain: false }, config.operationTimeoutMs, signal);
    const replayAccepted = await poll(async () => messages.find(ackTopic, payload => payload.messageId === telemetryMessageId), Boolean,
      'idempotent replay dataAcept', config.pollTimeoutMs, signal);
    assert.ok(replayAccepted);
    assertDataAcceptedPacket(replayAccepted.packet);
    assert.deepEqual(await durableEffects(), firstEffects,
      'QoS 1 replay cannot duplicate or mutate message, sample, downstream telemetry, or gateway-presence effects');
    checks.push('telemetry committed before dataAcept and QoS 1 replay stayed idempotent');

    const proposalId = `E2E-PROPOSAL-${runId}`;
    const updateMessageId = randomUUID();
    messageIds.push(updateMessageId);
    const update = { schemaVersion: '1.1', messageType: 'configUpdate', messageId: updateMessageId, gatewayId,
      siteId: externalSiteId, proposalId, baseConfigVersion: 1, sentAt: new Date().toISOString(),
      devices: desired1.devices.map(device => ({ ...device, firmwareVersion: 'e2e-1.0.1' })) };
    await publish(gateway, configUpdateTopic, JSON.stringify(update), { qos: 1, retain: false }, config.operationTimeoutMs, signal);
    type Proposal = { id: string; proposalId: string; baseConfigVersion: number; status: string };
    const proposal = await poll(async () => (await apiRequest<Proposal[]>(config,
      `/v1/gateways/${internalGatewayId}/config-proposals`, undefined, signal)).find(row => row.proposalId === proposalId), Boolean,
    'manual config proposal', config.pollTimeoutMs, signal);
    assert.ok(proposal);
    assert.equal(proposal.status, 'pending');
    const approved = await apiRequest<{ configVersion: number; configHash: string }>(config,
      `/v1/gateways/${internalGatewayId}/config-proposals/${proposal.id}/approve`,
      { expectedProposalId: proposalId, expectedBaseConfigVersion: 1 }, signal);
    assert.equal(approved.configVersion, 2);
    versions.push({ version: approved.configVersion, hash: approved.configHash });
    const delivered2 = await poll(async () => messages.find(configTopic, payload => payload.configVersion === 2), Boolean,
      'configuration version 2 delivery', config.pollTimeoutMs, signal);
    assert.ok(delivered2);
    const desired2 = parseGatewayControlPayload('config', delivered2.payload);
    assert.equal(desired2.configHash, approved.configHash);
    await unsubscribe(gateway, configTopic, config.operationTimeoutMs, signal);
    messages.clear(configTopic);
    await subscribe(gateway, configTopic, config.operationTimeoutMs, signal);
    const retained2 = await poll(async () => messages.find(configTopic, payload => payload.configVersion === 2), Boolean,
      'retained configuration version 2', config.pollTimeoutMs, signal);
    assert.ok(retained2);
    assertConfigDeliveryPacket(retained2.packet);
    for (const state of ['received', 'applied'] as const) {
      const payload = configStatusPayload(gatewayId, 2, desired2.configHash, state);
      messageIds.push(payload.messageId);
      await publish(gateway, configStatusTopic, JSON.stringify(payload), { qos: 1, retain: false }, config.operationTimeoutMs, signal);
    }
    await poll(() => apiRequest<Sync>(config, `/v1/gateways/${internalGatewayId}/sync-state`, undefined, signal), state =>
      state.lifecycleState === 'active' && state.configState === 'applied' && state.activeConfigVersion === 2 && state.activeConfigHash === desired2.configHash,
    'second applied configuration', config.pollTimeoutMs, signal);
    checks.push('configUpdate remained manual and produced/applied the next retained revision');

    await expectSubscribeDenied(gateway, `solar/v1/gateways/OTHER-${runId}/config`, config.operationTimeoutMs, signal);
    await expectPublishDenied(gateway, `solar/v1/sites/OTHER-${runId}/gateways/${gatewayId}/devices/${deviceId}/telemetry`, telemetry, config.operationTimeoutMs, signal);
    checks.push('authenticated cross-gateway subscription and cross-site publication denied');

    const gracefulOffline = statusPayload(gatewayId, sessionId, 'offline', 2, desired2.configHash);
    messageIds.push(gracefulOffline.messageId);
    await publish(gateway, statusTopic, JSON.stringify(gracefulOffline), { qos: 1, retain: true }, config.operationTimeoutMs, signal);
    await poll(async () => (await databaseQuery(pool, `SELECT status FROM gateway_connection_events WHERE gateway_id=$1 AND message_id=$2`,
      [internalGatewayId, gracefulOffline.messageId], config.operationTimeoutMs, 'graceful offline status', signal)).rows[0]?.status,
    state => state === 'offline', 'graceful offline status', config.pollTimeoutMs, signal);
    await endClient(gateway, config.operationTimeoutMs);
    clients.delete(gateway);

    const lwt = statusPayload(gatewayId, sessionId, 'offline', 2, desired2.configHash);
    messageIds.push(lwt.messageId);
    gateway = await connectClient(config.mqttUrl, { ...mqttBase, clientId: gatewayId, username: confirmation.credential.username,
      password: confirmation.credential.password, will: { topic: statusTopic, payload: JSON.stringify(lwt), qos: 1, retain: true } }, config.operationTimeoutMs, signal);
    clients.add(gateway);
    await subscribe(gateway, [configTopic, ackTopic], config.operationTimeoutMs, signal);
    const reconnectedOnline = statusPayload(gatewayId, sessionId, 'online', 2, desired2.configHash);
    messageIds.push(reconnectedOnline.messageId);
    await publish(gateway, statusTopic, JSON.stringify(reconnectedOnline), { qos: 1, retain: true }, config.operationTimeoutMs, signal);
    await endClient(gateway, config.operationTimeoutMs, true);
    clients.delete(gateway);
    gateway = undefined;
    await poll(async () => (await databaseQuery(pool, `SELECT status FROM gateway_connection_events WHERE gateway_id=$1 AND message_id=$2`,
      [internalGatewayId, lwt.messageId], config.operationTimeoutMs, 'Last Will persistence', signal)).rows[0]?.status,
    state => state === 'offline', 'abnormal disconnect Last Will', config.pollTimeoutMs, signal);

    const finalWill = statusPayload(gatewayId, sessionId, 'offline', 2, desired2.configHash);
    messageIds.push(finalWill.messageId);
    gateway = await connectClient(config.mqttUrl, { ...mqttBase, clientId: gatewayId, username: confirmation.credential.username,
      password: confirmation.credential.password, will: { topic: statusTopic, payload: JSON.stringify(finalWill), qos: 1, retain: true } }, config.operationTimeoutMs, signal);
    clients.add(gateway);
    await subscribe(gateway, [configTopic, ackTopic], config.operationTimeoutMs, signal);
    const finalOnline = statusPayload(gatewayId, sessionId, 'online', 2, desired2.configHash);
    messageIds.push(finalOnline.messageId);
    await publish(gateway, statusTopic, JSON.stringify(finalOnline), { qos: 1, retain: true }, config.operationTimeoutMs, signal);
    await poll(async () => (await databaseQuery(pool, `SELECT status FROM gateway_connection_events WHERE gateway_id=$1 AND message_id=$2`,
      [internalGatewayId, finalOnline.messageId], config.operationTimeoutMs, 'reconnect persistence', signal)).rows[0]?.status,
    state => state === 'online', 'online state after reconnect', config.pollTimeoutMs, signal);
    checks.push('online, graceful offline, Last Will offline, and reconnect were persisted');

    await endClient(gateway, config.operationTimeoutMs);
    clients.delete(gateway);
    gateway = undefined;
    await clearRetainedControlState(config, mqttBase, gatewayId);
    retainedStateCleared = true;
    await containTestGateway(pool, config.siteId, gatewayId, config.operationTimeoutMs, internalGatewayId);
    cleanupComplete = true;
    checks.push('test-owned retained config/status cleared, credential revoked, and gateway disabled/retired');

    return { runId, gatewayId, deviceId, siteId: config.siteId, discoveryId, internalGatewayId,
      configVersions: versions, messageIds, checks, cleanup: 'credential-revoked-gateway-disabled-and-retired' };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    const cleanupErrors: unknown[] = [];
    for (const client of clients) {
      try {
        await endClient(client, config.operationTimeoutMs);
      } catch (error) {
        try {
          await endClient(client, config.operationTimeoutMs, true);
          cleanupErrors.push(error);
        }
        catch (forcedError) {
          client.stream.destroy();
          cleanupErrors.push(combineVerificationErrors(error, [forcedError]));
        }
      }
    }
    if (stateMayExist && !retainedStateCleared) {
      try {
        await clearRetainedControlState(config, mqttBase, gatewayId);
        retainedStateCleared = true;
      } catch (error) { cleanupErrors.push(error); }
    }
    if (stateMayExist && !cleanupComplete) {
      try {
        await containTestGateway(pool, config.siteId, gatewayId, config.operationTimeoutMs, internalGatewayId || undefined);
        cleanupComplete = true;
      } catch (error) { cleanupErrors.push(error); }
    }
    try { await withTimeout(pool.end(), 'database pool shutdown', config.operationTimeoutMs); }
    catch (error) { cleanupErrors.push(error); }
    if (cleanupErrors.length > 0) throw combineVerificationErrors(primaryError, cleanupErrors);
  }
}

export async function runGatewayOnboardingVerification(environment: NodeJS.ProcessEnv): Promise<GatewayOnboardingVerificationResult> {
  const config = loadGatewayOnboardingE2EConfig(environment);
  return await runWithinScenarioBudget(config.scenarioTimeoutMs,
    signal => executeGatewayOnboardingVerification(config, signal));
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runGatewayOnboardingVerification(process.env).then(result => {
    // The result contains correlation IDs and hashes only; credentials and tokens never enter it.
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch(error => {
    process.stderr.write(`Gateway onboarding verification failed: ${sanitizeVerificationError(error, process.env)}\n`);
    process.exitCode = 1;
  });
}
