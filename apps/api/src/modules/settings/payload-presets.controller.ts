import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Inject, NotFoundException, Param, Post } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { Roles } from '../../common/roles.decorator.js';
import { validatePayloadProfile } from '../telemetry/payload-profile.js';
import {normalizePayloadEnvelope} from '../telemetry/payload-profile.js';
import {decodePayloadMessages,validateReceiveConfig} from '../telemetry/payload-receive.js';
@Controller('v1/settings/payload-presets')
export class PayloadPresetsController {
 constructor(@Inject(DatabaseService) private readonly db:DatabaseService){}
 @Get() async list(){return (await this.db.query(`SELECT p.id,p.profile_id AS "profileId",p.version,p.config,p.created_at AS "createdAt" FROM payload_profile_revisions p WHERE p.owner_device_id IS NULL AND NOT EXISTS(SELECT 1 FROM payload_preset_archives a WHERE a.profile_id=p.profile_id) ORDER BY p.profile_id,p.created_at DESC,p.id`)).rows;}
 @Roles('admin') @Post() async create(@Body() body:{config?:unknown}) {
  let config;try{config=validatePayloadProfile(body.config);if(config.id.startsWith('local-'))throw Error('Local profile IDs are reserved');}catch(error){throw new BadRequestException(error instanceof Error?error.message:'Invalid profile');}
  try{const row=(await this.db.query(`INSERT INTO payload_profile_revisions(id,profile_id,version,config) SELECT $1,$2,$3,$4::jsonb WHERE NOT EXISTS(SELECT 1 FROM payload_preset_archives WHERE profile_id=$2) RETURNING id,profile_id AS "profileId",version,config,created_at AS "createdAt"`,[randomUUID(),config.id,config.version,JSON.stringify(config)])).rows[0];if(!row)throw new ConflictException('Preset was deleted; save with a new Preset ID');return row;}
  catch(error){if((error as {code?:string}).code==='23505')throw new ConflictException('Profile version already exists; use a new version');throw error;}
 }
 @Roles('admin') @Delete(':id') async remove(@Param('id') id:string){
  if(!/^[0-9a-f-]{36}$/i.test(id))throw new BadRequestException('Invalid revision ID');
  const row=(await this.db.query(`INSERT INTO payload_preset_archives(profile_id) SELECT profile_id FROM payload_profile_revisions WHERE id=$1 AND owner_device_id IS NULL ON CONFLICT(profile_id) DO UPDATE SET archived_at=now() RETURNING profile_id AS "profileId"`,[id])).rows[0];
  if(!row)throw new NotFoundException('Preset not found');return {archived:true,...row};
 }
 @Roles('admin') @Post('preview') preview(@Body() body:{config:unknown;input:unknown}){
  try{
   if(Buffer.byteLength(JSON.stringify(body.input)??'')>262144)throw Error('Preview exceeds 256 KiB');
   const profile=validatePayloadProfile(body.config),decoded=decodePayloadMessages(body.input,validateReceiveConfig({}));
   return {persisted:false,ignored:decoded.ignored,errors:decoded.errors,messages:decoded.messages.map(message=>{
    try{const e=message.envelope as {siteId:string;gatewayId:string;device:{deviceId:string}};
     const n=normalizePayloadEnvelope(e,{profile,siteId:e.siteId,gatewayId:e.gatewayId,deviceId:e.device.deviceId},`solar/v1/sites/${e.siteId}/gateways/${e.gatewayId}/devices/${e.device.deviceId}/telemetry`);
     return {key:message.key,status:'valid',samples:n.samples,unmapped:n.unmapped};
    }catch(error){return {key:message.key,status:'rejected',reason:error instanceof Error?error.message:'Invalid payload'};}
   })};
  }catch(error){throw new BadRequestException(error instanceof Error?error.message:'Invalid preview');}
 }
}
