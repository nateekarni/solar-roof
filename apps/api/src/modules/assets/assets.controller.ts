import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";

import mqtt from "mqtt";
import { DatabaseService } from "../../database/database.service.js";
import { MqttIngestionService } from "../telemetry/mqtt-ingestion.service.js";

@Controller("v1")
export class AssetsController {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(MqttIngestionService) private readonly mqttService: MqttIngestionService
  ) {}

  @Get("schools")
  async listSchools(@Req() req: { user?: { role?: string; schoolId?: string | null } }) {
    const res = await this.db.query(
      "SELECT id, name, code, region, status FROM schools WHERE ($1::uuid IS NULL OR id = $1) AND $2 ORDER BY name",
      [req.user?.schoolId ?? null, req.user?.role !== "school_user" || Boolean(req.user?.schoolId)]
    );
    return res.rows;
  }

  @Post("schools")
  async createSchool(@Body() body: { name?: string; region?: string }) {
    const name = body.name?.trim();
    const region = body.region?.trim() || "ภาคกลาง";
    if (!name) {
      throw new BadRequestException("School name is required");
    }

    const countRes = await this.db.query("SELECT count(*)::int AS count FROM schools");
    const count = countRes.rows[0]?.count ?? 0;
    const code = `SCH-${String(count + 1).padStart(3, "0")}`;
    const id = randomUUID();

    const sql = `
      INSERT INTO schools (id, name, code, region, status)
      VALUES ($1, $2, $3, $4, 'active')
      RETURNING id, name, code, region, status
    `;
    const res = await this.db.query(sql, [id, name, code, region]);
    return res.rows[0];
  }

  @Post("sites/test-connection")
  async testConnection(
    @Body() body: { protocol?: string; endpoint?: string }
  ): Promise<{ status: "online" | "offline"; protocol: string; endpoint: string; latencyMs: number | null; message: string }> {
    const protocol = (body.protocol || "mqtt").toLowerCase().trim();
    const endpoint = body.endpoint?.trim() || "";

    if (!endpoint) {
      return {
        status: "offline",
        protocol,
        endpoint,
        latencyMs: null,
        message: "กรุณาระบุ Endpoint หรือ Topic สำหรับการทดสอบสัญญาณ",
      };
    }

    if (protocol !== "mqtt") throw new BadRequestException("Only MQTT is supported");
    // Default: MQTT Protocol Test
    return new Promise((resolve) => {
      const brokerUrl =
        process.env.MQTT_URL || "mqtt://localhost:1883";

      const start = Date.now();
      const mqttOptions: mqtt.IClientOptions = {
        connectTimeout: 3000,
        reconnectPeriod: 0,
      };

      if (process.env.MQTT_USERNAME) {
        mqttOptions.username = process.env.MQTT_USERNAME;
      }
      if (process.env.MQTT_PASSWORD) {
        mqttOptions.password = process.env.MQTT_PASSWORD;
      }

      let client: mqtt.MqttClient;
      try {
        client = mqtt.connect(brokerUrl, mqttOptions);
      } catch (err: any) {
        return resolve({
          status: "offline",
          protocol,
          endpoint,
          latencyMs: null,
          message: `ไม่สามารถเริ่มการเชื่อมต่อ MQTT ได้: ${err.message}`,
        });
      }

      let settled = false;
      const finish = (res: { status: "online" | "offline"; latencyMs: number | null; message: string }) => {
        if (settled) return;
        settled = true;
        try {
          client.end(true);
        } catch {}
        resolve({ ...res, protocol, endpoint });
      };

      client.on("connect", () => {
        const latencyMs = Date.now() - start;
        finish({
          status: "online",
          latencyMs,
          message: `เชื่อมต่อ MQTT Broker สำเร็จ (ยังไม่ได้ยืนยัน Gateway) Topic: ${endpoint} [Latency: ${latencyMs}ms]`,
        });
      });

      client.on("error", (err) => {
        finish({
          status: "offline",
          latencyMs: null,
          message: `การเชื่อมต่อ MQTT ล้มเหลว: ${err.message}`,
        });
      });

      setTimeout(() => {
        finish({
          status: "offline",
          latencyMs: null,
          message: "การเชื่อมต่อ MQTT Broker หมดเวลา (Timeout 3s)",
        });
      }, 3200);
    });
  }

  @Get("sites")
  async listSites(@Req() req: { user?: { role?: string; schoolId?: string | null } }) {
    const sql = `
      SELECT 
        si.id,
        si.school_id AS "schoolId",
        si.name,
        coalesce(round(si.capacity_mwp::numeric, 4), 0) AS "capacityMwp",
        CASE WHEN si.status = 'archived' THEN 'archived' WHEN g.last_seen_at >= now() - interval '120 seconds' THEN 'online' ELSE 'offline' END AS status,
        s.name AS "schoolName",
        g.id AS "gatewayId",
        g.name AS "gatewayName",
        CASE WHEN g.last_seen_at >= now() - interval '120 seconds' THEN 'online' ELSE 'offline' END AS "gatewayStatus",
        g.last_seen_at AS "lastSeenAt",
        coalesce(g.polling_interval_seconds, 10) AS "pollingIntervalSeconds",
        g.alert_rules AS "alertRules",
        coalesce(bc_stats.invoice_count, 0) AS "invoiceCount",
        coalesce(bc_stats.paid_count, 0) AS "paidInvoiceCount",
        coalesce(round(bc_stats.total_amount::numeric, 2), 0) AS "totalAmount"
      FROM sites si
      JOIN schools s ON s.id = si.school_id
      LEFT JOIN gateways g ON g.site_id = si.id
      LEFT JOIN (
        SELECT 
          site_id,
          count(*)::int AS invoice_count,
          count(*) FILTER (WHERE status = 'paid')::int AS paid_count,
          coalesce(sum(amount), 0)::numeric AS total_amount
        FROM billing_cycles
        GROUP BY site_id
      ) bc_stats ON bc_stats.site_id = si.id
      WHERE ($1::uuid IS NULL OR si.school_id = $1) AND $2
      ORDER BY si.name
    `;
    const res = await this.db.query(sql, [req.user?.schoolId ?? null, req.user?.role !== "school_user" || Boolean(req.user?.schoolId)]);
    return res.rows;
  }

  @Get("sites/:id")
  async getSite(@Param("id") id: string) {
    const sql = `
      SELECT 
        si.id,
        si.school_id AS "schoolId",
        si.name,
        coalesce(round(si.capacity_mwp::numeric, 4), 0) AS "capacityMwp",
        si.latitude,
        si.longitude,
        CASE WHEN si.status = 'archived' THEN 'archived' WHEN g.last_seen_at >= now() - interval '120 seconds' THEN 'online' ELSE 'offline' END AS status,
        s.name AS "schoolName",
        g.id AS "gatewayId",
        g.name AS "gatewayName",
        coalesce(g.protocol, 'mqtt') AS protocol,
        coalesce(g.endpoint, '') AS endpoint,
        coalesce(g.polling_interval_seconds, 10) AS "pollingIntervalSeconds",
        g.alert_rules AS "alertRules",
        g.last_seen_at AS "lastSeenAt",
        d.id AS "deviceId",
        d.model AS "deviceModel",
        coalesce(d.serial_number, '') AS "deviceSerial"
      FROM sites si
      JOIN schools s ON s.id = si.school_id
      LEFT JOIN gateways g ON g.site_id = si.id
      LEFT JOIN devices d ON d.site_id = si.id AND d.device_type = 'meter'
      WHERE si.id = $1
      LIMIT 1
    `;
    const res = await this.db.query(sql, [id]);
    if (res.rows.length === 0) {
      throw new NotFoundException(`ไม่พบข้อมูลไซต์งานรหัส ${id}`);
    }
    return res.rows[0];
  }

  @Post("sites")
  async createSite(
    @Body()
    body: {
      name?: string;
      schoolId?: string;
      schoolName?: string;
      capacityMwp?: number;
      latitude?: number;
      longitude?: number;
      gatewayName?: string;
      protocol?: string;
      endpoint?: string;
      deviceModel?: string;
      deviceSerial?: string;
      meterPresetId?: string;
      pollingIntervalSeconds?: number;
      interval?: number;
      alertRules?: Record<string, unknown>;
      status?: string;
    }
  ) {
    const name = body.name?.trim();
    let schoolId = body.schoolId?.trim();
    const schoolName = body.schoolName?.trim();
    if (body.protocol && body.protocol !== "mqtt") throw new BadRequestException("Only MQTT is supported");
    const capacityMwp = Number(body.capacityMwp ?? 0.5);
    const lat = body.latitude ? Number(body.latitude) : 13.7563;
    const lng = body.longitude ? Number(body.longitude) : 100.5018;

    if (!name || (!schoolId && !schoolName)) {
      throw new BadRequestException("กรุณาระบุชื่อไซต์งานและโรงเรียนสังกัด");
    }

    const siteId = randomUUID();
    const devSerial = body.deviceSerial?.trim();
    if (!devSerial) throw new BadRequestException("Meter serial number is required");

    // Verify serial number uniqueness before starting transaction
    const dupDev = await this.db.query("SELECT id FROM devices WHERE serial_number = $1", [devSerial]);
    if (dupDev.rows.length > 0) {
      throw new BadRequestException(
        `หมายเลขซีเรียลมิเตอร์ "${devSerial}" มีอยู่ในระบบแล้ว กรุณาระบุหมายเลขซีเรียลอื่น`
      );
    }

    const initialStatus = "offline";

    const countRes = await this.db.query("SELECT count(*)::int AS count FROM gateways");
    const gwCount = countRes.rows[0]?.count ?? 0;
    const gwId = randomUUID();
    const gwName = body.gatewayName?.trim() || `GW-${String(gwCount + 1).padStart(3, "0")}`;
    const protocol = "mqtt";
    const endpoint = gatewayTopic(gwName, body.endpoint);
    const intervalSec = validatedInterval(body.pollingIntervalSeconds ?? body.interval ?? 10);
    validateAlertRules(body.alertRules);
    const alertRulesJson = body.alertRules
      ? JSON.stringify(body.alertRules)
      : '{"voltageMin": 200, "voltageMax": 250, "frequencyMin": 48, "frequencyMax": 52, "offlineTimeoutSec": 120}';

    const deviceId = randomUUID();
    const devModel = body.deviceModel?.trim() || "PM5350";
    const devName = `Meter - ${devModel}`;

    const client = await this.db.pool.connect();
    try {
      await client.query("BEGIN");

      if (!schoolId) {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [schoolName]);
        const existing = await client.query("SELECT id FROM schools WHERE name = $1 ORDER BY id FOR UPDATE", [schoolName]);
        if (existing.rows.length > 1) throw new BadRequestException("Multiple schools share that name; reconcile before creating a site");
        schoolId = existing.rows[0]?.id;
        if (!schoolId) {
          schoolId = randomUUID();
          await client.query("INSERT INTO schools (id,name,code,region,status) VALUES ($1,$2,$3,'ภาคกลาง','active')", [schoolId,schoolName,`SCH-${schoolId}`]);
        }
      }
      await client.query("SELECT id FROM schools WHERE id = $1 FOR UPDATE", [schoolId]);
      const linked = await client.query("SELECT id FROM sites WHERE school_id = $1", [schoolId]);
      if (linked.rows.length) throw new BadRequestException("โรงเรียนนี้มีไซต์งานแล้ว (หนึ่งโรงเรียนต่อหนึ่งไซต์งาน)");
      // 1. Create Site
      const siteSql = `
        INSERT INTO sites (id, school_id, name, capacity_mwp, latitude, longitude, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, school_id AS "schoolId", name, capacity_mwp AS "capacityMwp", status
      `;
      const res = await client.query(siteSql, [siteId, schoolId, name, capacityMwp, lat, lng, initialStatus]);

      // 2. Create Gateway
      await client.query(
        `INSERT INTO gateways (id, site_id, name, protocol, endpoint, status, polling_interval_seconds, alert_rules, last_seen_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NULL)`,
        [gwId, siteId, gwName, protocol, endpoint, initialStatus, intervalSec, alertRulesJson]
      );

      // 3. Create Device
      await client.query(
        `INSERT INTO devices (id, gateway_id, site_id, name, device_type, model, serial_number, slave_id, status)
         VALUES ($1, $2, $3, $4, 'meter', $5, $6, 1, $7)`,
        [deviceId, gwId, siteId, devName, devModel, devSerial, initialStatus]
      );

      // 4. Assign Billing Meter
      await client.query(
        `INSERT INTO billing_meters (id, site_id, device_id, semantic_field, active)
         VALUES ($1, $2, $3, 'total_energy', true)
         ON CONFLICT (site_id, device_id, semantic_field) DO NOTHING`,
        [randomUUID(), siteId, deviceId]
      );

      // 5. Clone Preset Registers if selected
      if (body.meterPresetId) {
        try {
          const presetRes = await client.query<{ registers: any[] }>(
            "SELECT registers FROM meter_presets WHERE id = $1",
            [body.meterPresetId]
          );
          const registers = presetRes.rows[0]?.registers;
          if (!Array.isArray(registers)) throw new BadRequestException("Meter preset not found");
          if (Array.isArray(registers)) {
            for (const reg of registers) {
              await client.query(
                `INSERT INTO register_mapping_versions 
                 (id, device_id, semantic_field, register_address, register_count, word_order, data_type, signed, byte_order, scale, unit, polling_interval_seconds, effective_from)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 60, now())`,
                [
                  randomUUID(),
                  deviceId,
                  reg.semantic_field || reg.semanticField || "total_energy",
                  String(reg.register_address ?? reg.registerAddress ?? "3000"),
                  Number(reg.register_count ?? reg.registerCount ?? 1),
                  reg.word_order || reg.wordOrder || "little_word_first",
                  reg.data_type || reg.dataType || "uint32",
                  Boolean(reg.signed ?? false),
                  reg.byte_order || reg.byteOrder || "big_endian",
                  Number(reg.scale ?? 1),
                  reg.unit || "kWh",
                ]
              );
            }
          }
        } catch (presetErr) {
          throw presetErr;
        }
      }

      await client.query("COMMIT");
      await this.mqttService.refreshSubscriptions().catch(() => {});
      const delivered = await this.mqttService.publishHardwareConfig(gwName, { pollingIntervalSeconds: intervalSec, alertRules: JSON.parse(alertRulesJson) }).catch(() => false);
      return { ...res.rows[0], configDelivery: delivered ? "published" : "pending" };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  @Patch("sites/:id")
  async updateSite(
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      schoolId?: string;
      schoolName?: string;
      deviceId?: string;
      pollingIntervalSeconds?: number;
      alertRules?: Record<string, unknown>;
      capacityMwp?: number;
      latitude?: number;
      longitude?: number;
      status?: string;
      gatewayName?: string;
      protocol?: string;
      endpoint?: string;
      deviceModel?: string;
      deviceSerial?: string;
    }
  ) {
    if (body.protocol && body.protocol !== "mqtt") throw new BadRequestException("Only MQTT is supported");
    if (body.pollingIntervalSeconds !== undefined) validatedInterval(body.pollingIntervalSeconds);
    validateAlertRules(body.alertRules);
    const client = await this.db.pool.connect();
    try {
      await client.query("BEGIN");

      const siteCheck = await client.query("SELECT id FROM sites WHERE id = $1 FOR UPDATE", [id]);
      if (siteCheck.rows.length === 0) {
        throw new NotFoundException("ไม่พบไซต์งานที่ต้องการแก้ไข");
      }

      if (body.schoolName !== undefined) {
        if (!body.schoolName.trim()) throw new BadRequestException("School name is required");
        await client.query("UPDATE schools SET name = $1, updated_at = now() WHERE id = (SELECT school_id FROM sites WHERE id = $2)", [body.schoolName.trim(), id]);
      }
      const gateway = await client.query("SELECT id,name,endpoint FROM gateways WHERE site_id = $1 FOR UPDATE", [id]);
      const gw = gateway.rows[0];
      if (gw && (body.gatewayName !== undefined || body.endpoint !== undefined)) {
        body.gatewayName = body.gatewayName?.trim() || gw.name;
        body.endpoint = gatewayTopic(body.gatewayName!, body.endpoint);
      }
      // Check unique serial number if provided
      if (body.deviceSerial?.trim()) {
        const dupDev = await client.query(
          "SELECT id FROM devices WHERE serial_number = $1 AND site_id != $2",
          [body.deviceSerial.trim(), id]
        );
        if (dupDev.rows.length > 0) {
          throw new BadRequestException(
            `หมายเลขซีเรียลมิเตอร์ "${body.deviceSerial}" ซ้ำกับไซต์งานอื่นในระบบ`
          );
        }
      }

      // 1. Update site details
      const updates: string[] = [];
      const values: unknown[] = [];
      let pIdx = 1;

      if (body.name !== undefined) {
        updates.push(`name = $${pIdx++}`);
        values.push(body.name.trim());
      }
      if (body.schoolId !== undefined) {
        updates.push(`school_id = $${pIdx++}`);
        values.push(body.schoolId);
      }
      if (body.capacityMwp !== undefined) {
        updates.push(`capacity_mwp = $${pIdx++}`);
        values.push(Number(body.capacityMwp));
      }
      if (body.latitude !== undefined) {
        updates.push(`latitude = $${pIdx++}`);
        values.push(Number(body.latitude));
      }
      if (body.longitude !== undefined) {
        updates.push(`longitude = $${pIdx++}`);
        values.push(Number(body.longitude));
      }
      if (body.status !== undefined) {
        updates.push(`status = $${pIdx++}`);
        values.push(body.status);
      }

      if (updates.length > 0) {
        updates.push(`updated_at = now()`);
        values.push(id);
        await client.query(
          `UPDATE sites SET ${updates.join(", ")} WHERE id = $${pIdx}`,
          values
        );
      }

      // 2. Update Gateway
      if (
        body.gatewayName !== undefined ||
        body.protocol !== undefined ||
        body.endpoint !== undefined ||
        body.pollingIntervalSeconds !== undefined || body.alertRules !== undefined ||
        body.status !== undefined
      ) {
        const gwUpdates: string[] = [];
        const gwValues: unknown[] = [];
        let gIdx = 1;

        if (body.gatewayName !== undefined) {
          gwUpdates.push(`name = $${gIdx++}`);
          gwValues.push(body.gatewayName.trim());
        }
        if (body.protocol !== undefined) {
          gwUpdates.push(`protocol = $${gIdx++}`);
          gwValues.push(body.protocol.trim());
        }
        if (body.endpoint !== undefined) {
          gwUpdates.push(`endpoint = $${gIdx++}`);
          gwValues.push(body.endpoint.trim());
        }
        if (body.status !== undefined) {
          gwUpdates.push(`status = $${gIdx++}`);
          gwValues.push(body.status);
        }

        if (body.pollingIntervalSeconds !== undefined) { gwUpdates.push(`polling_interval_seconds = $${gIdx++}`); gwValues.push(body.pollingIntervalSeconds); }
        if (body.alertRules !== undefined) { gwUpdates.push(`alert_rules = $${gIdx++}::jsonb`); gwValues.push(JSON.stringify(body.alertRules)); }
        if (gwUpdates.length > 0) {
          gwValues.push(id);
          await client.query(
            `UPDATE gateways SET ${gwUpdates.join(", ")} WHERE site_id = $${gIdx}`,
            gwValues
          );
        }
      }

      // Device edits must identify a single meter when the gateway has several.
      if (body.deviceModel !== undefined || body.deviceSerial !== undefined) {
        const meters = await client.query("SELECT id FROM devices WHERE site_id = $1 AND device_type = 'meter'", [id]);
        if (!body.deviceId && meters.rows.length !== 1) throw new BadRequestException("Select the meter device to edit");
        body.deviceId ??= meters.rows[0]?.id;
        if (!meters.rows.some(meter => meter.id === body.deviceId)) throw new BadRequestException("Meter does not belong to this site");
      }
      // 3. Update Meter Device
      if (
        body.deviceModel !== undefined ||
        body.deviceSerial !== undefined ||
        body.status !== undefined
      ) {
        const devUpdates: string[] = [];
        const devValues: unknown[] = [];
        let dIdx = 1;

        if (body.deviceModel !== undefined) {
          devUpdates.push(`model = $${dIdx++}`);
          devValues.push(body.deviceModel.trim());
          devUpdates.push(`name = $${dIdx++}`);
          devValues.push(`Meter - ${body.deviceModel.trim()}`);
        }
        if (body.deviceSerial !== undefined) {
          devUpdates.push(`serial_number = $${dIdx++}`);
          devValues.push(body.deviceSerial.trim());
        }
        if (body.status !== undefined) {
          devUpdates.push(`status = $${dIdx++}`);
          devValues.push(body.status);
        }

        if (devUpdates.length > 0) {
          devValues.push(id, body.deviceId ?? null);
          await client.query(
            `UPDATE devices SET ${devUpdates.join(", ")} WHERE site_id = $${dIdx} AND id = $${dIdx + 1} AND device_type = 'meter'`,
            devValues
          );
        }
      }

      await client.query("COMMIT");
      await this.mqttService.refreshSubscriptions().catch(() => {});
      const delivered = gw ? await this.mqttService.publishHardwareConfig(body.gatewayName ?? gw.name, { pollingIntervalSeconds: body.pollingIntervalSeconds, alertRules: body.alertRules }).catch(() => false) : false;
      return { success: true, configDelivery: delivered ? 'published' : 'pending', message: "อัปเดตข้อมูลไซต์งานเรียบร้อยแล้ว" };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  @Delete("sites/:id")
  async deleteSite(
    @Param("id") id: string,
    @Query("mode") mode?: string
  ) {
    const client = await this.db.pool.connect();
    try {
      await client.query("BEGIN");

      const siteCheck = await client.query("SELECT id, name FROM sites WHERE id = $1 FOR UPDATE", [id]);
      if (siteCheck.rows.length === 0) {
        throw new NotFoundException("ไม่พบไซต์งานที่ต้องการลบ");
      }
      const siteName = siteCheck.rows[0].name;

      // Check linked contracts and billing cycles
      const contractRes = await client.query("SELECT count(*)::int AS count FROM contracts WHERE site_id = $1", [id]);
      const contractCount = contractRes.rows[0]?.count ?? 0;

      const billingRes = await client.query("SELECT count(*)::int AS count FROM billing_cycles WHERE site_id = $1", [id]);
      const billingCount = billingRes.rows[0]?.count ?? 0;

      const hasLinked = contractCount > 0 || billingCount > 0;

      if (hasLinked) {
        if (mode === "archive") {
          await client.query("UPDATE sites SET status = 'archived', updated_at = now() WHERE id = $1", [id]);
          await client.query("UPDATE gateways SET status = 'offline' WHERE site_id = $1", [id]);
          await client.query("UPDATE devices SET status = 'offline' WHERE site_id = $1", [id]);
          await client.query("COMMIT");
          return {
            success: true,
            archived: true,
            message: `เนื่องจากไซต์ "${siteName}" มีสัญญา (${contractCount} ฉบับ) หรือรอบบิล (${billingCount} รอบ) จึงได้ระงับการใช้งาน (Archive) เรียบร้อยแล้ว`,
          };
        } else {
          throw new BadRequestException(
            `ไม่สามารถลบไซต์ "${siteName}" ได้เนื่องจากมีข้อมูลสัญญา (${contractCount} ฉบับ) หรือรอบบิล (${billingCount} รอบ) ผูกอยู่ หากต้องการปิดการทำงานให้เลือกระงับการใช้งาน (Archive) แทน`
          );
        }
      }

      // Safe hard delete unlinked site & cascaded records
      await client.query("DELETE FROM telemetry_raw WHERE site_id = $1", [id]);
      await client.query("DELETE FROM telemetry_aggregate WHERE site_id = $1", [id]);
      await client.query("DELETE FROM alerts WHERE site_id = $1", [id]);
      await client.query("DELETE FROM billing_meters WHERE site_id = $1", [id]);
      await client.query(
        "DELETE FROM register_mapping_versions WHERE device_id IN (SELECT id FROM devices WHERE site_id = $1)",
        [id]
      );
      await client.query("DELETE FROM devices WHERE site_id = $1", [id]);
      await client.query("DELETE FROM gateways WHERE site_id = $1", [id]);
      await client.query("DELETE FROM sites WHERE id = $1", [id]);

      await client.query("COMMIT");
      return {
        success: true,
        deleted: true,
        message: `ลบไซต์งาน "${siteName}" และอุปกรณ์ที่เกี่ยวข้องเรียบร้อยแล้ว`,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  @Get("sites/:id/devices")
  async listDevices(@Param("id") siteId: string) {
    const result = await this.db.query(`SELECT id, name, model, serial_number AS "serialNumber", device_type AS "deviceType", slave_id AS "slaveId" FROM devices WHERE site_id = $1 ORDER BY name, id`, [siteId]);
    return result.rows;
  }

  @Post("sites/:id/devices")
  async addDevice(@Param("id") siteId: string, @Body() body: { name?: string; model?: string; serialNumber?: string; slaveId?: number; meterPresetId?: string }) {
    if (!body.name?.trim() || !body.model?.trim() || !body.serialNumber?.trim()) throw new BadRequestException("Device name, model and meter serial are required");
    const slaveId = Number(body.slaveId ?? 1);
    if (!Number.isInteger(slaveId) || slaveId < 1 || slaveId > 247) throw new BadRequestException("Slave ID must be 1–247");
    const client = await this.db.pool.connect();
    try {
      await client.query("BEGIN");
      const gateway = await client.query("SELECT id FROM gateways WHERE site_id = $1 FOR UPDATE", [siteId]);
      if (gateway.rows.length !== 1) throw new BadRequestException("Site must have one configured gateway");
      const deviceId = randomUUID();
      await client.query(`INSERT INTO devices (id,gateway_id,site_id,name,model,serial_number,device_type,slave_id,status) VALUES ($1,$2,$3,$4,$5,$6,'meter',$7,'offline')`, [deviceId,gateway.rows[0].id,siteId,body.name.trim(),body.model.trim(),body.serialNumber.trim(),slaveId]);
      if (body.meterPresetId) {
        const preset = await client.query("SELECT registers FROM meter_presets WHERE id = $1", [body.meterPresetId]);
        if (!Array.isArray(preset.rows[0]?.registers)) throw new BadRequestException("Preset not found");
        for (const reg of preset.rows[0].registers) await client.query(`INSERT INTO register_mapping_versions
          (id,device_id,semantic_field,register_address,register_count,word_order,byte_order,data_type,scale,unit,effective_from)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())`, [randomUUID(),deviceId,reg.semanticField ?? reg.semantic_field,String(reg.registerAddress ?? reg.register_address),reg.registerCount ?? reg.register_count ?? 1,reg.wordOrder ?? reg.word_order ?? 'little_word_first',reg.byteOrder ?? reg.byte_order ?? 'big_endian',reg.dataType ?? reg.data_type,reg.scale ?? 1,reg.unit ?? '']);
      }
      await client.query("COMMIT");
      return { id: deviceId, siteId, gatewayId: gateway.rows[0].id };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  @Post("gateways/:gatewayName/hardware-config")
  async configureHardware(
    @Param("gatewayName") gatewayName: string,
    @Body()
    body: {
      interval?: number;
      pollingIntervalSeconds?: number;
      alertRules?: Record<string, unknown>;
      registers?: any[];
      parameters?: Record<string, unknown>;
    }
  ) {
    const gwRes = await this.db.query(
      "SELECT id, name, site_id FROM gateways WHERE name = $1 OR id::text = $1 LIMIT 1",
      [gatewayName]
    );
    const gw = gwRes.rows[0];
    if (!gw) {
      throw new NotFoundException(`ไม่พบ Gateway "${gatewayName}"`);
    }
    const interval = validatedInterval(body.pollingIntervalSeconds ?? body.interval ?? 10);
    validateAlertRules(body.alertRules);

    if (body.alertRules) {
      await this.db.query(
        "UPDATE gateways SET polling_interval_seconds = $1, alert_rules = $2 WHERE id = $3",
        [interval, JSON.stringify(body.alertRules), gw.id]
      );
    } else {
      await this.db.query(
        "UPDATE gateways SET polling_interval_seconds = $1 WHERE id = $2",
        [interval, gw.id]
      );
    }

    const payload = {
      gateway: gw.name,
      pollingIntervalSeconds: interval,
      alertRules: body.alertRules || undefined,
      registers: body.registers || undefined,
      parameters: body.parameters || undefined,
      appliedAt: new Date().toISOString(),
    };

    // Broadcast to hardware over MQTT
    const delivered = await this.mqttService.publishHardwareConfig(gw.name, payload).catch(() => false);

    return {
      success: true,
      delivery: delivered ? "published" : "pending",
      message: delivered ? `บันทึกและส่ง MQTT config ไปยัง "${gw.name}" แล้ว (รอ Hardware นำไปใช้)` : "บันทึกแล้ว แต่ยังส่ง MQTT ไม่สำเร็จ กรุณาลองส่งอีกครั้ง",
      config: payload,
    };
  }
}

function gatewayTopic(name: string, requested?: string) {
  if (!name.trim() || /[/+#]/.test(name) || ["response", "config", "ack"].includes(name.toLowerCase())) throw new BadRequestException("Gateway name cannot contain MQTT separators or wildcards");
  return requested?.startsWith('/') ? `/${name}/#` : `energy/${name}/#`;
}
function validatedInterval(value: unknown) {
  const interval = Number(value);
  if (!Number.isInteger(interval) || interval < 1 || interval > 86400) throw new BadRequestException("Interval must be 1–86400 seconds");
  return interval;
}
function validateAlertRules(rules?: Record<string, unknown>) {
  if (!rules) return;
  for (const [key, value] of Object.entries(rules)) {
    if (key.endsWith('Severity')) {
      if (!['info','warning','critical'].includes(String(value))) throw new BadRequestException("Invalid alert severity");
    } else if (typeof value !== 'number' || !Number.isFinite(value)) throw new BadRequestException("Alert thresholds must be finite numbers");
  }
}
