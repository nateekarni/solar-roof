import { BadRequestException, Body, ConflictException, Controller, Get, Inject, Post } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { Roles } from '../../common/roles.decorator.js';
import { validatePayloadProfile } from '../telemetry/payload-profile.js';
@Controller('v1/settings/payload-presets')
export class PayloadPresetsController {
 constructor(@Inject(DatabaseService) private readonly db:DatabaseService){}
 @Get() async list(){return (await this.db.query(`SELECT id,profile_id AS "profileId",version,config,created_at AS "createdAt" FROM payload_profile_revisions ORDER BY profile_id,created_at DESC,id`)).rows;}
 @Roles('owner','admin') @Post() async create(@Body() body:{config?:unknown}) {
  let config;try{config=validatePayloadProfile(body.config);}catch(error){throw new BadRequestException(error instanceof Error?error.message:'Invalid profile');}
  try{return (await this.db.query(`INSERT INTO payload_profile_revisions(id,profile_id,version,config) VALUES ($1,$2,$3,$4::jsonb) RETURNING id,profile_id AS "profileId",version,config,created_at AS "createdAt"`,[randomUUID(),config.id,config.version,JSON.stringify(config)])).rows[0];}
  catch(error){if((error as {code?:string}).code==='23505')throw new ConflictException('Profile version already exists; use a new version');throw error;}
 }
}
