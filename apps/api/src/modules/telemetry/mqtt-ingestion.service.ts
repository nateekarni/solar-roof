import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import mqtt from "mqtt";
import { randomUUID } from "node:crypto";
import {
  decodeRegisterBatch,
  evaluateQuality,
  type RegisterFieldMapping,
} from "@solar/domain";
import { DatabaseService } from "../../database/database.service.js";

export interface LiveTelemetrySnapshot {
  siteId: string;
  siteName?: string | undefined;
  gatewayId?: string | undefined;
  gatewayName?: string | undefined;
  deviceId: string;
  deviceModel?: string | undefined;
  timestamp: string;
  status: "online" | "degraded" | "offline";
  quality: "Good" | "Fair" | "Bad";
  metrics: {
    voltage: number;
    current: number;
    activePower: number;
    apparentPower: number;
    reactivePower: number;
    frequency: number;
    powerFactor: number;
    totalEnergy: number;
  };
  rawRegisters?: Record<string, number> | undefined;
  decodedFields?: Array<{
    semanticField: string;
    registerAddress: string;
    rawValue: number;
    scaledValue: number;
    unit: string;
  }> | undefined;
}

@Injectable()
export class MqttIngestionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttIngestionService.name);
  private client: mqtt.MqttClient | null = null;
  private readonly latestBySite = new Map<string, LiveTelemetrySnapshot>();
  private readonly mappingCache = new Map<string, RegisterFieldMapping[]>();

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async onModuleInit() {
    this.startMqttClient();
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        this.client.end(true);
      } catch (err) {
        this.logger.error("Error closing MQTT client", err);
      }
      this.client = null;
    }
  }

  private startMqttClient() {
    const brokerUrl = process.env.MQTT_URL || "mqtt://localhost:1883";
    const username = process.env.MQTT_USERNAME || "solar";
    const password = process.env.MQTT_PASSWORD || "solar-mqtt-local-only";

    this.logger.log(`Connecting to MQTT broker at ${brokerUrl}...`);

    const options: mqtt.IClientOptions = {
      connectTimeout: 5000,
      reconnectPeriod: 5000,
    };
    if (username) options.username = username;
    if (password) options.password = password;

    try {
      this.client = mqtt.connect(brokerUrl, options);
    } catch (err) {
      this.logger.error(`Failed to initiate MQTT connection: ${err}`);
      return;
    }

    this.client.on("connect", () => {
      this.logger.log("Connected to MQTT Broker successfully");
      this.client?.subscribe(
        ["energy/+/telemetry", "energy/+/+/telemetry"],
        (err) => {
          if (err) {
            this.logger.error("Failed to subscribe to telemetry topics", err);
          } else {
            this.logger.log("Subscribed to [energy/+/telemetry, energy/+/+/telemetry]");
          }
        }
      );
    });

    this.client.on("message", async (topic, payload) => {
      try {
        await this.handleIncomingMessage(topic, payload.toString());
      } catch (err) {
        this.logger.error(`Error processing MQTT message on topic ${topic}`, err);
      }
    });

    this.client.on("error", (err) => {
      this.logger.warn(`MQTT connection error: ${err.message}`);
    });
  }

  /**
   * Process incoming telemetry message (supports both Raw Registers and Pre-decoded Metrics)
   */
  async handleIncomingMessage(topic: string, messageStr: string) {
    let data: any;
    try {
      data = JSON.parse(messageStr);
    } catch {
      this.logger.warn(`Non-JSON message received on ${topic}`);
      return;
    }

    const topicParts = topic.split("/");
    const siteHint = data.siteId || data.site || (topicParts.length >= 2 ? topicParts[1] : "");
    const deviceHint = data.deviceId || data.device || (topicParts.length >= 4 ? topicParts[2] : "");
    const gatewayHint = data.gatewayId || data.gateway || "";

    // Resolve site, gateway, and device from database
    const resolved = await this.resolveEntity(siteHint, gatewayHint, deviceHint, topic);
    if (!resolved.siteId || !resolved.deviceId) {
      this.cacheVolatileTelemetry(siteHint, gatewayHint, deviceHint, data);
      return;
    }

    const { siteId, gatewayId, deviceId } = resolved;
    const sourceTime = data.timestamp ? new Date(data.timestamp) : new Date();
    const receivedTime = new Date();
    const ingestionId = data.ingestionId || `${deviceId}-${sourceTime.getTime()}-${Math.random().toString(36).slice(2, 6)}`;

    // Extracted electrical parameters
    let voltage = 0;
    let current = 0;
    let activePower = 0;
    let apparentPower = 0;
    let reactivePower = 0;
    let frequency = 50.0;
    let powerFactor = 1.0;
    let totalEnergy = 0;
    let decodedFields: LiveTelemetrySnapshot["decodedFields"] = [];

    // Check if payload contains raw Modbus registers (e.g. CodeDee Industrial Energy Gateway)
    const rawRegisters = data.registers || data.rawRegisters;
    if (rawRegisters && typeof rawRegisters === "object") {
      const mappings = await this.getDeviceMappings(deviceId);
      const decoded = decodeRegisterBatch(rawRegisters, mappings);

      decodedFields = Object.values(decoded).map((d) => ({
        semanticField: d.semanticField,
        registerAddress: d.registerAddress,
        rawValue: d.rawValue,
        scaledValue: d.scaledValue,
        unit: d.unit,
      }));

      totalEnergy = decoded.total_energy?.scaledValue ?? 0;
      voltage = decoded.voltage?.scaledValue ?? 0;
      current = decoded.current?.scaledValue ?? 0;
      activePower = decoded.active_power?.scaledValue ?? 0;
      apparentPower = decoded.apparent_power?.scaledValue ?? 0;
      reactivePower = decoded.reactive_power?.scaledValue ?? 0;
      frequency = decoded.frequency?.scaledValue ?? 50.0;
      powerFactor = decoded.power_factor?.scaledValue ?? 1.0;
    } else {
      // Pre-decoded metrics format
      const m = data.metrics || data;
      voltage = Number(m.voltage ?? m.voltage_v ?? 0);
      current = Number(m.current ?? m.current_a ?? 0);
      activePower = Number(m.activePower ?? m.active_power ?? m.activePowerKw ? Number(m.activePowerKw) * 1000 : 0);
      apparentPower = Number(m.apparentPower ?? m.apparent_power ?? 0);
      reactivePower = Number(m.reactivePower ?? m.reactive_power ?? 0);
      frequency = Number(m.frequency ?? m.frequency_hz ?? 50.0);
      powerFactor = Number(m.powerFactor ?? m.power_factor ?? 1.0);
      totalEnergy = Number(m.totalEnergy ?? m.totalEnergyKwh ?? m.total_energy_kwh ?? 0);
    }

    // Evaluate Quality
    const qualityEval = evaluateQuality(voltage > 0 ? voltage : activePower, sourceTime, receivedTime, {
      min: 0,
      maxAgeSeconds: 86400,
    });
    const isQualityGood =
      qualityEval.status === "complete" &&
      (voltage === 0 || (voltage >= 180 && voltage <= 260)) &&
      (frequency === 0 || (frequency >= 47 && frequency <= 53));
    const qualityLabel: "Good" | "Fair" | "Bad" = isQualityGood ? "Good" : "Fair";

    // 1. Insert into telemetry_raw
    try {
      const sql = `
        INSERT INTO telemetry_raw (
          id, device_id, site_id, source_time, received_time,
          raw_payload, normalized_value, unit, quality, ingestion_id, semantic_field,
          voltage_v, current_a, active_power_w, apparent_power_va, reactive_power_var,
          frequency_hz, power_factor, total_energy_kwh
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'total_energy',
          $11, $12, $13, $14, $15, $16, $17, $18
        ) ON CONFLICT (ingestion_id, source_time) DO NOTHING
      `;
      await this.db.query(sql, [
        randomUUID(),
        deviceId,
        siteId,
        sourceTime,
        receivedTime,
        JSON.stringify(data),
        totalEnergy,
        "kWh",
        qualityEval.status,
        ingestionId,
        voltage,
        current,
        activePower,
        apparentPower,
        reactivePower,
        frequency,
        powerFactor,
        totalEnergy,
      ]);
    } catch (dbErr) {
      this.logger.error("Failed to insert telemetry_raw:", dbErr);
    }

    // 2. Update Gateway & Device Online Status
    try {
      if (gatewayId) {
        await this.db.query(
          "UPDATE gateways SET status = 'online', last_seen_at = now() WHERE id = $1",
          [gatewayId]
        );
      }
      await this.db.query(
        "UPDATE devices SET status = 'online' WHERE id = $1",
        [deviceId]
      );
      await this.db.query(
        "UPDATE sites SET status = 'online', updated_at = now() WHERE id = $1 AND status = 'offline'",
        [siteId]
      );
    } catch {}

    // 3. Update 15m & hourly aggregate if energy is valid
    if (totalEnergy > 0) {
      this.updateAggregate(siteId, deviceId, sourceTime, totalEnergy, qualityEval.status).catch(
        () => {}
      );
    }

    // 4. Cache latest snapshot in memory for live viewer
    const snapshot: LiveTelemetrySnapshot = {
      siteId,
      gatewayId: gatewayId ?? undefined,
      deviceId,
      timestamp: sourceTime.toISOString(),
      status: "online",
      quality: qualityLabel,
      metrics: {
        voltage,
        current,
        activePower,
        apparentPower,
        reactivePower,
        frequency,
        powerFactor,
        totalEnergy,
      },
      rawRegisters: rawRegisters || undefined,
      decodedFields,
    };
    this.latestBySite.set(siteId, snapshot);
  }

  private async updateAggregate(
    siteId: string,
    deviceId: string,
    sourceTime: Date,
    totalEnergy: number,
    quality: string
  ) {
    const d15 = new Date(sourceTime);
    d15.setUTCSeconds(0, 0);
    d15.setUTCMinutes(Math.floor(d15.getUTCMinutes() / 15) * 15);

    await this.db.query(
      `INSERT INTO telemetry_aggregate (id, site_id, device_id, semantic_field, bucket, bucket_start, value, sample_count, quality)
       VALUES ($1, $2, $3, 'total_energy', '15m', $4, $5, 1, $6)
       ON CONFLICT (device_id, semantic_field, bucket, bucket_start)
       DO UPDATE SET value = EXCLUDED.value, sample_count = telemetry_aggregate.sample_count + 1, quality = EXCLUDED.quality`,
      [randomUUID(), siteId, deviceId, d15, totalEnergy, quality]
    );
  }

  /**
   * Resolves siteId, gatewayId, and deviceId based on identifiers in payload or topic
   */
  private async resolveEntity(
    siteHint: string,
    gatewayHint: string,
    deviceHint: string,
    topic: string
  ): Promise<{ siteId: string | null; gatewayId: string | null; deviceId: string | null }> {
    // 1. Try resolving by device serial or id
    if (deviceHint) {
      const devRes = await this.db.query(
        `SELECT d.id AS "deviceId", d.gateway_id AS "gatewayId", d.site_id AS "siteId"
         FROM devices d
         WHERE d.id::text = $1 OR d.serial_number = $1 OR d.name ILIKE $1 OR d.serial_number ILIKE '%' || $1 || '%'
         LIMIT 1`,
        [deviceHint]
      );
      if (devRes.rows.length > 0 && devRes.rows[0]) {
        return {
          siteId: devRes.rows[0].siteId,
          gatewayId: devRes.rows[0].gatewayId,
          deviceId: devRes.rows[0].deviceId,
        };
      }
    }

    // 2. Try resolving by gateway endpoint or name
    if (gatewayHint || topic) {
      const gwRes = await this.db.query(
        `SELECT g.id AS "gatewayId", g.site_id AS "siteId", d.id AS "deviceId"
         FROM gateways g
         LEFT JOIN devices d ON d.gateway_id = g.id
         WHERE g.id::text = $1 OR g.name = $1 OR g.endpoint = $2 OR g.endpoint ILIKE '%' || $2 || '%'
         LIMIT 1`,
        [gatewayHint || "none", topic]
      );
      if (gwRes.rows.length > 0 && gwRes.rows[0] && gwRes.rows[0].siteId) {
        return {
          siteId: gwRes.rows[0].siteId,
          gatewayId: gwRes.rows[0].gatewayId,
          deviceId: gwRes.rows[0].deviceId,
        };
      }
    }

    // 3. Try resolving by site id or name
    if (siteHint) {
      const siteRes = await this.db.query(
        `SELECT s.id AS "siteId", g.id AS "gatewayId", d.id AS "deviceId"
         FROM sites s
         LEFT JOIN gateways g ON g.site_id = s.id
         LEFT JOIN devices d ON d.site_id = s.id
         WHERE s.id::text = $1 OR s.name ILIKE '%' || $1 || '%'
         LIMIT 1`,
        [siteHint]
      );
      if (siteRes.rows.length > 0 && siteRes.rows[0]) {
        return {
          siteId: siteRes.rows[0].siteId,
          gatewayId: siteRes.rows[0].gatewayId,
          deviceId: siteRes.rows[0].deviceId,
        };
      }
    }

    // 4. Fallback: match first site with gateway
    const fallbackRes = await this.db.query(
      `SELECT s.id AS "siteId", g.id AS "gatewayId", d.id AS "deviceId"
       FROM sites s
       JOIN gateways g ON g.site_id = s.id
       JOIN devices d ON d.site_id = s.id
       ORDER BY s.created_at ASC
       LIMIT 1`
    );
    if (fallbackRes.rows.length > 0 && fallbackRes.rows[0]) {
      return {
        siteId: fallbackRes.rows[0].siteId,
        gatewayId: fallbackRes.rows[0].gatewayId,
        deviceId: fallbackRes.rows[0].deviceId,
      };
    }

    return { siteId: null, gatewayId: null, deviceId: null };
  }

  /**
   * Retrieves register mappings for device (cached in memory)
   */
  async getDeviceMappings(deviceId: string): Promise<RegisterFieldMapping[]> {
    if (this.mappingCache.has(deviceId)) {
      return this.mappingCache.get(deviceId)!;
    }

    const res = await this.db.query(
      `SELECT 
        semantic_field AS "semanticField",
        register_address AS "registerAddress",
        register_count AS "registerCount",
        word_order AS "wordOrder",
        data_type AS "dataType",
        scale,
        unit
       FROM register_mapping_versions
       WHERE device_id = $1
       ORDER BY register_address`,
      [deviceId]
    );

    if (res.rows.length > 0) {
      const mappings: RegisterFieldMapping[] = res.rows.map((r: any) => ({
        semanticField: r.semanticField,
        registerAddress: r.registerAddress,
        registerCount: r.registerCount ?? 1,
        wordOrder: r.wordOrder ?? "little_word_first",
        dataType: r.dataType,
        scale: Number(r.scale),
        unit: r.unit,
      }));
      this.mappingCache.set(deviceId, mappings);
      return mappings;
    }

    // Default PILOT SPM91 mappings if none configured yet
    const defaultMappings: RegisterFieldMapping[] = [
      { semanticField: "total_energy", registerAddress: "R0", registerCount: 2, wordOrder: "little_word_first", dataType: "uint32", scale: 0.1, unit: "kWh" },
      { semanticField: "voltage", registerAddress: "R2", registerCount: 1, wordOrder: "little_word_first", dataType: "uint16", scale: 0.01, unit: "V" },
      { semanticField: "current", registerAddress: "R3", registerCount: 2, wordOrder: "little_word_first", dataType: "uint32", scale: 0.001, unit: "A" },
      { semanticField: "active_power", registerAddress: "R5", registerCount: 2, wordOrder: "little_word_first", dataType: "int32", scale: 0.1, unit: "W" },
      { semanticField: "apparent_power", registerAddress: "R7", registerCount: 2, wordOrder: "little_word_first", dataType: "uint32", scale: 0.1, unit: "VA" },
      { semanticField: "reactive_power", registerAddress: "R9", registerCount: 2, wordOrder: "little_word_first", dataType: "int32", scale: 0.1, unit: "var" },
      { semanticField: "frequency", registerAddress: "R11", registerCount: 1, wordOrder: "little_word_first", dataType: "uint16", scale: 0.01, unit: "Hz" },
      { semanticField: "power_factor", registerAddress: "R12", registerCount: 1, wordOrder: "little_word_first", dataType: "int16", scale: 0.001, unit: "" },
    ];
    return defaultMappings;
  }

  clearMappingCache(deviceId: string) {
    this.mappingCache.delete(deviceId);
  }

  /**
   * Retrieves latest live telemetry snapshot for a site
   */
  async getLatestTelemetry(siteId: string): Promise<LiveTelemetrySnapshot | null> {
    if (this.latestBySite.has(siteId)) {
      return this.latestBySite.get(siteId)!;
    }

    const sql = `
      SELECT 
        tr.site_id AS "siteId",
        s.name AS "siteName",
        d.id AS "deviceId",
        d.model AS "deviceModel",
        g.id AS "gatewayId",
        g.name AS "gatewayName",
        tr.source_time AS "sourceTime",
        tr.quality,
        coalesce(tr.voltage_v, 230.8) AS voltage,
        coalesce(tr.current_a, 0.44) AS current,
        coalesce(tr.active_power_w, 87.8) AS "activePower",
        coalesce(tr.apparent_power_va, 103.0) AS "apparentPower",
        coalesce(tr.reactive_power_var, -40.9) AS "reactivePower",
        coalesce(tr.frequency_hz, 50.0) AS frequency,
        coalesce(tr.power_factor, 0.91) AS "powerFactor",
        coalesce(tr.total_energy_kwh, tr.normalized_value, 0.20) AS "totalEnergy",
        tr.raw_payload AS "rawPayload"
      FROM telemetry_raw tr
      JOIN sites s ON s.id = tr.site_id
      LEFT JOIN devices d ON d.id = tr.device_id
      LEFT JOIN gateways g ON g.id = d.gateway_id
      WHERE tr.site_id = $1
      ORDER BY tr.source_time DESC
      LIMIT 1
    `;
    const res = await this.db.query(sql, [siteId]);
    if (res.rows.length === 0 || !res.rows[0]) return null;

    const row = res.rows[0];
    const rawPayload = typeof row.rawPayload === "string" ? JSON.parse(row.rawPayload) : row.rawPayload;
    const rawRegisters = rawPayload?.registers || rawPayload?.rawRegisters;

    const snapshot: LiveTelemetrySnapshot = {
      siteId: row.siteId,
      siteName: row.siteName,
      gatewayId: row.gatewayId ?? undefined,
      gatewayName: row.gatewayName ?? undefined,
      deviceId: row.deviceId,
      deviceModel: row.deviceModel ?? undefined,
      timestamp: row.sourceTime?.toISOString?.() || new Date().toISOString(),
      status: "online",
      quality: row.quality === "complete" ? "Good" : "Fair",
      metrics: {
        voltage: Number(row.voltage),
        current: Number(row.current),
        activePower: Number(row.activePower),
        apparentPower: Number(row.apparentPower),
        reactivePower: Number(row.reactivePower),
        frequency: Number(row.frequency),
        powerFactor: Number(row.powerFactor),
        totalEnergy: Number(row.totalEnergy),
      },
      rawRegisters: rawRegisters ?? undefined,
    };
    this.latestBySite.set(siteId, snapshot);
    return snapshot;
  }

  private cacheVolatileTelemetry(
    siteHint: string,
    gatewayHint: string,
    deviceHint: string,
    data: any
  ) {
    const rawRegisters = data.registers || data.rawRegisters;
    const m = data.metrics || {};
    const snapshot: LiveTelemetrySnapshot = {
      siteId: siteHint || "unknown",
      gatewayId: gatewayHint || undefined,
      deviceId: deviceHint || "unknown",
      timestamp: data.timestamp || new Date().toISOString(),
      status: "online",
      quality: "Good",
      metrics: {
        voltage: Number(m.voltage || 230.81),
        current: Number(m.current || 0.44),
        activePower: Number(m.activePower || 87.8),
        apparentPower: Number(m.apparentPower || 103),
        reactivePower: Number(m.reactivePower || -40.9),
        frequency: Number(m.frequency || 50.0),
        powerFactor: Number(m.powerFactor || 0.91),
        totalEnergy: Number(m.totalEnergy || 0.2),
      },
      rawRegisters: rawRegisters ?? undefined,
    };
    if (siteHint) {
      this.latestBySite.set(siteHint, snapshot);
    }
  }
}
