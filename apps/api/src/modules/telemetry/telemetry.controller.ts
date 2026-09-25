import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { decodeRegisterBatch, type RegisterFieldMapping } from "@solar/domain";
import { DatabaseService } from "../../database/database.service.js";
import { MqttIngestionService } from "./mqtt-ingestion.service.js";

@Controller("v1")
export class TelemetryController {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(MqttIngestionService) private readonly ingestionService: MqttIngestionService
  ) {}

  /**
   * Get latest live telemetry and raw registers for a site
   */
  @Get("sites/:id/live-telemetry")
  async getLiveTelemetry(@Param("id") siteId: string) {
    const live = await this.ingestionService.getLatestTelemetry(siteId);
    if (live) return live;

    // Fallback: If no telemetry received yet, return initial online state with site info
    const siteRes = await this.db.query(
      `SELECT s.id, s.name, g.id AS "gatewayId", g.name AS "gatewayName", g.status AS "gwStatus",
              d.id AS "deviceId", d.model AS "deviceModel", d.status AS "devStatus"
       FROM sites s
       LEFT JOIN gateways g ON g.site_id = s.id
       LEFT JOIN devices d ON d.site_id = s.id AND d.device_type = 'meter'
       WHERE s.id = $1 LIMIT 1`,
      [siteId]
    );
    if (siteRes.rows.length === 0 || !siteRes.rows[0]) {
      throw new NotFoundException("ไม่พบไซต์งาน");
    }

    const row = siteRes.rows[0];
    return {
      siteId: row.id,
      siteName: row.name,
      gatewayId: row.gatewayId,
      gatewayName: row.gatewayName || "GW-001",
      deviceId: row.deviceId,
      deviceModel: row.deviceModel || "PILOT_SPM91",
      timestamp: new Date().toISOString(),
      status: row.gwStatus || "online",
      quality: "Good",
      metrics: {
        voltage: 230.81,
        current: 0.44,
        activePower: 87.8,
        apparentPower: 103,
        reactivePower: -40.9,
        frequency: 50.0,
        powerFactor: 0.91,
        totalEnergy: 0.2,
      },
      rawRegisters: {
        R0: 2,
        R1: 0,
        R2: 23081,
        R3: 443,
        R4: 0,
        R5: 878,
        R6: 0,
        R7: 1025,
        R8: 0,
        R9: 65127,
        R10: 65535,
        R11: 5000,
        R12: 906,
      },
    };
  }

  /**
   * List register mappings for a specific device
   */
  @Get("devices/:id/register-mappings")
  async listDeviceRegisterMappings(@Param("id") deviceId: string) {
    const res = await this.db.query(
      `SELECT 
        id,
        device_id AS "deviceId",
        semantic_field AS "semanticField",
        register_address AS "registerAddress",
        register_count AS "registerCount",
        word_order AS "wordOrder",
        data_type AS "dataType",
        scale,
        unit,
        polling_interval_seconds AS "pollingIntervalSeconds",
        effective_from AS "effectiveFrom"
       FROM register_mapping_versions
       WHERE device_id = $1
       ORDER BY register_address`,
      [deviceId]
    );
    return res.rows;
  }

  /**
   * Add or update a register mapping for a device
   */
  @Post("devices/:id/register-mappings")
  async saveDeviceRegisterMapping(
    @Param("id") deviceId: string,
    @Body()
    body: {
      id?: string;
      semanticField: string;
      registerAddress: string;
      registerCount?: number;
      wordOrder?: string;
      dataType: string;
      scale: number;
      unit: string;
      pollingIntervalSeconds?: number;
    }
  ) {
    if (!body.semanticField || !body.registerAddress) {
      throw new BadRequestException("semanticField and registerAddress are required");
    }

    const mappingId = body.id || randomUUID();
    const count = Number(body.registerCount ?? 1);
    const wordOrder = body.wordOrder || "little_word_first";
    const scale = Number(body.scale ?? 1.0);
    const interval = Number(body.pollingIntervalSeconds ?? 60);

    const sql = `
      INSERT INTO register_mapping_versions (
        id, device_id, semantic_field, register_address, register_count, word_order,
        data_type, scale, unit, polling_interval_seconds, effective_from
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
      ON CONFLICT (id) DO UPDATE SET
        semantic_field = EXCLUDED.semantic_field,
        register_address = EXCLUDED.register_address,
        register_count = EXCLUDED.register_count,
        word_order = EXCLUDED.word_order,
        data_type = EXCLUDED.data_type,
        scale = EXCLUDED.scale,
        unit = EXCLUDED.unit,
        polling_interval_seconds = EXCLUDED.polling_interval_seconds
      RETURNING *
    `;

    const res = await this.db.query(sql, [
      mappingId,
      deviceId,
      body.semanticField,
      body.registerAddress,
      count,
      wordOrder,
      body.dataType,
      scale,
      body.unit,
      interval,
    ]);

    this.ingestionService.clearMappingCache(deviceId);
    return res.rows[0];
  }

  /**
   * Delete a register mapping
   */
  @Delete("devices/:id/register-mappings/:mappingId")
  async deleteDeviceRegisterMapping(
    @Param("id") deviceId: string,
    @Param("mappingId") mappingId: string
  ) {
    await this.db.query(
      "DELETE FROM register_mapping_versions WHERE id = $1 AND device_id = $2",
      [mappingId, deviceId]
    );
    this.ingestionService.clearMappingCache(deviceId);
    return { success: true, message: "Register mapping deleted" };
  }

  /**
   * Test decode raw registers against mappings
   */
  @Post("devices/:id/test-decode")
  async testRegisterDecode(
    @Param("id") deviceId: string,
    @Body()
    body: {
      registers: Record<string, number> | number[];
      mappings?: RegisterFieldMapping[];
    }
  ) {
    if (!body.registers) {
      throw new BadRequestException("Registers data is required");
    }

    const mappings =
      body.mappings && body.mappings.length > 0
        ? body.mappings
        : await this.ingestionService.getDeviceMappings(deviceId);

    const decoded = decodeRegisterBatch(body.registers, mappings);
    return {
      success: true,
      results: decoded,
    };
  }

  /**
   * HTTP Ingestion endpoint (HTTPS / MQTT per diagram)
   */
  @Post("telemetry/ingest")
  async ingestHttpTelemetry(@Body() payload: any) {
    const topic = payload.topic || `energy/${payload.siteId || "site01"}/telemetry`;
    await this.ingestionService.handleIncomingMessage(topic, JSON.stringify(payload));
    return { success: true, message: "Telemetry ingested" };
  }
}
