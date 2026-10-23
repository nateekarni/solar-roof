import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DatabaseService } from '../../database/database.service.js';
import { validatePayloadProfile, type PayloadProfile } from '../telemetry/payload-profile.js';
const sourceSchema=z.object({deviceId:z.string().min(1),profileRevisionId:z.string().min(1),sourceTag:z.string().min(1),canonicalTag:z.literal('energy.active.import.total'),sourceUnit:z.string(),targetUnit:z.literal('kWh'),conversion:z.enum(['identity','wh-to-kwh','auto-v1']),measurementPurpose:z.enum(['solar-delivered','grid-import','facility-consumption','other']),purposeDescription:z.string().trim().max(1000).optional(),billingImpactConfirmed:z.boolean().optional()}).strict();
export type BillingSourceInput=z.infer<typeof sourceSchema>;
export function validateBillingSource(input:unknown,profile:PayloadProfile):BillingSourceInput {
 try{
  const source=sourceSchema.parse(input),p=validatePayloadProfile(profile);
  const fields=p.fields.filter(f=>f.role==='billing-import');
  if(fields.length!==1)throw Error('Exactly one cumulative billing field required');
  const field=fields[0]!;
  if((field.sourceTag??field.tag)!==source.sourceTag||field.tag!==source.canonicalTag||field.sourceUnit!==source.sourceUnit||field.targetUnit!==source.targetUnit||field.conversion!==source.conversion)throw Error('Billing source does not match pinned profile field');
  if(source.measurementPurpose==='other'&&!source.purposeDescription)throw Error('Physical measurement purpose description required');
  return source;
 }catch(error){throw new BadRequestException(error instanceof Error?error.message:'Invalid billing source');}
}
function view(row:any){if(!row)return null;return {id:row.id,meterId:row.meter_id,siteId:row.site_id,deviceId:row.device_id,profileRevisionId:row.profile_revision_id,sourceTag:row.source_tag,canonicalTag:row.canonical_tag,sourceUnit:row.source_unit,targetUnit:row.target_unit,conversion:row.conversion,measurementPurpose:row.measurement_purpose,purposeDescription:row.purpose_description,createdAt:row.created_at};}
function eligibleFields(config:unknown){
 try{return validatePayloadProfile(config as PayloadProfile).fields.filter(field=>field.role==='billing-import').map(field=>({...field,sourceTag:field.sourceTag??field.tag,canonicalTag:field.tag}));}
 catch{return [];}
}
@Injectable()
export class BillingSourceBindingService {
 constructor(@Inject(DatabaseService) private readonly db:DatabaseService){}
 async get(siteId:string){
  const rows=(await this.db.query(`SELECT b.id AS meter_id,b.billing_source_binding_id,d.id AS device_id,d.name,d.external_device_id,d.payload_profile_revision_id,p.config FROM billing_meters b JOIN devices d ON d.id=b.device_id AND d.site_id=b.site_id LEFT JOIN payload_profile_revisions p ON p.id=d.payload_profile_revision_id WHERE b.site_id=$1 AND b.active=true ORDER BY b.id`,[siteId])).rows;
  if(rows.length!==1){
   const candidates=rows.length?[]:(await this.db.query(`SELECT d.id,d.name,d.external_device_id,d.payload_profile_revision_id,p.config FROM devices d JOIN payload_profile_revisions p ON p.id=d.payload_profile_revision_id WHERE d.site_id=$1 AND d.status<>'disabled' ORDER BY d.name,d.id`,[siteId])).rows.flatMap((device:any)=>{
    const fields=eligibleFields(device.config);
    return fields.length===1?[{id:device.id,name:device.name,externalDeviceId:device.external_device_id,profileRevisionId:device.payload_profile_revision_id,eligibleFields:fields}]:[];
   });
   return {binding:null,device:null,candidates,eligibleFields:[],latestVerifiedReading:null,status:rows.length?'ambiguous-meter':'no-main-meter',formula:'(closing kWh - opening kWh) × contract rate'};
  }
  const meter=rows[0]!,binding=meter.billing_source_binding_id?view((await this.db.query('SELECT * FROM billing_source_bindings WHERE id=$1',[meter.billing_source_binding_id])).rows[0]):null;
  const fields=eligibleFields(meter.config);
  const latest=binding?(await this.db.query(`SELECT id,quality,unit,normalized_value AS "valueKwh",source_time AS "sourceTime",received_time AS "receivedTime",payload_profile_revision_id AS "profileRevisionId",billing_source_binding_id AS "bindingId",source_time>=now()-interval '120 seconds' AND source_time<=now() AS fresh FROM telemetry_raw WHERE site_id=$1 AND device_id=$2 AND billing_source_binding_id=$3 AND source_time<=now() ORDER BY source_time DESC LIMIT 1`,[siteId,meter.device_id,binding.id])).rows[0]??null:null;
  const verified=latest?.quality==='complete'&&latest.unit==='kWh'&&latest.valueKwh!==null&&Number.isFinite(Number(latest.valueKwh))&&Number(latest.valueKwh)>=0;
  return {binding,device:{id:meter.device_id,name:meter.name,externalDeviceId:meter.external_device_id,profileRevisionId:meter.payload_profile_revision_id},candidates:[],eligibleFields:fields,latestVerifiedReading:verified?latest:null,status:!binding?'unbound':binding.profileRevisionId!==meter.payload_profile_revision_id?'profile-changed':latest?(verified?'verified':'invalid-data'):'waiting-for-reading',formula:'(closing kWh - opening kWh) × contract rate'};
 }
 async bind(siteId:string,input:unknown,actorId:string|undefined){
  if(!actorId)throw new ForbiddenException('Authenticated actor required');
  const parsed=sourceSchema.safeParse(input);if(!parsed.success)throw new BadRequestException('Complete billing source identity required');
  return this.db.transaction(async client=>{
   // Serialize first-meter selection at site scope so two admins cannot create
   // different active main meters concurrently.
   const site=(await client.query("SELECT id FROM sites WHERE id=$1 AND status<>'archived' FOR UPDATE",[siteId])).rows[0];if(!site)throw new NotFoundException('Site not found');
   // Device-first order matches configuration application. Never trust a joined
   // profile/binding read from the same statement that may wait for these locks.
   const lockedDevice=(await client.query('SELECT id FROM devices WHERE id=$1 AND site_id=$2 AND status<>\'disabled\' FOR UPDATE',[parsed.data.deviceId,siteId])).rows[0];
   if(!lockedDevice)throw new ConflictException('Selected device is not available at this site');
   await client.query('SELECT id FROM billing_meters WHERE site_id=$1 AND active=true ORDER BY id FOR UPDATE',[siteId]);
   const meters=(await client.query(`SELECT b.*,d.payload_profile_revision_id,p.config FROM billing_meters b JOIN devices d ON d.id=b.device_id AND d.site_id=b.site_id JOIN payload_profile_revisions p ON p.id=d.payload_profile_revision_id WHERE b.site_id=$1 AND b.active=true`,[siteId])).rows;
   if(meters.length>1)throw new ConflictException('Resolve multiple active billing meters before binding');
   let meter=meters[0],reactivated=false;
   if(meter&&meter.device_id!==parsed.data.deviceId)throw new ConflictException('Only the registered main billing meter may be bound');
   if(!meter){
    const device=(await client.query(`SELECT d.id,d.payload_profile_revision_id,p.config FROM devices d JOIN payload_profile_revisions p ON p.id=d.payload_profile_revision_id WHERE d.id=$1 AND d.site_id=$2`,[parsed.data.deviceId,siteId])).rows[0];
    if(!device)throw new ConflictException('Selected device has no active payload profile');
    if(device.payload_profile_revision_id!==parsed.data.profileRevisionId)throw new ConflictException('Device profile changed; reload configuration');
    const source=validateBillingSource(input,device.config);
    const inactive=(await client.query(`SELECT id,billing_source_binding_id FROM billing_meters WHERE site_id=$1 AND device_id=$2 AND semantic_field=$3 FOR UPDATE`,[siteId,source.deviceId,'total_energy'])).rows[0];
    let meterId=inactive?.id;
    if(inactive){await client.query('UPDATE billing_meters SET active=true WHERE id=$1',[inactive.id]);reactivated=true;}
    else {meterId=randomUUID();await client.query(`INSERT INTO billing_meters(id,site_id,device_id,semantic_field,active,billing_source_binding_id) VALUES($1,$2,$3,$4,true,NULL)`,[meterId,siteId,source.deviceId,'total_energy']);}
    meter={id:meterId,device_id:source.deviceId,payload_profile_revision_id:device.payload_profile_revision_id,config:device.config,billing_source_binding_id:inactive?.billing_source_binding_id??null};
   }
   if(meter.payload_profile_revision_id!==parsed.data.profileRevisionId)throw new ConflictException('Device profile changed; reload configuration');
   const source=validateBillingSource(input,meter.config);
   const previous=meter.billing_source_binding_id?(await client.query('SELECT * FROM billing_source_bindings WHERE id=$1',[meter.billing_source_binding_id])).rows[0]:null;
   const prior=view(previous);if(prior&&Object.entries(source).filter(([k])=>k!=='billingImpactConfirmed').every(([k,v])=>(prior as any)[k]===v)){
    if(reactivated)await client.query(`INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,before_json,after_json,reason,correlation_id) VALUES($1,$2,'billing_source.reactivate','site',$3,$4,$5,$6,$7)`,[randomUUID(),actorId,siteId,JSON.stringify({...prior,meterActive:false}),JSON.stringify({...prior,meterActive:true}),'Reactivated main meter with unchanged billing source',randomUUID()]);
    return prior;
   }
   if(previous&&!source.billingImpactConfirmed)throw new ConflictException('Confirm billing impact before replacing source');
   const id=randomUUID();
   const row=(await client.query(`INSERT INTO billing_source_bindings(id,meter_id,site_id,device_id,profile_revision_id,source_tag,canonical_tag,source_unit,target_unit,conversion,measurement_purpose,purpose_description,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,[id,meter.id,siteId,source.deviceId,source.profileRevisionId,source.sourceTag,source.canonicalTag,source.sourceUnit,source.targetUnit,source.conversion,source.measurementPurpose,source.purposeDescription??null,actorId])).rows[0];
   await client.query('UPDATE billing_meters SET billing_source_binding_id=$2 WHERE id=$1',[meter.id,id]);
   await client.query(`INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,before_json,after_json,reason,correlation_id) VALUES($1,$2,'billing_source.bind','site',$3,$4,$5,$6,$7)`,[randomUUID(),actorId,siteId,JSON.stringify(reactivated?{...prior,meterActive:false}:prior),JSON.stringify(reactivated?{...view(row),meterActive:true}:view(row)),reactivated?'Reactivated main meter with explicit physical purpose and prospective source binding':'Explicit physical purpose and prospective source binding',randomUUID()]);
   return view(row);
  });
 }
}


