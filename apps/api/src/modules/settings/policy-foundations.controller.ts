import {randomUUID} from 'node:crypto';
import {Body,Controller,Get,Inject,Post,Req} from '@nestjs/common';
import {Roles} from '../../common/roles.decorator.js';
import {DatabaseService} from '../../database/database.service.js';
import {normalizeHuaweiAlarmSeed,validateLateFeePolicy} from './policy-foundations.js';

@Controller('v1/settings')
export class PolicyFoundationsController{
 constructor(@Inject(DatabaseService)private readonly db:DatabaseService){}

 @Get('critical-alarm-rules')
 @Roles('admin')
 async alarmRules(){return (await this.db.query(`SELECT id,version,provider,provenance,rules,content_hash AS "contentHash",created_at AS "createdAt" FROM critical_alarm_rule_versions ORDER BY version DESC`)).rows;}

 @Post('critical-alarm-rules/import')
 @Roles('admin')
 async importAlarmRules(@Body() body:unknown,@Req() req:{user?:{id:string}}){
  const seed=normalizeHuaweiAlarmSeed(body);
  return this.db.transaction(async client=>{
   await client.query("SELECT pg_advisory_xact_lock(hashtext('critical-alarm-rules:huawei'))");
   const existing=(await client.query('SELECT id,version,content_hash AS "contentHash" FROM critical_alarm_rule_versions WHERE content_hash=$1',[seed.contentHash])).rows[0];if(existing)return {...existing,unchanged:true};
   const version=Number((await client.query("SELECT coalesce(max(version),0)+1 AS version FROM critical_alarm_rule_versions WHERE provider='huawei'")).rows[0].version);
   const row=(await client.query(`INSERT INTO critical_alarm_rule_versions(id,version,provider,provenance,rules,content_hash,imported_by) VALUES($1,$2,'huawei',$3::jsonb,$4::jsonb,$5,$6) RETURNING id,version,content_hash AS "contentHash"`,[randomUUID(),version,JSON.stringify(seed.provenance),JSON.stringify(seed.rules),seed.contentHash,req.user?.id])).rows[0];
   await client.query("INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,after_json,correlation_id) VALUES($1,$2,'technical.alarm_rules.imported','critical_alarm_rule_version',$3,$4::jsonb,$5)",[randomUUID(),req.user?.id,row.id,JSON.stringify({version,provider:'huawei',contentHash:seed.contentHash,provenance:seed.provenance}),randomUUID()]);return row;
  });
 }

 @Get('late-fee-policy')
 @Roles('owner','accountant')
 async lateFeePolicy(){const row=(await this.db.query(`SELECT id,version,enabled,config,created_at AS "createdAt" FROM late_fee_policy_versions ORDER BY version DESC LIMIT 1`)).rows[0];return row??{version:0,enabled:false,config:{reason:'Unconfigured: awaiting approved rate and conditions'}};}

 @Post('late-fee-policy')
 @Roles('owner')
 async saveLateFeePolicy(@Body() body:unknown,@Req() req:{user?:{id:string}}){const config=validateLateFeePolicy(body);return this.db.transaction(async client=>{await client.query("SELECT pg_advisory_xact_lock(hashtext('late-fee-policy'))");const version=Number((await client.query('SELECT coalesce(max(version),0)+1 AS version FROM late_fee_policy_versions')).rows[0].version);const row=(await client.query('INSERT INTO late_fee_policy_versions(id,version,enabled,config,created_by) VALUES($1,$2,false,$3::jsonb,$4) RETURNING id,version,enabled,config',[randomUUID(),version,JSON.stringify(config),req.user?.id])).rows[0];await client.query("INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,after_json,correlation_id) VALUES($1,$2,'business.late_fee_policy.versioned','late_fee_policy_version',$3,$4::jsonb,$5)",[randomUUID(),req.user?.id,row.id,JSON.stringify(row),randomUUID()]);return row;});}
}
