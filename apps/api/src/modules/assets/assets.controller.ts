import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
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
import { organizationColumns, parseOrganization, insertOrganization, resolveSiteOrganization, organizationCodeError, type OrganizationInput } from "./organization-master.js";
import { siteHistoryFilter } from "./site-history.js";
import { randomUUID } from "node:crypto";
import { identityDraft, operationalCode, identityConflict, retryGeneratedIdentity, type IdentityDraftInput } from "./identity-allocation.js";

import mqtt from "mqtt";
import type {PoolClient} from "pg";
import { brokerSettings, brokerUrl, encryptBrokerPassword, decryptBrokerPassword } from '../telemetry/broker-settings.js';
import { validatePayloadProfile } from "../telemetry/payload-profile.js";
import { payloadTopic, gatewayPrefix } from "../telemetry/payload-ingestion.js";
import { PayloadReceptionSettings } from '../telemetry/payload-reception-settings.js';
import { validateReceiveConfig } from '../telemetry/payload-receive.js';
import { DatabaseService } from "../../database/database.service.js";
import { MqttIngestionService } from "../telemetry/mqtt-ingestion.service.js";

@Controller("v1")
export class AssetsController {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(MqttIngestionService) private readonly mqttService: MqttIngestionService
  ) {}

  @Get('mqtt-brokers')
  async listBrokers() {
    const url=new URL(process.env.MQTT_URL || 'mqtt://localhost:1883');
    // Never expose credentials embedded in an environment URL.
    url.username='';url.password='';
    return [{id:'default',name:'System default broker',url:url.toString(),username:process.env.MQTT_USERNAME || '',systemDefault:true},...(await this.db.query('SELECT id,name,url,username FROM mqtt_brokers ORDER BY name')).rows];
  }
  @Post('mqtt-brokers')
  async createBroker(@Body() body: unknown) {
    const parsed=brokerSettings.safeParse(body);
    if(!parsed.success)throw new BadRequestException(parsed.error.issues.map(i=>i.message).join(', '));
    const count=await this.db.query('SELECT count(*)::int AS count FROM mqtt_brokers');
    if(Number(count.rows[0]?.count)>=32)throw new BadRequestException('Maximum 32 brokers');
    const b=parsed.data;
    return (await this.db.query('INSERT INTO mqtt_brokers(id,name,url,username,password_cipher) VALUES($1,$2,$3,$4,$5) RETURNING id,name,url,username',[randomUUID(),b.name,brokerUrl(b),b.username,encryptBrokerPassword(b.password)])).rows[0];
  }

  @Patch('mqtt-brokers/:id')
  async updateBroker(@Param('id') id:string,@Body() body:unknown){
    const parsed=brokerSettings.safeParse(body);
    if(!parsed.success)throw new BadRequestException(parsed.error.issues.map(i=>i.message).join(', '));
    const b=parsed.data;
    const passwordSupplied=Object.prototype.hasOwnProperty.call(body,'password');
    const result=await this.db.query('UPDATE mqtt_brokers SET name=$2,url=$3,username=$4,password_cipher=CASE WHEN $5 THEN $6 ELSE password_cipher END WHERE id=$1 RETURNING id,name,url,username',[id,b.name,brokerUrl(b),b.username,passwordSupplied,passwordSupplied?encryptBrokerPassword(b.password):'']);
    if(!result.rows[0])throw new NotFoundException('Broker not found');
    return result.rows[0];
  }

  @Delete('mqtt-brokers/:id')
  async deleteBroker(@Param('id') id:string){
    try{
      const result=await this.db.query('DELETE FROM mqtt_brokers WHERE id=$1 RETURNING id',[id]);
      if(!result.rows[0])throw new NotFoundException('Broker not found');
      return {success:true};
    }catch(error){
      if((error as {code?:string}).code==='23503')throw new BadRequestException('Broker นี้ยังมี Gateway ใช้งานอยู่ กรุณาเปลี่ยน Broker ของ Gateway ก่อนลบ');
      throw error;
    }
  }

  @Get("schools")
  async listSchools(@Req() req: { user?: { role?: string; schoolId?: string | null } }) {
    const res = await this.db.query(
      `SELECT ${organizationColumns} FROM schools WHERE ($1::uuid IS NULL OR id = $1) AND $2 ORDER BY name`,
      [req.user?.role === "admin" ? null : req.user?.schoolId ?? null, req.user?.role !== "school_user" || Boolean(req.user?.schoolId)]
    );
    return res.rows;
  }

  @Post("schools")
  async createSchool(@Body() body: OrganizationInput & { region?: string }) {
    const input=parseOrganization(body);
    try { return await insertOrganization(this.db,input,body.region?.trim()||"ภาคกลาง"); }
    catch(error) { organizationCodeError(error); }
  }

  @Patch("schools/:id")
  async updateSchool(@Param("id") id:string,@Body() body:OrganizationInput & {impactConfirmed?:boolean;expectedUpdatedAt?:string},@Req() req:{user?:{role?:string;schoolId?:string}}){
    if(req.user?.role!=="admin")throw new ForbiddenException("This action is not permitted for your role");
    if(body.impactConfirmed!==true)throw new BadRequestException("Confirm the impact on all linked sites and future contracts");
    if(!body.expectedUpdatedAt||!Number.isFinite(Date.parse(body.expectedUpdatedAt)))throw new BadRequestException("Reload organization before saving");
    const input=parseOrganization(body);
    if(!body.code?.trim())throw new BadRequestException("Organization code is required");
    try {
      const result=await this.db.query(`UPDATE schools SET name=$2,code=$3,legal_name=$4,tax_id=$5,tax_branch=$6,tax_address=$7,contact_name=$8,phone=$9,document_email=$10,updated_at=now()
        WHERE id=$1 AND updated_at=$11::timestamptz RETURNING ${organizationColumns}`,
        [id,input.name,input.code,input.legalName,input.taxId,input.taxBranch,input.taxAddress,input.contactName,input.phone,input.documentEmail,body.expectedUpdatedAt]);
      if(!result.rows[0])throw new ConflictException("Organization changed; reload before editing");
      return result.rows[0];
    }catch(error){organizationCodeError(error);}
  }

  @Post("sites/test-connection")
  async testConnection(
    @Body() body: { protocol?: string; endpoint?: string; mqttBrokerId?: string }
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
    const selected=body.mqttBrokerId ? (await this.db.query('SELECT url,username,password_cipher FROM mqtt_brokers WHERE id=$1',[body.mqttBrokerId])).rows[0] : null;
    if(body.mqttBrokerId&&!selected)throw new BadRequestException('Broker not found');
    // Test the selected broker, not the telemetry topic or hardware.
    return new Promise((resolve) => {
      const brokerUrl =
        selected?.url || process.env.MQTT_URL || "mqtt://localhost:1883";

      const start = Date.now();
      const mqttOptions: mqtt.IClientOptions = {
        connectTimeout: 3000,
        reconnectPeriod: 0,
      };
      if(selected){mqttOptions.username=selected.username||undefined;if(selected.password_cipher)mqttOptions.password=decryptBrokerPassword(selected.password_cipher);}

      if (!selected && process.env.MQTT_USERNAME) {
        mqttOptions.username = process.env.MQTT_USERNAME;
      }
      if (!selected && process.env.MQTT_PASSWORD) {
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
        si.external_site_id AS "externalSiteId",
        si.school_id AS "schoolId",
        si.name,
        coalesce(round(si.capacity_mwp::numeric, 4), 0) AS "capacityMwp",
        CASE WHEN si.status = 'archived' THEN 'archived' WHEN g.last_seen_at >= now() - interval '120 seconds' THEN 'online' ELSE 'offline' END AS status,
        s.name AS "schoolName",
        s.code AS "schoolCode",
        g.id AS "gatewayId",
        g.external_gateway_id AS "externalGatewayId",
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
    const res = await this.db.query(sql, [req.user?.role === "admin" ? null : req.user?.schoolId ?? null, req.user?.role !== "school_user" || Boolean(req.user?.schoolId)]);
    return res.rows;
  }

  @Get("sites/:id")
  async getSite(@Param("id") id: string) {
    const sql = `
      SELECT
        si.id,
        si.external_site_id AS "externalSiteId",
        si.school_id AS "schoolId",
        si.name,
        coalesce(round(si.capacity_mwp::numeric, 4), 0) AS "capacityMwp",
        si.latitude,
        si.longitude,
        CASE WHEN si.status = 'archived' THEN 'archived' WHEN g.last_seen_at >= now() - interval '120 seconds' THEN 'online' ELSE 'offline' END AS status,
        s.name AS "schoolName",
        s.code AS "schoolCode",
        g.id AS "gatewayId",
        g.external_gateway_id AS "externalGatewayId",
        g.name AS "gatewayName",
        coalesce(g.protocol, 'mqtt') AS protocol,
        coalesce(g.endpoint, '') AS endpoint,
        coalesce(g.mqtt_broker_id::text,'') AS "mqttBrokerId",
        coalesce(g.polling_interval_seconds, 10) AS "pollingIntervalSeconds",
        g.alert_rules AS "alertRules",
        g.last_seen_at AS "lastSeenAt",
        d.id AS "deviceId",
        d.external_device_id AS "externalDeviceId",
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

  @Post('sites/identity-draft')
  async allocateIdentityDraft(@Body() body: IdentityDraftInput) {
    for(let attempt=0;attempt<5;attempt++) {
      const draft=identityDraft(body);
      if(!(await this.db.query('SELECT id FROM sites WHERE external_site_id=$1',[draft.externalSiteId])).rows.length)return draft;
      if(body.externalSiteId?.trim())throw new ConflictException('Site code already exists; choose another code and preview again');
    }
    throw new ConflictException('Unable to allocate site code; retry creation');
  }

  @Post('sites/payload-preview')
  async previewPlannedPayload(@Body() body:{externalSiteId:string;externalGatewayId:string;devices:{externalDeviceId:string;payloadProfileRevisionId?:string;localOverrideConfig?:unknown;sourcePresetRevisionId?:string}[];config:unknown;input:unknown;topic:string}) {
    try {
      externalIdentifier(body.externalSiteId); externalIdentifier(body.externalGatewayId);
      if (!Array.isArray(body.devices) || !body.devices.length || body.devices.length>32) throw new Error('Specify 1 to 32 devices');
      const devices=await Promise.all(body.devices.map(async device=>{externalIdentifier(device.externalDeviceId);const profile=await this.prepareDeviceProfile(device);if(!profile)throw new BadRequestException("Device profile required");return {externalDeviceId:device.externalDeviceId,config:profile.config};}));
      return new PayloadReceptionSettings(this.db).previewContext({externalSiteId:body.externalSiteId,externalGatewayId:body.externalGatewayId,devices},body);
    } catch(error) {throw new BadRequestException(error instanceof Error?error.message:'Invalid preview');}
  }

  @Post("sites")
  async createSite(
    @Body()
    body: {
      name?: string;
      schoolId?: string;
      schoolName?: string;
      newOrganization?: OrganizationInput;
      capacityMwp?: number;
      latitude?: number;
      longitude?: number;
      mqttBrokerId?: string;
      gatewayName?: string;
      protocol?: string;
      endpoint?: string;
      deviceName?: string;
      deviceModel?: string;
      deviceSerial?: string;
      meterPresetId?: string;
      payloadProfileRevisionId?: string;
      localOverrideConfig?: unknown;
      sourcePresetRevisionId?: string;
      receiveConfig?: unknown;
      additionalDevices?: {name:string;model:string;serialNumber:string;externalDeviceId?:string;payloadProfileRevisionId?:string;localOverrideConfig?:unknown;sourcePresetRevisionId?:string}[];
      externalSiteId?: string;
      externalGatewayId?: string;
      externalDeviceId?: string;
      pollingIntervalSeconds?: number;
      interval?: number;
      alertRules?: Record<string, unknown>;
      status?: string;
    },
    allocationAttempt = 0
  ): Promise<{id:string;schoolId:string;externalSiteId:string;configDelivery:string;[key:string]:unknown}> {
    const originalBody = body;
    const draft = identityDraft(body);
    body = {...body,externalSiteId:draft.externalSiteId,externalGatewayId:draft.externalGatewayId,externalDeviceId:draft.externalDeviceId,...(body.additionalDevices?{additionalDevices:body.additionalDevices.map((device,index)=>({...device,externalDeviceId:draft.additionalDevices[index]!.externalDeviceId}))}:{})};
    const name = body.name?.trim();
    let schoolId = body.schoolId?.trim();
    const schoolName = body.schoolName?.trim();
    if (body.protocol && body.protocol !== "mqtt") throw new BadRequestException("Only MQTT is supported");
    const capacityMwp = Number(body.capacityMwp ?? 0.5);
    const lat = body.latitude === undefined || body.latitude === null ? null : Number(body.latitude);
    const lng = body.longitude === undefined || body.longitude === null ? null : Number(body.longitude);

    if (!name || (!schoolId && !schoolName && !body.newOrganization?.name)) {
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

    const gwId = randomUUID();
    const gwName = body.gatewayName?.trim() || operationalCode(undefined, "GW");
    const protocol = "mqtt";
    const payloadRevision = await this.prepareDeviceProfile(body);
    if (payloadRevision && body.meterPresetId) throw new BadRequestException("Choose payload or register preset");
    if (payloadRevision && (payloadRevision.config.deviceType === "solar-logger" || !payloadRevision.config.fields.some(f => f.role === "billing-import"))) throw new BadRequestException("Site billing meter requires a billing-import profile");
    if (payloadRevision) { externalIdentifier(body.externalSiteId); externalIdentifier(body.externalGatewayId); externalIdentifier(body.externalDeviceId); }
    if (!payloadRevision && (body.receiveConfig || body.additionalDevices?.length)) throw new BadRequestException('Reception settings require a payload profile');
    if (body.additionalDevices && (!Array.isArray(body.additionalDevices) || body.additionalDevices.length > 31)) throw new BadRequestException('At most 31 additional devices');
    const additionalDevices = await Promise.all((body.additionalDevices ?? []).map(async device => {
      if (!device?.name?.trim() || !device.model?.trim() || !device.serialNumber?.trim() || (!device.payloadProfileRevisionId && !device.localOverrideConfig)) throw new BadRequestException('Complete every additional device');
      externalIdentifier(device.externalDeviceId);
      return {...device, externalDeviceId:device.externalDeviceId!, id:randomUUID(), revision: (await this.prepareDeviceProfile(device))!};
    }));
    const identifiers = [body.externalDeviceId, ...additionalDevices.map(d => d.externalDeviceId)];
    if (new Set(identifiers).size !== identifiers.length) throw new BadRequestException('Device IDs must be unique');
    let receiveConfig;
    try { receiveConfig = body.receiveConfig === undefined ? null : validateReceiveConfig(body.receiveConfig); }
    catch(error) { throw new BadRequestException(error instanceof Error ? error.message : 'Invalid reception settings'); }
    if (receiveConfig && payloadRevision) new PayloadReceptionSettings(this.db).validateTargets(receiveConfig, [{externalDeviceId:body.externalDeviceId!,config:payloadRevision.config},...additionalDevices.map(d=>({externalDeviceId:d.externalDeviceId,config:d.revision.config}))]);
    const endpoint = payloadRevision ? payloadSubscription(body.externalSiteId!, body.externalGatewayId!, body.endpoint) : gatewayTopic(gwName, body.endpoint);
    const intervalSec = validatedInterval(body.pollingIntervalSeconds ?? body.interval ?? 10);
    validateAlertRules(body.alertRules);
    const alertRulesJson = body.alertRules
      ? JSON.stringify(body.alertRules)
      : '{}';

    const deviceId = randomUUID();
    const devModel = body.deviceModel?.trim() || (payloadRevision ? payloadRevision.config.displayName : "PM5350");
    const devName = body.deviceName?.trim() || `Meter - ${devModel}`;

    const client = await this.db.pool.connect();
    try {
      await client.query("BEGIN");

      schoolId = await resolveSiteOrganization(client,body);
      // 1. Create Site
      const siteSql = `
        INSERT INTO sites (id, school_id, name, capacity_mwp, latitude, longitude, status, external_site_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, school_id AS "schoolId", name, capacity_mwp AS "capacityMwp", status, external_site_id AS "externalSiteId"
      `;
      const res = await client.query(siteSql, [siteId, schoolId, name, capacityMwp, lat, lng, initialStatus, body.externalSiteId]);

      // 2. Create Gateway
      await client.query(
        `INSERT INTO gateways (id, site_id, name, protocol, endpoint, status, polling_interval_seconds, alert_rules, last_seen_at, external_gateway_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NULL, $9)`,
        [gwId, siteId, gwName, protocol, endpoint, initialStatus, intervalSec, alertRulesJson, body.externalGatewayId]
      );

      if(body.mqttBrokerId)await client.query("UPDATE gateways SET mqtt_broker_id=$1 WHERE id=$2",[body.mqttBrokerId,gwId]);

      if(payloadRevision) await this.persistDeviceProfile(client,payloadRevision,deviceId);
      // 3. Create Device
      await client.query(
        `INSERT INTO devices (id, gateway_id, site_id, name, device_type, model, serial_number, slave_id, status, external_device_id, payload_profile_revision_id)
         VALUES ($1, $2, $3, $4, 'meter', $5, $6, 1, $7, $8, $9)`,
        [deviceId, gwId, siteId, devName, devModel, devSerial, initialStatus, body.externalDeviceId, payloadRevision?.id ?? null]
      );

      // 4. Assign Billing Meter
      for (const device of additionalDevices) {
        await this.persistDeviceProfile(client,device.revision,device.id);
        await client.query(`INSERT INTO devices(id,gateway_id,site_id,name,device_type,model,serial_number,slave_id,status,external_device_id,payload_profile_revision_id) VALUES($1,$2,$3,$4,$5,$6,$7,1,'offline',$8,$9)`,[device.id,gwId,siteId,device.name.trim(),device.revision.config.deviceType.includes('logger')?'logger':'meter',device.model.trim(),device.serialNumber.trim(),device.externalDeviceId,device.revision.id]);
      }
      if (receiveConfig) await client.query('INSERT INTO gateway_payload_receive_revisions(id,gateway_id,version,config) VALUES($1,$2,1,$3::jsonb)',[randomUUID(),gwId,JSON.stringify(receiveConfig)]);

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
      if (body.pollingIntervalSeconds === undefined && body.interval === undefined && body.alertRules === undefined) return { ...res.rows[0], configDelivery: "not_requested" };
      const delivered = await this.mqttService.publishHardwareConfig(gwName, { pollingIntervalSeconds: intervalSec, alertRules: JSON.parse(alertRulesJson) }).catch(() => false);
      return { ...res.rows[0], configDelivery: delivered ? "published" : "pending" };
    } catch (err) {
      await client.query("ROLLBACK");
      if(retryGeneratedIdentity(err,originalBody,allocationAttempt))return this.createSite(originalBody,allocationAttempt+1);
      try { identityConflict(err); } catch(error) { organizationCodeError(error); }
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
      newOrganization?: OrganizationInput;
      deviceId?: string;
      pollingIntervalSeconds?: number;
      alertRules?: Record<string, unknown>;
      capacityMwp?: number;
      latitude?: number;
      longitude?: number;
      status?: string;
      mqttBrokerId?: string;
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

      const siteCheck = await client.query("SELECT id, school_id FROM sites WHERE id = $1 FOR UPDATE", [id]);
      if (siteCheck.rows.length === 0) {
        throw new NotFoundException("ไม่พบไซต์งานที่ต้องการแก้ไข");
      }

      if(body.schoolId !== undefined || body.newOrganization) {
        body.schoolId=await resolveSiteOrganization(client,{schoolId:body.schoolId,...(body.newOrganization?{newOrganization:body.newOrganization}:{})});
        if (body.schoolId !== siteCheck.rows[0].school_id) {
          const history = await client.query(`SELECT (
            EXISTS(SELECT 1 FROM contracts WHERE site_id=$1)
            OR EXISTS(SELECT 1 FROM billing_cycles WHERE site_id=$1)
            OR EXISTS(SELECT 1 FROM documents WHERE site_id=$1)
          ) AS has_history`, [id]);
          if (history.rows[0]?.has_history) throw new ConflictException(
            'ไซต์งานมีประวัติสัญญา การเรียกเก็บเงิน หรือเอกสารแล้ว ไม่สามารถเปลี่ยนองค์กรได้ กรุณาสร้างไซต์งานใหม่สำหรับองค์กรอื่น / This site has contract, billing or document history. Its organization cannot change; create a new site for another organization.'
          );
        }
      }
      const gateway = await client.query(`SELECT g.id,g.name,g.endpoint,g.external_gateway_id AS "externalGatewayId",s.external_site_id AS "externalSiteId" FROM gateways g JOIN sites s ON s.id=g.site_id WHERE g.site_id = $1 FOR UPDATE OF g`, [id]);
      const gw = gateway.rows[0];
      if (gw && (body.gatewayName !== undefined || body.endpoint !== undefined)) {
        body.gatewayName = body.gatewayName?.trim() || gw.name;
        if(gw.endpoint?.startsWith("solar/v1/")) {
          gatewayTopic(body.gatewayName!);body.endpoint=payloadSubscription(gw.externalSiteId,gw.externalGatewayId,body.endpoint ?? gw.endpoint);
        }else body.endpoint = gatewayTopic(body.gatewayName!, body.endpoint);
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
        body.mqttBrokerId !== undefined ||
        body.gatewayName !== undefined ||
        body.protocol !== undefined ||
        body.endpoint !== undefined ||
        body.pollingIntervalSeconds !== undefined || body.alertRules !== undefined ||
        body.status !== undefined
      ) {
        const gwUpdates: string[] = [];
        const gwValues: unknown[] = [];
        let gIdx = 1;

        if(body.mqttBrokerId !== undefined){
          if(body.mqttBrokerId && !(await client.query("SELECT id FROM mqtt_brokers WHERE id=$1",[body.mqttBrokerId])).rows.length)throw new BadRequestException("Broker not found");
          gwUpdates.push(`mqtt_broker_id = ${gIdx++}`);gwValues.push(body.mqttBrokerId||null);
        }
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
      if (body.pollingIntervalSeconds === undefined && body.alertRules === undefined) return { success: true, configDelivery: "not_requested", message: "อัปเดตข้อมูลไซต์งานเรียบร้อยแล้ว" };
      const delivered = gw ? await this.mqttService.publishHardwareConfig(body.gatewayName ?? gw.name, { pollingIntervalSeconds: body.pollingIntervalSeconds, alertRules: body.alertRules }).catch(() => false) : false;
      return { success: true, configDelivery: delivered ? 'published' : 'pending', message: "อัปเดตข้อมูลไซต์งานเรียบร้อยแล้ว" };
    } catch (err) {
      await client.query("ROLLBACK");
      organizationCodeError(err);
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
      // Raw deletion can enqueue archive dirty days through its trigger. Clear them last.
      await client.query("DELETE FROM telemetry_archive_dirty WHERE site_id = $1", [id]);
      await client.query("DELETE FROM telemetry_archive_scan WHERE site_id = $1", [id]);
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
    const result = await this.db.query(`SELECT id, name, model, serial_number AS "serialNumber", device_type AS "deviceType", slave_id AS "slaveId", external_device_id AS "externalDeviceId",payload_profile_revision_id AS "payloadProfileRevisionId" FROM devices WHERE site_id = $1 ORDER BY name, id`, [siteId]);
    return result.rows;
  }

  @Post("sites/:id/devices")
  async addDevice(@Param("id") siteId: string, @Body() body: { name?: string; model?: string; serialNumber?: string; slaveId?: number; meterPresetId?: string; payloadProfileRevisionId?: string; localOverrideConfig?: unknown; sourcePresetRevisionId?:string; externalDeviceId?: string }, allocationAttempt=0):Promise<{id:string;siteId:string;gatewayId:string;externalDeviceId:string|undefined}> {
    const originalBody=body;
    body={...body,externalDeviceId:operationalCode(body.externalDeviceId,"DEV")};
    if (!body.name?.trim() || !body.model?.trim() || !body.serialNumber?.trim()) throw new BadRequestException("Device name, model and meter serial are required");
    const revision = await this.prepareDeviceProfile(body);
    if (revision && body.meterPresetId) throw new BadRequestException("Choose payload or register preset");
    if (revision) externalIdentifier(body.externalDeviceId);
    const slaveId = Number(body.slaveId ?? 1);
    if (!Number.isInteger(slaveId) || slaveId < 1 || slaveId > 247) throw new BadRequestException("Slave ID must be 1–247");
    const client = await this.db.pool.connect();
    try {
      await client.query("BEGIN");
      const gateway = await client.query(`SELECT g.id,g.endpoint,s.external_site_id AS "externalSiteId",g.external_gateway_id AS "externalGatewayId" FROM gateways g JOIN sites s ON s.id=g.site_id WHERE g.site_id = $1 FOR UPDATE OF g`, [siteId]);
      if (gateway.rows.length !== 1) throw new BadRequestException("Site must have one configured gateway");
      if (!revision && gateway.rows[0].endpoint?.startsWith("solar/v1/")) throw new BadRequestException("Standard gateway devices require a payload profile");
      if (revision && (!gateway.rows[0].endpoint?.startsWith("solar/v1/") || !gateway.rows[0].externalSiteId || !gateway.rows[0].externalGatewayId)) throw new BadRequestException("Legacy gateway requires coordinated standard commissioning before adding a payload profile");
      const deviceId = randomUUID();
      if(revision) await this.persistDeviceProfile(client,revision,deviceId);
      await client.query(`INSERT INTO devices (id,gateway_id,site_id,name,model,serial_number,device_type,slave_id,status,external_device_id,payload_profile_revision_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'offline',$9,$10)`, [deviceId,gateway.rows[0].id,siteId,body.name.trim(),body.model.trim(),body.serialNumber.trim(),revision && revision.config.deviceType === 'solar-logger' ? 'logger' : 'meter',slaveId,body.externalDeviceId,revision?.id ?? null]);
      if (body.meterPresetId) {
        const preset = await client.query("SELECT registers FROM meter_presets WHERE id = $1", [body.meterPresetId]);
        if (!Array.isArray(preset.rows[0]?.registers)) throw new BadRequestException("Preset not found");
        for (const reg of preset.rows[0].registers) await client.query(`INSERT INTO register_mapping_versions
          (id,device_id,semantic_field,register_address,register_count,word_order,byte_order,data_type,scale,unit,effective_from)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())`, [randomUUID(),deviceId,reg.semanticField ?? reg.semantic_field,String(reg.registerAddress ?? reg.register_address),reg.registerCount ?? reg.register_count ?? 1,reg.wordOrder ?? reg.word_order ?? 'little_word_first',reg.byteOrder ?? reg.byte_order ?? 'big_endian',reg.dataType ?? reg.data_type,reg.scale ?? 1,reg.unit ?? '']);
      }
      await client.query("COMMIT");
      return { id: deviceId, siteId, gatewayId: gateway.rows[0].id, externalDeviceId:body.externalDeviceId };
    } catch (error) { await client.query("ROLLBACK"); if(retryGeneratedIdentity(error,originalBody,allocationAttempt))return this.addDevice(siteId,originalBody,allocationAttempt+1); identityConflict(error); } finally { client.release(); }
  }

  private async getPayloadRevision(id: string, deviceId?:string, sharedOnly=false) {
    const row=(await this.db.query(`SELECT p.id,p.config,p.owner_device_id,
      EXISTS(SELECT 1 FROM payload_preset_archives a WHERE a.profile_id=p.profile_id) AS archived,
      EXISTS(SELECT 1 FROM devices d JOIN payload_profile_revisions active ON active.id=d.payload_profile_revision_id WHERE d.id=$2 AND (active.id=p.id OR active.source_preset_revision_id=p.id)) AS available_to_device
      FROM payload_profile_revisions p WHERE p.id=$1 AND (p.owner_device_id IS NULL OR p.owner_device_id=$2)`,[id,deviceId??null])).rows[0];
    if(!row || row.owner_device_id && (sharedOnly||row.owner_device_id!==deviceId) || row.archived && !row.available_to_device)throw new BadRequestException("Payload revision not found");
    return {id:row.id as string,config:validatePayloadProfile(row.config)};
  }

  private async prepareDeviceProfile(body:{payloadProfileRevisionId?:string;localOverrideConfig?:unknown;sourcePresetRevisionId?:string},deviceId?:string) {
    if(body.localOverrideConfig===undefined) {
      if(body.sourcePresetRevisionId)throw new BadRequestException('Source preset requires local override config');
      return body.payloadProfileRevisionId?this.getPayloadRevision(body.payloadProfileRevisionId,deviceId):null;
    }
    if(body.payloadProfileRevisionId)throw new BadRequestException('Choose revision or local override');
    const source=body.sourcePresetRevisionId?await this.getPayloadRevision(body.sourcePresetRevisionId,deviceId,true):null;
    try {
      const draft=validatePayloadProfile(body.localOverrideConfig);
      if(source && source.config.deviceType!==draft.deviceType)throw Error('Profile device type cannot change');
      const id=randomUUID();
      const config=validatePayloadProfile({...draft,id:'local-'+id,version:'1.0.0',sourceProfile:source?(source.config.sourceProfile??{id:source.config.id,version:source.config.version}):(draft.sourceProfile??{id:draft.id,version:draft.version})});
      return {id,config,local:true as const,sourcePresetRevisionId:body.sourcePresetRevisionId??null};
    }catch(error){throw new BadRequestException(error instanceof Error?error.message:'Invalid device profile');}
  }

  private async persistDeviceProfile(client:Pick<PoolClient,"query">,revision:NonNullable<Awaited<ReturnType<AssetsController['prepareDeviceProfile']>>>,deviceId:string) {
    if('local' in revision)await client.query('INSERT INTO payload_profile_revisions(id,profile_id,version,config,owner_device_id,source_preset_revision_id) VALUES($1,$2,$3,$4::jsonb,$5,$6)',[revision.id,revision.config.id,revision.config.version,JSON.stringify(revision.config),deviceId,revision.sourcePresetRevisionId]);
  }

  @Patch("devices/:id/payload-profile")
  async upgradePayloadProfile(@Param("id") id:string,@Body() body:{payloadProfileRevisionId?:string;localOverrideConfig?:unknown;sourcePresetRevisionId?:string;name?:string;model?:string;serialNumber?:string}) {
    const revision=await this.prepareDeviceProfile(body,id);
    if(!revision)throw new BadRequestException("Payload revision or local configuration is required");
    for(const key of ["name","model","serialNumber"] as const)if(body[key]!==undefined&&!body[key]?.trim())throw new BadRequestException("Device name, model and serial are required");
    const client=await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const device=(await client.query(`SELECT d.*,(SELECT p.config->>'deviceType' FROM payload_profile_revisions p WHERE p.id=d.payload_profile_revision_id) AS profile_device_type,EXISTS(SELECT 1 FROM billing_meters b WHERE b.device_id=d.id AND b.active) AS billing FROM devices d WHERE d.id=$1 FOR UPDATE`,[id])).rows[0];
      if(!device)throw new NotFoundException("Device not found");
      if(device.billing && !revision.config.fields.some(f=>f.role==='billing-import'))throw new BadRequestException("Billing meter requires billing-import profile");
      if(!device.external_device_id)throw new BadRequestException("Device has no payload identity");
      if(device.profile_device_type&&device.profile_device_type!==revision.config.deviceType)throw new BadRequestException('Profile device type cannot change');
      if((device.device_type==='logger') !== (revision.config.deviceType==='solar-logger'))throw new BadRequestException("Profile device type cannot change");
      await this.persistDeviceProfile(client,revision,id);
      await client.query("UPDATE devices SET payload_profile_revision_id=$2,name=coalesce($3,name),model=coalesce($4,model),serial_number=coalesce($5,serial_number) WHERE id=$1",[id,revision.id,body.name?.trim()??null,body.model?.trim()??null,body.serialNumber?.trim()??null]);
      await client.query('COMMIT');return {id,payloadProfileRevisionId:revision.id,profileId:revision.config.id,profileVersion:revision.config.version};
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }

  @Get('sites/:id/received-data')
  async receivedSiteData(@Param('id') siteId:string,@Query() query:{search?:string;start?:string;end?:string;page?:string}) {
    const f=siteHistoryFilter(siteId,query);
    const cte=`WITH received AS (
      SELECT ps.id,ps.message_id,ps.site_id,ps.gateway_id,ps.device_id,ps.profile_revision_id,ps.tag,ps.value,ps.unit,ps.raw_value,ps.raw_unit,ps.poll_group,ps.polled_at,ps.measured_at,ps.received_at,ps.quality,ps.communication,pm.message_id AS source_message_id FROM payload_samples ps JOIN payload_messages pm ON pm.id=ps.message_id WHERE ps.site_id=$1
      UNION ALL
      SELECT tr.id,NULL::uuid,tr.site_id,d.gateway_id,tr.device_id,NULL::uuid,coalesce(tr.semantic_field,'total_energy'),tr.normalized_value::double precision,coalesce(tr.unit,''),NULL::double precision,NULL::text,'register',tr.source_time,NULL::timestamptz,tr.received_time,tr.quality,'unknown',tr.ingestion_id
      FROM telemetry_raw tr JOIN devices d ON d.id=tr.device_id WHERE tr.site_id=$1 AND tr.payload_profile_revision_id IS NULL
    )`;
    const from=`FROM received ps JOIN devices d ON d.id=ps.device_id LEFT JOIN payload_profile_revisions p ON p.id=ps.profile_revision_id WHERE ${f.where}`;
    const total=Number((await this.db.query(`${cte} SELECT count(*)::int AS total ${from}`,f.values)).rows[0]?.total??0);
    const rows=(await this.db.query(`${cte} SELECT ps.id,d.name AS "deviceName",d.external_device_id AS "deviceId",ps.source_message_id AS "messageId",ps.tag,ps.value,ps.unit,ps.raw_value AS "rawValue",ps.raw_unit AS "rawUnit",ps.poll_group AS "pollGroup",ps.polled_at AS "polledAt",ps.received_at AS "receivedAt",ps.quality,ps.communication,p.profile_id AS "profileId",p.version AS "profileVersion" ${from} ORDER BY ps.received_at DESC,ps.id DESC,ps.polled_at DESC LIMIT 50 OFFSET $${f.values.length+1}`,[...f.values,f.offset])).rows;
    return {rows,total,page:f.page,pageSize:f.pageSize};
  }

  @Get("sites/:id/payload-config")
  async payloadConfig(@Param("id") siteId:string) {
    const gateway=(await this.db.query(`SELECT g.id AS "gatewayId",s.external_site_id AS "externalSiteId",g.external_gateway_id AS "externalGatewayId",g.endpoint AS "subscriptionTopic",g.mqtt_broker_id AS "mqttBrokerId",b.name AS "brokerName",b.url AS "brokerUrl",b.username AS "brokerUsername",s.latitude,s.longitude,g.polling_interval_seconds AS "pollingIntervalSeconds",g.alert_rules AS "alertRules" FROM sites s JOIN gateways g ON g.site_id=s.id LEFT JOIN mqtt_brokers b ON b.id=g.mqtt_broker_id WHERE s.id=$1`,[siteId])).rows[0];
    if(!gateway)throw new NotFoundException("Site gateway not found");
    if(!gateway.mqttBrokerId){const url=new URL(process.env.MQTT_URL || 'mqtt://localhost:1883');url.username='';url.password='';gateway.brokerName='Broker เริ่มต้นของระบบ';gateway.brokerUrl=url.toString();gateway.brokerUsername=process.env.MQTT_USERNAME||'';}
    const devices=(await this.db.query(`SELECT d.id,d.name,d.model,d.serial_number AS "serialNumber",d.device_type AS "deviceType",d.external_device_id AS "externalDeviceId",p.id AS "profileRevisionId",p.profile_id AS "profileId",p.version AS "profileVersion",p.source_preset_revision_id AS "sourcePresetRevisionId",p.owner_device_id AS "profileOwnerDeviceId",p.config,EXISTS(SELECT 1 FROM billing_meters b WHERE b.device_id=d.id AND b.active) AS "billingMeter",(SELECT bs.source_tag FROM billing_meters b JOIN billing_source_bindings bs ON bs.id=b.billing_source_binding_id WHERE b.device_id=d.id AND b.active LIMIT 1) AS "billingSourceTag" FROM devices d JOIN payload_profile_revisions p ON p.id=d.payload_profile_revision_id WHERE d.site_id=$1 ORDER BY d.name,d.id`,[siteId])).rows.map(d=>{
      const config=validatePayloadProfile(d.config),polledAt=new Date().toISOString(),field=config.fields[0]!;
      const {config:_config,...info}=d;
      return {...info,profileConfig:config,profileDeviceType:config.deviceType,sourceProfileId:config.sourceProfile?.id??config.id,sourceProfileVersion:config.sourceProfile?.version??config.version,fields:config.fields,telemetryTopic:payloadTopic(gateway.externalSiteId,gateway.externalGatewayId,d.externalDeviceId),fixture:{schemaVersion:'1.1',messageType:'telemetry',messageId:randomUUID(),sequence:1,lotNumber:1,siteId:gateway.externalSiteId,gatewayId:gateway.externalGatewayId,device:{deviceId:d.externalDeviceId,deviceType:config.deviceType,profileId:config.sourceProfile?.id??config.id,profileVersion:config.sourceProfile?.version??config.version},pollGroup:field.pollGroup,timestamps:{polledAt,sentAt:polledAt},data:{values:Object.fromEntries(config.fields.filter(f=>f.pollGroup===field.pollGroup).map(f=>[f.sourceTag??f.tag,1])),units:Object.fromEntries(config.fields.filter(f=>f.pollGroup===field.pollGroup).map(f=>[f.sourceTag??f.tag,f.sourceUnit]))},quality:{status:'good',communication:'online'}}};
    });
    const rejections=(await this.db.query(`SELECT topic,reason,received_at AS "receivedAt" FROM payload_rejections WHERE site_id=$1 ORDER BY received_at DESC,id DESC LIMIT 100`,[siteId])).rows;
    const unmappedMessages=(await this.db.query(`SELECT pm.device_id AS "deviceId",d.external_device_id AS "externalDeviceId",d.name AS "deviceName",pm.message_id AS "messageId",pm.unmapped,pm.accepted_at AS "receivedAt" FROM payload_messages pm JOIN devices d ON d.id=pm.device_id WHERE pm.gateway_id=$1 AND pm.unmapped<>'[]'::jsonb ORDER BY pm.accepted_at DESC,pm.id DESC LIMIT 20`,[gateway.gatewayId])).rows;
    const reception=new PayloadReceptionSettings(this.db);
    const receiveRevision=await reception.read(gateway.gatewayId);
    const standard=gateway.subscriptionTopic?.startsWith("solar/v1/");
    const bundleFixture=standard&&gateway.externalSiteId&&gateway.externalGatewayId?await reception.fixtures(siteId):null;
    return {siteId,...gateway,protocolMode:standard?"standard":"legacy",ackTopic:standard && gateway.externalSiteId && gateway.externalGatewayId ? gatewayPrefix(gateway.externalSiteId,gateway.externalGatewayId)+'/dataAcept' : null,devices,rejections,unmappedMessages,receiveRevision,bundleFixture};
  }

  @Post('sites/:id/payload-import')
  async importPayloadConfiguration(@Param('id') siteId:string,@Body() body:{baseVersion:number;devices:{name:string;model:string;serialNumber:string;externalDeviceId:string;payloadProfileRevisionId:string}[];config:unknown}) {
    if(!Number.isInteger(body.baseVersion)||body.baseVersion<0||!Array.isArray(body.devices)||body.devices.length>32)throw new BadRequestException('Invalid import configuration');
    const config=validateReceiveConfig(body.config);
    const planned=await Promise.all(body.devices.map(async d=>{externalIdentifier(d.externalDeviceId);if(!d.name?.trim()||!d.model?.trim()||!d.serialNumber?.trim())throw new BadRequestException('Device name, model and serial required');const registered=(await this.db.query('SELECT id FROM devices WHERE site_id=$1 AND external_device_id=$2 AND payload_profile_revision_id=$3',[siteId,d.externalDeviceId,d.payloadProfileRevisionId])).rows[0];return {...d,revision:await this.getPayloadRevision(d.payloadProfileRevisionId,registered?.id)};}));
    if(new Set(planned.map(d=>d.externalDeviceId)).size!==planned.length)throw new BadRequestException('Duplicate imported device ID');
    const client=await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const gateway=(await client.query(`SELECT g.id FROM gateways g JOIN sites s ON s.id=g.site_id WHERE s.id=$1 AND s.status<>'archived' AND s.external_site_id IS NOT NULL AND g.external_gateway_id IS NOT NULL AND g.endpoint LIKE 'solar/v1/%' FOR UPDATE OF g`,[siteId])).rows[0];
      if(!gateway)throw new BadRequestException('Standard gateway not found');
      const previous=(await client.query('SELECT version FROM gateway_payload_receive_revisions WHERE gateway_id=$1 ORDER BY version DESC LIMIT 1',[gateway.id])).rows[0];
      if((previous?.version??0)!==body.baseVersion)throw new BadRequestException('Configuration changed; reload before importing');
      const existing=(await client.query(`SELECT d.external_device_id AS "externalDeviceId",d.payload_profile_revision_id AS "profileRevisionId",p.config FROM devices d JOIN payload_profile_revisions p ON p.id=d.payload_profile_revision_id WHERE d.gateway_id=$1 FOR SHARE OF d`,[gateway.id])).rows;
      for(const d of planned){const found=existing.find(e=>e.externalDeviceId===d.externalDeviceId);if(found){if(found.profileRevisionId!==d.payloadProfileRevisionId)throw new BadRequestException('Import cannot change an existing profile');continue;}
        await client.query(`INSERT INTO devices(id,gateway_id,site_id,name,model,serial_number,device_type,slave_id,status,external_device_id,payload_profile_revision_id) VALUES($1,$2,$3,$4,$5,$6,$7,1,'offline',$8,$9)`,[randomUUID(),gateway.id,siteId,d.name.trim(),d.model.trim(),d.serialNumber.trim(),d.revision.config.deviceType.includes('logger')?'logger':'meter',d.externalDeviceId,d.revision.id]);
      }
      new PayloadReceptionSettings(this.db).validateTargets(config,[...existing,...planned.map(d=>({externalDeviceId:d.externalDeviceId,config:d.revision.config}))]);
      await client.query('INSERT INTO gateway_payload_receive_revisions(id,gateway_id,version,config) VALUES($1,$2,$3,$4::jsonb)',[randomUUID(),gateway.id,body.baseVersion+1,JSON.stringify(config)]);
      await client.query('COMMIT');return {version:body.baseVersion+1};
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }

  @Patch('sites/:id/payload-receive')
  async savePayloadReceive(@Param('id') siteId:string,@Body() body:unknown) {
    return new PayloadReceptionSettings(this.db).save(siteId,body);
  }

  @Post('sites/:id/payload-preview')
  async previewPayloadReceive(@Param('id') siteId:string,@Body() body:{config:unknown;input:unknown;topic:string}) {
    try { return await new PayloadReceptionSettings(this.db).preview(siteId,body); }
    catch(error){if(error instanceof NotFoundException)throw error;throw new BadRequestException(error instanceof Error?error.message:'Invalid preview input');}
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
  const topic=requested?.trim();
  if(topic){
    if(topic.startsWith('solar/v1/'))throw new BadRequestException('Solar telemetry topics require Data profile mode and matching telemetry Site ID, Gateway ID and Device ID; Register preset mode uses energy/{Gateway name}/#');
    const prefix=topic.startsWith('/')?`/${name}/`:`energy/${name}/`;
    if(!topic.startsWith(prefix)||Buffer.byteLength(topic)>1024||topic.includes('\u0000')||topic.split('/').some((part,index,all)=>(part.includes('#')&&(part!=='#'||index!==all.length-1))||(part.includes('+')&&part!=='+')))throw new BadRequestException('MQTT Topic must belong to this Gateway and use valid wildcards');
    return topic;
  }
  return `energy/${name}/#`;
}
function payloadSubscription(site:string,gateway:string,requested?:string){
  const topic=requested?.trim()||payloadTopic(site,gateway);
  const prefix=`${gatewayPrefix(site,gateway)}/devices/`;
  const device=topic.startsWith(prefix)&&topic.endsWith('/telemetry')?topic.slice(prefix.length,-'/telemetry'.length):'';
  if(device!=='+'&&!/^[A-Za-z0-9_-]{1,128}$/.test(device))throw new BadRequestException('Payload Topic must match this site/Gateway and end with devices/+/telemetry or devices/{deviceId}/telemetry');
  return topic;
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

function externalIdentifier(value:unknown) {if(typeof value!=="string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value))throw new BadRequestException("External identifiers must contain 1–128 letters, digits, underscores or hyphens");}
