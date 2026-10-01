import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import mqtt from "mqtt";
import { createHash, randomUUID } from "node:crypto";
import { decodeRegisterBatch, type RegisterFieldMapping } from "@solar/domain";
import { DatabaseService } from "../../database/database.service.js";
import { observeDuration, observeValue } from '../../common/observability/metrics.js';
import { IngestionDatabaseService } from './ingestion-database.service.js';
import { budget, IngestionLimiter, parseBoundedPayload } from './ingestion-limiter.js';

export interface LiveTelemetrySnapshot {
  siteId: string; siteName?: string | undefined; gatewayId?: string | undefined;
  gatewayName?: string | undefined; endpoint?: string | undefined; deviceId: string;
  deviceModel?: string | undefined; timestamp: string; sourceTime?: string | undefined;
  serverReceivedAt?: string | undefined; status: "online" | "degraded" | "offline";
  quality: "Good" | "Fair" | "Bad";
  metrics: { voltage: number | null; current: number | null; activePower: number | null;
    apparentPower: number | null; reactivePower: number | null; frequency: number | null;
    powerFactor: number | null; totalEnergy: number | null };
  rawRegisters?: Record<string, number> | undefined;
  decodedFields?: Array<{ semanticField: string; registerAddress: string; rawValue: number; scaledValue: number; unit: string }> | undefined;
}

type Mapping = RegisterFieldMapping & { id: string; byteOrder?: string };
export function isFresh(sourceTime: string | Date, now = Date.now()): boolean {
  const age = now - new Date(sourceTime).getTime();
  return age >= 0 && age <= 120_000;
}
export function telemetryTopicMatches(filter: string, topic: string): boolean {
  if (topic.split('/').some(part => ['response', 'config', 'ack'].includes(part.toLowerCase()))) return false;
  const parts = filter.split('/'); const actual = topic.split('/');
  return parts.every((part, index) => part === '#' && index === parts.length - 1 || part === '+' && actual[index] !== undefined || part === actual[index])
    && (parts.at(-1) === '#' || parts.length === actual.length);
}
function numberOrNull(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Telemetry metrics must be finite numbers');
  return value;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
  return JSON.stringify(value);
}

