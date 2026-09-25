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
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import net from "node:net";
import mqtt from "mqtt";
import { DatabaseService } from "../../database/database.service.js";

@Controller("v1")
export class AssetsController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Get("schools")
  async listSchools() {
    const res = await this.db.query(
      "SELECT id, name, code, region, status FROM schools ORDER BY name"
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

    if (protocol === "modbus-tcp") {
      return new Promise((resolve) => {
        let host = endpoint;
        let port = 502;

        if (host.includes(":")) {
          const parts = host.split(":");
          host = parts[0] || "localhost";
          port = parseInt(parts[1] || "502", 10) || 502;
        }

        if (host.includes("/")) {
          return resolve({
            status: "offline",
            protocol,
            endpoint,
            latencyMs: null,
            message: "รูปแบบ Endpoint สำหรับ Modbus TCP ต้องเป็น Host/IP:Port (เช่น 192.168.1.50:502)",
          });
        }

        const start = Date.now();
        const socket = new net.Socket();
        let settled = false;

        const finish = (res: { status: "online" | "offline"; latencyMs: number | null; message: string }) => {
          if (settled) return;
          settled = true;
          socket.destroy();
          resolve({ ...res, protocol, endpoint });
        };

        socket.setTimeout(3000);
        socket.connect(port, host, () => {
          const latencyMs = Date.now() - start;
          finish({
            status: "online",
            latencyMs,
            message: `เชื่อมต่อ Modbus TCP (${host}:${port}) สำเร็จ [Latency: ${latencyMs}ms]`,
          });
        });

        socket.on("error", (err) => {
          finish({
            status: "offline",
            latencyMs: null,
            message: `ไม่สามารถเชื่อมต่อ Modbus TCP (${host}:${port}) ได้: ${err.message}`,
          });
        });

        socket.on("timeout", () => {
          finish({
            status: "offline",
            latencyMs: null,
            message: `การเชื่อมต่อ Modbus TCP (${host}:${port}) หมดเวลา (Timeout 3s)`,
          });
        });
      });
    }

    // Default: MQTT Protocol Test
    return new Promise((resolve) => {
      const brokerUrl =
        endpoint.startsWith("mqtt://") || endpoint.startsWith("ws://") || endpoint.startsWith("wss://")
          ? endpoint
          : process.env.MQTT_URL || "mqtt://localhost:1883";

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
          message: `เชื่อมต่อ MQTT Broker สำเร็จ พร้อมรับข้อมูล Telemetry บน Topic: ${endpoint} [Latency: ${latencyMs}ms]`,
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
  async listSites() {
    const res = await this.db.query(
      'SELECT id, school_id AS "schoolId", name, capacity_mwp AS "capacityMwp", status FROM sites ORDER BY name'
    );
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
        si.status,
        s.name AS "schoolName",
        g.id AS "gatewayId",
        coalesce(g.name, 'GW-01') AS "gatewayName",
        coalesce(g.protocol, 'mqtt') AS protocol,
        coalesce(g.endpoint, '') AS endpoint,
        d.id AS "deviceId",
        coalesce(d.model, 'PM5350') AS "deviceModel",
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
      capacityMwp?: number;
      latitude?: number;
      longitude?: number;
      gatewayName?: string;
      protocol?: string;
      endpoint?: string;
      deviceModel?: string;
      deviceSerial?: string;
      meterPresetId?: string;
      status?: string;
    }
  ) {
    const name = body.name?.trim();
    const schoolId = body.schoolId;
    const capacityMwp = Number(body.capacityMwp ?? 0.5);
    const lat = body.latitude ? Number(body.latitude) : 13.7563;
    const lng = body.longitude ? Number(body.longitude) : 100.5018;

    if (!name || !schoolId) {
      throw new BadRequestException("กรุณาระบุชื่อไซต์งานและโรงเรียนสังกัด");
    }

    const siteId = randomUUID();
    const devSerial = body.deviceSerial?.trim() || `SN-${siteId.slice(0, 8).toUpperCase()}`;

    // Verify serial number uniqueness before starting transaction
    const dupDev = await this.db.query("SELECT id FROM devices WHERE serial_number = $1", [devSerial]);
    if (dupDev.rows.length > 0) {
      throw new BadRequestException(
        `หมายเลขซีเรียลมิเตอร์ "${devSerial}" มีอยู่ในระบบแล้ว กรุณาระบุหมายเลขซีเรียลอื่น`
      );
    }

    const initialStatus = body.status === "offline" ? "offline" : "online";

    const countRes = await this.db.query("SELECT count(*)::int AS count FROM gateways");
    const gwCount = countRes.rows[0]?.count ?? 0;
    const gwId = randomUUID();
    const gwName = body.gatewayName?.trim() || `GW-${String(gwCount + 1).padStart(3, "0")}`;
    const protocol = body.protocol?.trim() || "mqtt";
    const endpoint = body.endpoint?.trim() || `energy/site-${siteId.slice(0, 8)}/telemetry`;

    const deviceId = randomUUID();
    const devModel = body.deviceModel?.trim() || "PM5350";
    const devName = `Meter - ${devModel}`;

    const client = await this.db.pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Create Site
      const siteSql = `
        INSERT INTO sites (id, school_id, name, capacity_mwp, latitude, longitude, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, school_id AS "schoolId", name, capacity_mwp AS "capacityMwp", status
      `;
      const res = await client.query(siteSql, [siteId, schoolId, name, capacityMwp, lat, lng, initialStatus]);

      // 2. Create Gateway
      await client.query(
        `INSERT INTO gateways (id, site_id, name, protocol, endpoint, status, last_seen_at) 
         VALUES ($1, $2, $3, $4, $5, $6, now())`,
        [gwId, siteId, gwName, protocol, endpoint, initialStatus]
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
          console.warn("Non-fatal: Failed to clone preset registers:", presetErr);
        }
      }

      await client.query("COMMIT");
      return res.rows[0];
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
    const client = await this.db.pool.connect();
    try {
      await client.query("BEGIN");

      const siteCheck = await client.query("SELECT id FROM sites WHERE id = $1 FOR UPDATE", [id]);
      if (siteCheck.rows.length === 0) {
        throw new NotFoundException("ไม่พบไซต์งานที่ต้องการแก้ไข");
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

        if (gwUpdates.length > 0) {
          gwValues.push(id);
          await client.query(
            `UPDATE gateways SET ${gwUpdates.join(", ")} WHERE site_id = $${gIdx}`,
            gwValues
          );
        }
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
          devValues.push(id);
          await client.query(
            `UPDATE devices SET ${devUpdates.join(", ")} WHERE site_id = $${dIdx} AND device_type = 'meter'`,
            devValues
          );
        }
      }

      await client.query("COMMIT");
      return { success: true, message: "อัปเดตข้อมูลไซต์งานเรียบร้อยแล้ว" };
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
}
