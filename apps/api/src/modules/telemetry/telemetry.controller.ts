import { BadRequestException, Body, Controller, Delete, Get, Inject, NotFoundException, Param, Post } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { decodeRegisterBatch, type RegisterFieldMapping } from '@solar/domain';
import { DatabaseService } from '../../database/database.service.js';
import { MqttIngestionService } from './mqtt-ingestion.service.js';

@Controller('v1')
export class TelemetryController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService, @Inject(MqttIngestionService) private readonly ingestionService: MqttIngestionService) {}
  @Get('sites/:id/live-telemetry')
  async getLiveTelemetry(@Param('id') siteId: string) {
    const live = await this.ingestionService.getLatestTelemetry(siteId);
    if (live) return live;
    const result = await this.db.query('SELECT id FROM sites WHERE id = $1', [siteId]);
    if (!result.rows.length) throw new NotFoundException('ไม่พบไซต์งาน');
    return null;
  }
  @Get('devices/:id/register-mappings')
  async listDeviceRegisterMappings(@Param('id') deviceId: string) {
    const result = await this.db.query(`SELECT id, device_id AS "deviceId", semantic_field AS "semanticField", register_address AS "registerAddress",
      register_count AS "registerCount", word_order AS "wordOrder", byte_order AS "byteOrder", data_type AS "dataType", scale, unit,
      polling_interval_seconds AS "pollingIntervalSeconds", effective_from AS "effectiveFrom"
      FROM register_mapping_versions WHERE device_id = $1 AND effective_from <= now() AND effective_to IS NULL ORDER BY register_address`, [deviceId]);
    return result.rows;
  }
  @Post('devices/:id/register-mappings')
  async saveDeviceRegisterMapping(@Param('id') deviceId: string, @Body() body: {
    id?: string; semanticField: string; registerAddress: string; registerCount?: number; wordOrder?: string;
    byteOrder?: string; dataType: string; scale: number; unit: string; pollingIntervalSeconds?: number;
  }) {
    const count = Number(body.registerCount ?? 1), scale = Number(body.scale), interval = Number(body.pollingIntervalSeconds ?? 60);
    if (!body.semanticField?.trim() || !body.registerAddress?.trim() || !['uint16','int16','uint32','int32','float32'].includes(body.dataType)
      || !Number.isInteger(count) || count < 1 || count > 4 || !Number.isFinite(scale) || !Number.isInteger(interval) || interval < 1 || interval > 86400
      || !['little_word_first','big_word_first'].includes(body.wordOrder ?? 'little_word_first')
      || !['big_endian','little_endian'].includes(body.byteOrder ?? 'big_endian') || typeof body.unit !== 'string') throw new BadRequestException('Invalid register mapping');
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const device = await client.query('SELECT id FROM devices WHERE id = $1 FOR UPDATE', [deviceId]);
      if (!device.rows.length) throw new NotFoundException('Device not found');
      if (body.id) {
        const previous = await client.query('SELECT id FROM register_mapping_versions WHERE id = $1 AND device_id = $2 AND effective_to IS NULL', [body.id, deviceId]);
        if (!previous.rows.length) throw new BadRequestException('Mapping version is no longer active');
      }
      await client.query('UPDATE register_mapping_versions SET effective_to = transaction_timestamp() WHERE device_id = $1 AND effective_to IS NULL AND (semantic_field = $2 OR id = $3)', [deviceId, body.semanticField, body.id ?? null]);
      const result = await client.query(`INSERT INTO register_mapping_versions
        (id,device_id,semantic_field,register_address,register_count,word_order,byte_order,data_type,scale,unit,polling_interval_seconds,effective_from)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,transaction_timestamp()) RETURNING *`,
        [randomUUID(),deviceId,body.semanticField.trim(),body.registerAddress.trim(),count,body.wordOrder ?? 'little_word_first',body.byteOrder ?? 'big_endian',body.dataType,scale,body.unit,interval]);
      await client.query('COMMIT'); return result.rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  @Delete('devices/:id/register-mappings/:mappingId')
  async deleteDeviceRegisterMapping(@Param('id') deviceId: string, @Param('mappingId') mappingId: string) {
    const result = await this.db.query('UPDATE register_mapping_versions SET effective_to = now() WHERE id = $1 AND device_id = $2 AND effective_to IS NULL RETURNING id', [mappingId,deviceId]);
    if (!result.rows.length) throw new NotFoundException('Active mapping not found');
    return { success: true, message: 'Mapping retired; historical version preserved' };
  }
  @Post('devices/:id/test-decode')
  async testRegisterDecode(@Param('id') deviceId: string, @Body() body: { registers: Record<string, number> | number[]; mappings?: RegisterFieldMapping[] }) {
    if (!body.registers) throw new BadRequestException('Registers data is required');
    const mappings = body.mappings?.length ? body.mappings : await this.ingestionService.getDeviceMappings(deviceId);
    return { success: true, results: decodeRegisterBatch(body.registers, mappings) };
  }
}