@Injectable()
export class MqttIngestionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttIngestionService.name);
  private client: mqtt.MqttClient | null = null;
  private subscribedTopics = new Set<string>();
  private subscriptionsReady = false;
  private connectionGeneration = 0;
  private restoreTimer: ReturnType<typeof setTimeout> | undefined;
  private restoringGeneration: number | undefined;
  private readonly limiter = new IngestionLimiter();
  private stopping = false;
  private acknowledgmentsEnabled = true;
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(IngestionDatabaseService) private readonly ingress: IngestionDatabaseService) {}
  async onModuleInit() {
    if (this.client) return;
    this.client = mqtt.connect(process.env.MQTT_URL || 'mqtt://localhost:1883', {
      connectTimeout: 5000, reconnectPeriod: 5000,
      ...(process.env.MQTT_USERNAME ? { username: process.env.MQTT_USERNAME } : {}),
      ...(process.env.MQTT_PASSWORD ? { password: process.env.MQTT_PASSWORD } : {}),
    });
    this.client.on('connect', () => { this.clearReadiness(); void this.restoreConnection(this.connectionGeneration); });
    this.client.on('close', () => this.clearReadiness());
    this.client.on('disconnect', () => this.clearReadiness());
    this.client.on('offline', () => this.clearReadiness());
    this.client.on('message', (topic, payload) => {
      if (this.stopping || !this.subscriptionsReady) { observeValue('ingress_rejected', 1); return; }
      const matching = [...this.subscribedTopics].filter(filter => telemetryTopicMatches(filter, topic));
      if (matching.length !== 1) { observeValue('ingress_rejected', 1); return; }
      this.limiter.submit(matching[0]!, payload.length, () => this.handleIncomingMessage(topic, payload));
    });
    this.client.on('error', () => { this.subscriptionsReady = false; this.scheduleRestore(this.connectionGeneration); this.logger.warn('MQTT connection failed; retrying'); });
  }
    isConnected(): boolean { return this.client?.connected === true; }
  isReady(): boolean { return this.isConnected() && this.subscriptionsReady; }
  private clearReadiness() {
    this.connectionGeneration++;
    this.subscriptionsReady = false;
    this.subscribedTopics.clear();
    clearTimeout(this.restoreTimer);
    this.restoreTimer = undefined;
  }
  async onModuleDestroy() {
    this.stopping = true;
    this.clearReadiness();
    const drained = await this.limiter.shutdown(budget('INGEST_SHUTDOWN_TIMEOUT_MS', 10000));
    this.acknowledgmentsEnabled = false;
    if (!drained) this.logger.warn('Ingestion shutdown deadline reached; pending work receives no application ACK');
    const client = this.client;
    this.client = null;
    client?.end(true);
  }
  private scheduleRestore(generation: number) {
    if (!this.client?.connected || generation !== this.connectionGeneration || this.restoreTimer) return;
    this.restoreTimer = setTimeout(() => {
      this.restoreTimer = undefined;
      void this.restoreConnection(generation);
    }, 5000);
    this.restoreTimer.unref();
  }
  private async restoreConnection(generation: number) {
    if (!this.client?.connected || generation !== this.connectionGeneration || this.restoringGeneration === generation) return;
    this.restoringGeneration = generation;
    try {
      await this.refreshSubscriptions();
      if (generation !== this.connectionGeneration || !this.client?.connected) return;
      const gateways = await this.ingress.query("SELECT name, polling_interval_seconds, alert_rules FROM gateways WHERE protocol = 'mqtt' ORDER BY id LIMIT 1024");
      for (const gateway of gateways.rows) {
        if (generation !== this.connectionGeneration || !this.client?.connected) return;
        await this.publishHardwareConfig(gateway.name, { pollingIntervalSeconds: gateway.polling_interval_seconds, alertRules: gateway.alert_rules });
      }
    } catch (error) {
      this.logger.warn('Gateway restoration failed; retrying in 5 seconds');
      this.scheduleRestore(generation);
    } finally {
      if (this.restoringGeneration === generation) this.restoringGeneration = undefined;
    }
  }
  async refreshSubscriptions() {
    const client = this.client;
    const generation = this.connectionGeneration;
    this.subscriptionsReady = false;
    if (!client?.connected) return;
    try {
      const result = await this.ingress.query("SELECT endpoint FROM gateways WHERE protocol = 'mqtt' ORDER BY id LIMIT 1025");
      if (result.rows.length > 1024 || result.rows.some(row => typeof row.endpoint !== 'string' || Buffer.byteLength(row.endpoint) > 1024)) throw new Error('Gateway subscription resource limit');
      if (generation !== this.connectionGeneration || !client.connected) return;
      const topics = new Set<string>(result.rows.map(row => row.endpoint));
      for (const topic of this.subscribedTopics) if (!topics.has(topic)) client.unsubscribe(topic);
      for (const topic of topics) if (!this.subscribedTopics.has(topic)) {
        await new Promise<void>((resolve, reject) => client.subscribe(topic, { qos: 1 }, error => error ? reject(error) : resolve()));
        if (generation !== this.connectionGeneration || !client.connected) return;
      }
      this.subscribedTopics = topics;
      this.subscriptionsReady = true;
    } catch (error) {
      this.scheduleRestore(generation);
      throw error;
    }
  }
