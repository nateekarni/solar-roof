import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import mqtt from "mqtt";
import { decryptBrokerPassword } from "./broker-settings.js";
import { createHash, randomUUID } from "node:crypto";
import { decodeRegisterBatch, type RegisterFieldMapping } from "@solar/domain";
import { DatabaseService } from "../../database/database.service.js";
import { observeDuration, observeValue } from '../../common/observability/metrics.js';
import { IngestionDatabaseService } from './ingestion-database.service.js';
import { PayloadIngestion, gatewayPrefix } from "./payload-ingestion.js";
import { budget, IngestionLimiter, parseBoundedPayload } from './ingestion-limiter.js';

export interface CanonicalLiveField {deviceId:string;externalDeviceId?:string|null;deviceName:string;tag:string;value:number;unit:string;rawValue:number;rawUnit:string;polledAt:string;receivedAt:string;quality:string;communication:string;profileId:string;profileVersion:string;pollGroup:string;ageSeconds:number;stale:boolean}
export interface LiveTelemetrySnapshot {
  canonicalFields?: CanonicalLiveField[];
  siteId: string; siteName?: string | undefined; gatewayId?: string | undefined;
  gatewayName?: string | undefined; endpoint?: string | undefined; deviceId: string;
  externalSiteId?: string | null; externalGatewayId?: string | null; externalDeviceId?: string | null;
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
  if (['response','config','ack','dataAcept','status'].includes(topic.split('/').at(-1)!)) return false;
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
  private readonly enabled = process.env.MQTT_ENABLED !== 'false';
  private readonly defaultBrokerEnabled = process.env.MQTT_DEFAULT_BROKER_ENABLED !== 'false';
  private remoteDiscovered = false;
  private remote = new Map<string,{client:mqtt.MqttClient;topics:Set<string>;desired:string[];ready:boolean;settings:string}>();
  private remoteTimer: ReturnType<typeof setInterval> | undefined;
  private refreshRemotePending: Promise<void> | undefined;
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
    if (!this.enabled || this.client || this.remoteTimer) return;
    void this.refreshRemote().catch(()=>this.logger.warn("Remote broker settings refresh failed"));
    this.remoteTimer=setInterval(()=>{void this.refreshRemote().catch(()=>this.logger.warn("Remote broker settings refresh failed"));},5000);
    this.remoteTimer.unref();
    if (!this.defaultBrokerEnabled) return;
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
  getConnectionHealth() {
    if (!this.enabled) return { status: 'disabled', configuredBrokers: 0, readyBrokers: 0 };
    const configuredBrokers = (this.defaultBrokerEnabled ? 1 : 0) + this.remote.size;
    const readyBrokers = this.stopping ? 0 : (this.isReady() ? 1 : 0) + [...this.remote.values()].filter(session => session.client.connected && session.ready).length;
    const status = !this.remoteDiscovered || this.stopping ? 'not_ready'
      : configuredBrokers === 0 ? 'not_configured'
      : readyBrokers === configuredBrokers ? 'ready' : readyBrokers > 0 ? 'degraded' : 'not_ready';
    return { status, configuredBrokers, readyBrokers };
  }
  private clearReadiness() {
    this.connectionGeneration++;
    this.subscriptionsReady = false;
    this.subscribedTopics.clear();
    clearTimeout(this.restoreTimer);
    this.restoreTimer = undefined;
  }
  async onModuleDestroy() {
    this.stopping = true;
    clearInterval(this.remoteTimer);
    this.clearReadiness();
    const drained = await this.limiter.shutdown(budget('INGEST_SHUTDOWN_TIMEOUT_MS', 10000));
    this.acknowledgmentsEnabled = false;
    if (!drained) this.logger.warn('Ingestion shutdown deadline reached; pending work receives no application ACK');
    const client = this.client;
    this.client = null;
    client?.end(true);
    for(const session of this.remote.values()) session.client.end(true);
    this.remote.clear();
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
      const gateways = await this.ingress.query("SELECT name, polling_interval_seconds, alert_rules FROM gateways WHERE protocol = 'mqtt' AND alert_rules <> '{}'::jsonb ORDER BY id LIMIT 1024");
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
  private async refreshRemote() {
    if (!this.enabled || this.stopping) return;
    if(this.refreshRemotePending)return this.refreshRemotePending;
    this.refreshRemotePending=this.syncRemote().finally(()=>{this.refreshRemotePending=undefined;});
    return this.refreshRemotePending;
  }
  private async syncRemote() {
    if(this.stopping)return;
    const result=await this.ingress.query(`SELECT b.id,b.url,b.username,b.password_cipher,array_agg(g.endpoint) AS topics FROM mqtt_brokers b JOIN gateways g ON g.mqtt_broker_id=b.id WHERE g.protocol='mqtt' GROUP BY b.id ORDER BY b.id LIMIT 33`);
    if(this.stopping)return;
    if(result.rows.length>32)throw Error('At most 32 active MQTT brokers are supported');
    const ids=new Set(result.rows.map(b=>b.id));
    for(const [id,session] of this.remote)if(!ids.has(id)){session.client.end(true);this.remote.delete(id);}
    for(const broker of result.rows){
      let session=this.remote.get(broker.id);
      const settings=JSON.stringify([broker.url,broker.username,broker.password_cipher]);
      if(session && session.settings!==settings){session.ready=false;session.client.end(true);this.remote.delete(broker.id);session=undefined;}
      if(!session){
        const client=mqtt.connect(broker.url,{connectTimeout:5000,reconnectPeriod:5000,username:broker.username||undefined,...(broker.password_cipher?{password:decryptBrokerPassword(broker.password_cipher)}:{})});
        session={client,topics:new Set(),desired:broker.topics,ready:false,settings};this.remote.set(broker.id,session);
        const current=session;
        client.on('connect',()=>{void (async()=>{
          await this.subscribeRemote(current,current.desired);
          if(!current.ready || this.stopping)return;
          const gateways=await this.ingress.query("SELECT name, polling_interval_seconds, alert_rules FROM gateways WHERE mqtt_broker_id=$1 AND protocol='mqtt' AND alert_rules <> '{}'::jsonb ORDER BY id LIMIT 1024",[broker.id]);
          for(const gateway of gateways.rows){
            if(!current.ready || this.stopping)return;
            await this.publishHardwareConfig(gateway.name,{pollingIntervalSeconds:gateway.polling_interval_seconds,alertRules:gateway.alert_rules});
          }
        })().catch(()=>{current.ready=false;client.reconnect();});});
        for(const event of ['close','offline','disconnect'] as const)client.on(event,()=>{current.ready=false;current.topics.clear();});
        client.on('error',()=>{current.ready=false;});
        client.on('message',(topic,payload)=>{
          if(this.stopping||!current.ready)return;
          const matching=[...current.topics].filter(filter=>telemetryTopicMatches(filter,topic));
          if(matching.length!==1)return;
          this.limiter.submit(broker.id+':'+matching[0],payload.length,()=>this.handleIncomingMessage(topic,payload,client,broker.id));
        });
      }
      session.desired=broker.topics;
      if(session.client.connected)await this.subscribeRemote(session,broker.topics);
    }
    this.remoteDiscovered = true;
  }
  private async subscribeRemote(session:{client:mqtt.MqttClient;topics:Set<string>;desired:string[];ready:boolean},filters:string[]){
    if(session.ready && session.topics.size===new Set(filters).size && filters.every(f=>session.topics.has(f)))return;
    session.ready=false;
    if(filters.length>1024||filters.some(f=>typeof f!=='string'||Buffer.byteLength(f)>1024))throw Error('Gateway subscription resource limit');
    const wanted=new Set(filters);
    for(const topic of session.topics)if(!wanted.has(topic))session.client.unsubscribe(topic);
    for(const topic of wanted)if(!session.topics.has(topic))await new Promise<void>((resolve,reject)=>session.client.subscribe(topic,{qos:1},(err,granted)=>err||granted?.some(g=>g.qos===128)?reject(err||Error('Subscription refused')):resolve()));
    if(!session.client.connected||this.stopping||session.desired!==filters)return;
    session.topics=wanted;session.ready=true;
  }
  async refreshSubscriptions() {
    if (!this.enabled || this.stopping) return 0;
    await this.refreshRemote().catch(()=>this.logger.warn("Remote broker settings refresh failed"));
    const client = this.client;
    const generation = this.connectionGeneration;
    this.subscriptionsReady = false;
    if (!client?.connected) return;
    try {
      const result = await this.ingress.query("SELECT endpoint FROM gateways WHERE protocol = 'mqtt' AND mqtt_broker_id IS NULL ORDER BY id LIMIT 1025");
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
async handleIncomingMessage(topic: string, messageStr: string | Buffer, sourceClient = this.client, brokerId: string | null = null) {
    const started = performance.now();
    if (['response','config','ack','dataAcept','status'].includes(topic.split('/').at(-1)!)) return;
    let data: Record<string, any>;
    try { data = parseBoundedPayload(messageStr) as Record<string, any>; }
    catch (error) { if(topic.startsWith('solar/v1/')) await new PayloadIngestion(this.ingress).accept(topic,undefined,brokerId); observeValue('ingress_rejected',1); return; }
    if (topic.startsWith('solar/v1/')) {
      let accepted=0;
      await new PayloadIngestion(this.ingress).acceptMany(topic,data,brokerId,ack=>{
        accepted++;
        if (this.acknowledgmentsEnabled && this.limiter.withinDrainDeadline() && sourceClient?.connected) sourceClient.publish(gatewayPrefix(ack.siteId,ack.gatewayId)+'/dataAcept',JSON.stringify(ack),{qos:1});
      });
      observeValue(accepted?'ingress_accepted':'ingress_rejected',accepted||1);return;
    }
    if (!data || typeof data !== 'object' || ['acknowledged', 'ack', 'config'].includes(data.status ?? data.type)) return;
    const deviceHint = data.deviceId ?? data.device ?? data.serialNumber;
    // A gateway can contain many devices, so a device identity is mandatory.
    if (typeof deviceHint !== 'string' || !deviceHint.trim()) { observeValue('ingress_rejected', 1); return; }
    const result = await this.ingress.query(
      `SELECT d.id AS "deviceId", d.site_id AS "siteId", g.id AS "gatewayId", g.name AS "gatewayName", g.endpoint
       FROM devices d JOIN gateways g ON g.id = d.gateway_id AND g.site_id = d.site_id
       JOIN sites s ON s.id = d.site_id
       WHERE (d.id::text = $1 OR d.serial_number = $1) AND g.protocol = 'mqtt' AND s.status <> 'archived' AND g.mqtt_broker_id IS NOT DISTINCT FROM $2::uuid`, [deviceHint,brokerId]);
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
      // Migration 020's energy_raw_dirty trigger durably upserts affected Bangkok days
      // in this INSERT transaction. A dirty-day failure rolls back telemetry and prevents ACK.
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
    const result = await this.ingress.query(`SELECT g.mqtt_broker_id AS "brokerId",g.endpoint,g.external_gateway_id AS "externalGatewayId",s.external_site_id AS "externalSiteId" FROM gateways g JOIN sites s ON s.id=g.site_id WHERE g.name = $1 AND g.protocol = 'mqtt'`, [gatewayName]);
    if (result.rows.length !== 1) return false;
    const gateway=result.rows[0]!;
    const targetClient=gateway.brokerId?this.remote.get(gateway.brokerId)?.client:this.client;
    if(!targetClient?.connected)return false;
    const standard=gateway.endpoint.startsWith('solar/v1/');
    const topic = standard && gateway.externalSiteId && gateway.externalGatewayId ? gatewayPrefix(gateway.externalSiteId,gateway.externalGatewayId)+'/config' : gateway.endpoint.replace(/\/#$/, '') + '/config';
    await new Promise<void>((resolve, reject) => targetClient.publish(topic, JSON.stringify({ ...configData, gateway: gatewayName, ...(standard?{siteId:gateway.externalSiteId,gatewayId:gateway.externalGatewayId}:{}), timestamp: new Date().toISOString() }), { qos: 1, retain: true }, error => error ? reject(error) : resolve()));
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
      `SELECT tr.*, s.name AS "siteName",s.external_site_id AS "externalSiteId",g.external_gateway_id AS "externalGatewayId",d.external_device_id AS "externalDeviceId", d.model AS "deviceModel", g.id AS "gatewayId", g.name AS "gatewayName", g.endpoint
       FROM telemetry_raw tr JOIN sites s ON s.id = tr.site_id JOIN devices d ON d.id = tr.device_id JOIN gateways g ON g.id = d.gateway_id
       WHERE tr.site_id = $1 AND d.device_type<>'logger' AND (EXISTS(SELECT 1 FROM billing_meters b WHERE b.site_id=tr.site_id AND b.device_id=tr.device_id AND b.active) OR NOT EXISTS(SELECT 1 FROM billing_meters b WHERE b.site_id=tr.site_id AND b.active)) ORDER BY tr.source_time DESC, tr.received_time DESC LIMIT 1`, [siteId]);
    let row = result.rows[0];
    const fields=await this.db.query(`SELECT DISTINCT ON (ps.device_id,ps.tag) ps.device_id AS "deviceId",d.external_device_id AS "externalDeviceId",d.name AS "deviceName",ps.tag,ps.value,ps.unit,ps.raw_value AS "rawValue",ps.raw_unit AS "rawUnit",ps.polled_at AS "polledAt",ps.received_at AS "receivedAt",ps.quality,ps.communication,p.profile_id AS "profileId",p.version AS "profileVersion",ps.poll_group AS "pollGroup",EXISTS(SELECT 1 FROM billing_meters b WHERE b.device_id=ps.device_id AND b.active) AS billing,(SELECT f->>'role' FROM jsonb_array_elements(p.config->'fields') f WHERE f->>'tag'=ps.tag) AS role
      FROM payload_samples ps JOIN devices d ON d.id=ps.device_id JOIN payload_profile_revisions p ON p.id=ps.profile_revision_id WHERE ps.site_id=$1 ORDER BY ps.device_id,ps.tag,ps.polled_at DESC,ps.received_at DESC,ps.id DESC`,[siteId]);
    if(!row) {
      if(!fields.rows.length)return null;
      const newest=[...fields.rows].sort((a,b)=>new Date(b.polledAt).getTime()-new Date(a.polledAt).getTime())[0]!;
      const context=(await this.db.query(`SELECT s.name AS "siteName",s.external_site_id AS "externalSiteId",g.external_gateway_id AS "externalGatewayId",g.id AS "gatewayId",g.name AS "gatewayName",g.endpoint FROM sites s JOIN gateways g ON g.site_id=s.id WHERE s.id=$1`,[siteId])).rows[0]??{};
      row={...context,externalDeviceId:newest.externalDeviceId,device_id:newest.deviceId,source_time:newest.polledAt,received_time:newest.receivedAt,quality:'partial'};
    }
    const canonicalFields=fields.rows.map(f=>{const {billing:_billing,role:_role,...publicField}=f;const ageSeconds=Math.max(0,(Date.now()-new Date(f.polledAt).getTime())/1000);return {...publicField,value:Number(f.value),rawValue:Number(f.rawValue),polledAt:new Date(f.polledAt).toISOString(),receivedAt:new Date(f.receivedAt).toISOString(),ageSeconds,stale:ageSeconds>120};}) as CanonicalLiveField[];
    const healthy=(f:Record<string,any>)=>['good','complete','ok'].includes(String(f.quality).toLowerCase())&&['online','ok','connected','success'].includes(String(f.communication).toLowerCase());
    const billingValue=(tag:string,fallback:unknown)=>{const f=fields.rows.find(f=>f.billing&&(tag==='power.active.total'?f.role==='active-power'&&f.unit==='W':f.tag===tag));
      if(!f)return fallback;
      if(!healthy(f) || !isFresh(f.polledAt) || tag==='energy.active.import.total'&&f.role!=='billing-import')return null;
      return Number(f.value);
    };
    const billingFields=fields.rows.filter(f=>f.billing);
    const poor=billingFields.some(f=>!healthy(f));
    const numeric = (value: unknown) => value === null || value === undefined ? null : Number(value);
    return {
      canonicalFields, siteId, externalSiteId:row.externalSiteId,externalGatewayId:row.externalGatewayId,externalDeviceId:row.externalDeviceId, siteName: row.siteName, deviceId: row.device_id, deviceModel: row.deviceModel, gatewayId: row.gatewayId, gatewayName: row.gatewayName, endpoint: row.endpoint,
      timestamp: new Date(row.source_time).toISOString(), sourceTime: new Date(row.source_time).toISOString(), serverReceivedAt: new Date(row.received_time).toISOString(),
      status: poor ? 'degraded' : isFresh(row.source_time) ? 'online' : 'offline', quality: poor ? 'Bad' : row.quality === 'complete' ? 'Good' : 'Fair',
      metrics: { voltage: numeric(billingValue("electrical.voltage.l1_n",row.voltage_v)), current: numeric(billingValue("electrical.current.l1",row.current_a)), activePower: numeric(billingValue("power.active.total",row.active_power_w)), apparentPower: numeric(billingValue("power.apparent.total",row.apparent_power_va)),
        reactivePower: numeric(billingValue("power.reactive.total",row.reactive_power_var)), frequency: numeric(billingValue("electrical.frequency",row.frequency_hz)), powerFactor: numeric(billingValue("power.factor.total",row.power_factor)), totalEnergy: numeric(billingValue("energy.active.import.total",row.total_energy_kwh)) },
      rawRegisters: row.raw_payload?.registers ?? row.raw_payload?.rawRegisters,
    };
  }
}