async handleIncomingMessage(topic: string, messageStr: string | Buffer) {
    const started = performance.now();
    if (topic.split('/').some(part => ['response', 'config', 'ack'].includes(part.toLowerCase()))) return;
    const data = parseBoundedPayload(messageStr) as Record<string, any>;
    if (!data || typeof data !== 'object' || ['acknowledged', 'ack', 'config'].includes(data.status ?? data.type)) return;
    const deviceHint = data.deviceId ?? data.device ?? data.serialNumber;
    // A gateway can contain many devices, so a device identity is mandatory.
    if (typeof deviceHint !== 'string' || !deviceHint.trim()) { observeValue('ingress_rejected', 1); return; }
    const result = await this.ingress.query(
      `SELECT d.id AS "deviceId", d.site_id AS "siteId", g.id AS "gatewayId", g.name AS "gatewayName", g.endpoint
       FROM devices d JOIN gateways g ON g.id = d.gateway_id AND g.site_id = d.site_id
       JOIN sites s ON s.id = d.site_id
       WHERE (d.id::text = $1 OR d.serial_number = $1) AND g.protocol = 'mqtt' AND s.status <> 'archived'`, [deviceHint]);
    const candidates = result.rows.filter(row => telemetryTopicMatches(row.endpoint, topic)
      && (!data.gatewayId || data.gatewayId === row.gatewayId)
      && (!data.gateway || data.gateway === row.gatewayName || data.gateway === row.gatewayId)
      && (!data.siteId || data.siteId === row.siteId));
    if (candidates.length !== 1) { observeValue('ingress_rejected', 1); return; }
    const entity = candidates[0]!;
    if (!data.timestamp && !data.sourceTime) throw new Error('Source timestamp is required for replay-safe telemetry');
    const sourceTime = new Date(data.sourceTime ?? data.timestamp); const receivedTime = new Date();
    if (!Number.isFinite(sourceTime.getTime()) || sourceTime.getTime() > receivedTime.getTime() + 30_000) throw new Error('Invalid source timestamp');
    const ingestionId = `${entity.deviceId}:${createHash('sha256').update(String(data.ingestionId ?? canonical(data))).digest('hex')}`;
    const rawRegisters = data.registers ?? data.rawRegisters;
    const mappings = rawRegisters ? await this.getDeviceMappings(entity.deviceId, sourceTime) : [];
    if (rawRegisters && !mappings.length) throw new Error('No effective register mapping is configured');
    if (rawRegisters && Object.values(rawRegisters).some(value => typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 65535)) throw new Error('Raw registers must be unsigned 16-bit words');
    const decoded = mappings.reduce<ReturnType<typeof decodeRegisterBatch>>((fields, mapping) => {
      const ordered = mapping.byteOrder === 'little_endian' || mapping.byteOrder === 'little-endian'
        ? Object.fromEntries(Object.entries(rawRegisters).map(([key, value]) => { const word = Number(value); return [key, ((word & 255) << 8) | (word >>> 8)]; }))
        : rawRegisters;
      return { ...fields, ...decodeRegisterBatch(ordered, [mapping]) };
    }, {});
    const m = data.metrics ?? data;
    const field = (semantic: string, ...values: unknown[]) => numberOrNull(rawRegisters ? decoded[semantic]?.scaledValue : values.find(value => value !== null && value !== undefined));
    const metrics: LiveTelemetrySnapshot['metrics'] = {
      voltage: field('voltage', m.voltage, m.voltage_v), current: field('current', m.current, m.current_a),
      activePower: field('active_power', m.activePower, m.active_power, m.activePowerKw === undefined ? undefined : numberOrNull(m.activePowerKw)! * 1000),
      apparentPower: field('apparent_power', m.apparentPower, m.apparent_power), reactivePower: field('reactive_power', m.reactivePower, m.reactive_power),
      frequency: field('frequency', m.frequency, m.frequency_hz), powerFactor: field('power_factor', m.powerFactor, m.power_factor),
      totalEnergy: field('total_energy', m.totalEnergy, m.totalEnergyKwh, m.total_energy_kwh),
    };
    if (Object.values(metrics).every(value => value === null) && !Object.keys(decoded).length) throw new Error('No measured fields');
    const quality = isFresh(sourceTime, receivedTime.getTime()) ? 'complete' : 'partial';
    const client = await this.ingress.pool.connect(); let accepted = false;
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO telemetry_raw (id, device_id, site_id, source_time, received_time, raw_payload, normalized_value, unit, quality, ingestion_id, semantic_field,
         voltage_v, current_a, active_power_w, apparent_power_va, reactive_power_var, frequency_hz, power_factor, total_energy_kwh, mapping_version_id, mapping_version_ids)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'total_energy',$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::uuid[])
         ON CONFLICT (ingestion_id, source_time) DO NOTHING RETURNING id`,
        [randomUUID(), entity.deviceId, entity.siteId, sourceTime, receivedTime, JSON.stringify(data), metrics.totalEnergy, 'kWh', quality, ingestionId,
          metrics.voltage, metrics.current, metrics.activePower, metrics.apparentPower, metrics.reactivePower, metrics.frequency, metrics.powerFactor, metrics.totalEnergy,
          mappings.find(mapping => mapping.semanticField === 'total_energy')?.id ?? null, mappings.map(mapping => mapping.id)]);
      accepted = inserted.rows.length > 0;
      if (accepted) {
        await client.query("UPDATE gateways SET last_seen_at = GREATEST(last_seen_at, $2), status = CASE WHEN $2 >= now() - interval '120 seconds' THEN 'online' ELSE status END WHERE id = $1", [entity.gatewayId, sourceTime]);
        if (metrics.totalEnergy !== null) {
          const bucket = new Date(Math.floor(sourceTime.getTime() / 900_000) * 900_000);
          await client.query(
            `INSERT INTO telemetry_aggregate (id,site_id,device_id,semantic_field,bucket,bucket_start,value,sample_count,quality,last_source_time)
             VALUES ($1,$2,$3,'total_energy','15m',$4,$5,1,$6,$7)
             ON CONFLICT (device_id,semantic_field,bucket,bucket_start) DO UPDATE SET
             value = CASE WHEN EXCLUDED.last_source_time >= COALESCE(telemetry_aggregate.last_source_time, '-infinity') THEN EXCLUDED.value ELSE telemetry_aggregate.value END,
             quality = CASE WHEN EXCLUDED.last_source_time >= COALESCE(telemetry_aggregate.last_source_time, '-infinity') THEN EXCLUDED.quality ELSE telemetry_aggregate.quality END,
             last_source_time = GREATEST(telemetry_aggregate.last_source_time, EXCLUDED.last_source_time), sample_count = telemetry_aggregate.sample_count + 1`,
            [randomUUID(), entity.siteId, entity.deviceId, bucket, metrics.totalEnergy, quality, sourceTime]);
        }
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    // Both a committed insert and a durable duplicate are safe to acknowledge. No ACK is emitted before COMMIT.
    observeValue(accepted ? 'ingress_accepted' : 'ingress_duplicate', 1);
    if (this.acknowledgmentsEnabled && this.limiter.withinDrainDeadline() && this.client?.connected) this.client.publish(entity.endpoint.replace(/\/#$/, '') + '/response', JSON.stringify({
      status: 'acknowledged', gateway: entity.gatewayName, deviceId: entity.deviceId, ingestionId: data.ingestionId ?? ingestionId,
      sourceTime: sourceTime.toISOString(), serverReceivedAt: receivedTime.toISOString(), duplicate: !accepted,
    }), { qos: 1 }, error => {
      if (!error) observeDuration('ingress_ack_latency', performance.now() - started, {});
    });
  }
  async publishHardwareConfig(gatewayName: string, configData: Record<string, unknown>) {
    if (!this.client?.connected) return false;
    const result = await this.ingress.query("SELECT endpoint FROM gateways WHERE name = $1 AND protocol = 'mqtt'", [gatewayName]);
    if (result.rows.length !== 1) return false;
    const topic = result.rows[0]!.endpoint.replace(/\/#$/, '') + '/config';
    await new Promise<void>((resolve, reject) => this.client!.publish(topic, JSON.stringify({ ...configData, gateway: gatewayName, timestamp: new Date().toISOString() }), { qos: 1, retain: true }, error => error ? reject(error) : resolve()));
    return true;
  }
  async getDeviceMappings(deviceId: string, sourceTime = new Date()): Promise<Mapping[]> {
    const result = await this.ingress.query(
      `SELECT id, semantic_field AS "semanticField", register_address AS "registerAddress", register_count AS "registerCount", word_order AS "wordOrder", byte_order AS "byteOrder", data_type AS "dataType", scale, unit
       FROM register_mapping_versions WHERE device_id = $1 AND effective_from <= $2 AND (effective_to IS NULL OR effective_to > $2) ORDER BY register_address`, [deviceId, sourceTime]);
    return result.rows.map(row => ({ ...row, scale: Number(row.scale) })) as Mapping[];
  }
  clearMappingCache(_deviceId: string) { /* mappings are selected at source time, never cached across versions */ }
  async getLatestTelemetry(siteId: string): Promise<LiveTelemetrySnapshot | null> {
    const result = await this.db.query(
      `SELECT tr.*, s.name AS "siteName", d.model AS "deviceModel", g.id AS "gatewayId", g.name AS "gatewayName", g.endpoint
       FROM telemetry_raw tr JOIN sites s ON s.id = tr.site_id JOIN devices d ON d.id = tr.device_id JOIN gateways g ON g.id = d.gateway_id
       WHERE tr.site_id = $1 ORDER BY tr.source_time DESC, tr.received_time DESC LIMIT 1`, [siteId]);
    const row = result.rows[0]; if (!row) return null;
    const numeric = (value: unknown) => value === null || value === undefined ? null : Number(value);
    return {
      siteId, siteName: row.siteName, deviceId: row.device_id, deviceModel: row.deviceModel, gatewayId: row.gatewayId, gatewayName: row.gatewayName, endpoint: row.endpoint,
      timestamp: new Date(row.source_time).toISOString(), sourceTime: new Date(row.source_time).toISOString(), serverReceivedAt: new Date(row.received_time).toISOString(),
      status: isFresh(row.source_time) ? 'online' : 'offline', quality: row.quality === 'complete' ? 'Good' : 'Fair',
      metrics: { voltage: numeric(row.voltage_v), current: numeric(row.current_a), activePower: numeric(row.active_power_w), apparentPower: numeric(row.apparent_power_va),
        reactivePower: numeric(row.reactive_power_var), frequency: numeric(row.frequency_hz), powerFactor: numeric(row.power_factor), totalEnergy: numeric(row.total_energy_kwh) },
      rawRegisters: row.raw_payload?.registers ?? row.raw_payload?.rawRegisters,
    };
  }
}


