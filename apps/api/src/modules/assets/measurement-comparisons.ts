import { randomUUID } from 'node:crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import type { DatabaseService } from '../../database/database.service.js';
import { compareWindow } from './gateway-reconciliation.js';
import { lockGatewayReference } from './gateway-lifecycle.js';

const pairInput=z.object({leftDeviceId:z.uuid(),rightDeviceId:z.uuid(),leftTag:z.string().min(1).max(128),rightTag:z.string().min(1).max(128),kind:z.enum(['energy','power']),relativeTolerance:z.number().finite().min(0).max(1).default(0.05),absoluteFloor:z.number().finite().min(0).default(0.1),windowSeconds:z.number().int().min(900).max(86400).default(900)}).strict();
export class MeasurementComparisons {
 constructor(private db:DatabaseService){}
 async list(gatewayId:string){
  return (await this.db.query(`SELECT p.id,p.left_device_id AS "leftDeviceId",p.right_device_id AS "rightDeviceId",p.left_tag AS "leftTag",p.right_tag AS "rightTag",p.kind,p.relative_tolerance AS "relativeTolerance",p.absolute_floor AS "absoluteFloor",p.window_seconds AS "windowSeconds",p.alert_enabled AS "alertEnabled",p.commissioned_at AS "commissionedAt",(SELECT jsonb_build_object('state',w.state,'result',w.result,'windowStart',w.window_start,'windowEnd',w.window_end) FROM measurement_comparison_windows w WHERE w.pair_id=p.id ORDER BY w.window_start DESC LIMIT 1) AS latest FROM measurement_comparison_pairs p WHERE gateway_id=$1 ORDER BY created_at,id`,[gatewayId])).rows;
 }
 async create(gatewayId:string,input:unknown){
  const defaults=(await this.db.query(`SELECT key,value FROM system_settings WHERE key=ANY($1::text[])`,[['comparisonRelativeTolerance','comparisonEnergyAbsoluteFloor','comparisonPowerAbsoluteFloor','comparisonWindowSeconds']])).rows;
  const stored=Object.fromEntries(defaults.map(row=>[row.key,Number(row.value)]));
  const supplied=input&&typeof input==='object'&&!Array.isArray(input)?input as Record<string,unknown>:{};
  const parsed=pairInput.safeParse({relativeTolerance:stored.comparisonRelativeTolerance??0.05,absoluteFloor:(supplied.kind==='power'?stored.comparisonPowerAbsoluteFloor:stored.comparisonEnergyAbsoluteFloor)??0.1,windowSeconds:stored.comparisonWindowSeconds??900,...supplied});if(!parsed.success)throw new BadRequestException('Invalid measurement pair');const p=parsed.data;
  if(p.leftDeviceId===p.rightDeviceId)throw new BadRequestException('Choose independent devices');
  return this.db.transaction(async client=>{
   const gateway=await lockGatewayReference(client,gatewayId);
   const devices=(await client.query(`SELECT d.id,p.config FROM devices d JOIN payload_profile_revisions p ON p.id=d.payload_profile_revision_id JOIN gateways g ON g.id=d.gateway_id WHERE d.id=ANY($1::uuid[]) AND d.gateway_id=$2 AND d.site_id=$3 AND g.retired_at IS NULL ORDER BY d.id FOR SHARE OF d`,[[p.leftDeviceId,p.rightDeviceId],gatewayId,gateway.site_id])).rows;
   for(const [deviceId,tag] of [[p.leftDeviceId,p.leftTag],[p.rightDeviceId,p.rightTag]]){
    const device=devices.find(d=>d.id===deviceId),field=device?.config?.fields?.find((f:any)=>f.tag===tag);
    if(!field||!(p.kind==='energy'?['Wh','kWh'].includes(field.targetUnit):['W','kW'].includes(field.targetUnit)))throw new BadRequestException('Pair source must be a registered field with compatible canonical units in this gateway');
   }
   const id=randomUUID();await client.query(`INSERT INTO measurement_comparison_pairs(id,gateway_id,left_device_id,right_device_id,left_tag,right_tag,kind,relative_tolerance,absolute_floor,window_seconds) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,gatewayId,p.leftDeviceId,p.rightDeviceId,p.leftTag,p.rightTag,p.kind,p.relativeTolerance,p.absoluteFloor,p.windowSeconds]);
   await client.query(`INSERT INTO measurement_comparison_dirty(pair_id,from_time) SELECT $1,min(coalesce(measured_at,polled_at)) FROM payload_samples WHERE device_id=ANY($2::uuid[]) HAVING count(*)>0`,[id,[p.leftDeviceId,p.rightDeviceId]]);
   return {id,...p,alertEnabled:false};
  });
 }
 async commission(gatewayId:string,pairId:string,input:unknown){
  const parsed=z.object({alertEnabled:z.boolean(),commissioningConfirmed:z.literal(true)}).strict().safeParse(input);if(!parsed.success)throw new BadRequestException('Commissioning confirmation required');
  const result=await this.db.query(`UPDATE measurement_comparison_pairs SET alert_enabled=$3,commissioned_at=coalesce(commissioned_at,now()) WHERE id::text=$1 AND gateway_id=$2 AND (NOT $3 OR EXISTS(SELECT 1 FROM measurement_comparison_windows WHERE pair_id=measurement_comparison_pairs.id AND state IN ('ok','mismatch'))) RETURNING id,alert_enabled AS "alertEnabled",commissioned_at AS "commissionedAt"`,[pairId,gatewayId,parsed.data.alertEnabled]);
  if(!result.rows[0])throw new BadRequestException('Run a valid comparison preview before enabling alerts');return result.rows[0];
 }
 async recomputeNext(){
  return this.db.transaction(async client=>{
   // Peek without a queue lock, then reference site/gateway before claiming work.
   // A busy parent is skipped with NOWAIT just like a busy queue row. Roll back
   // each unsuccessful candidate's locks so unrelated pairs remain runnable.
   const candidates=(await client.query(`SELECT q.pair_id,p.gateway_id,g.site_id FROM measurement_comparison_dirty q
    JOIN measurement_comparison_pairs p ON p.id=q.pair_id JOIN gateways g ON g.id=p.gateway_id ORDER BY q.from_time,q.pair_id`)).rows;
   let job:(typeof candidates)[number]|undefined;
   for(const candidate of candidates){
    await client.query('SAVEPOINT comparison_candidate');
    const abandon=async()=>{await client.query('ROLLBACK TO SAVEPOINT comparison_candidate');await client.query('RELEASE SAVEPOINT comparison_candidate');};
    try{
     // Historical comparisons retain their prior archived/retired eligibility.
     const site=(await client.query('SELECT id FROM sites WHERE id=$1 FOR KEY SHARE NOWAIT',[candidate.site_id])).rows[0];
     const gateway=site&&(await client.query('SELECT id FROM gateways WHERE id=$1 AND site_id=$2 FOR KEY SHARE NOWAIT',[candidate.gateway_id,candidate.site_id])).rows[0];
     if(!gateway){await abandon();continue;}
     job=(await client.query(`SELECT q.pair_id,q.from_time,p.*,l.expected_interval_seconds AS left_cadence,r.expected_interval_seconds AS right_cadence,l.poll_group_cadence AS left_groups,r.poll_group_cadence AS right_groups FROM measurement_comparison_dirty q JOIN measurement_comparison_pairs p ON p.id=q.pair_id JOIN devices l ON l.id=p.left_device_id JOIN devices r ON r.id=p.right_device_id WHERE q.pair_id=$1 AND p.gateway_id=$2 ORDER BY q.from_time FOR UPDATE OF q SKIP LOCKED LIMIT 1`,[candidate.pair_id,candidate.gateway_id])).rows[0];
     if(!job){await abandon();continue;}
     await client.query('RELEASE SAVEPOINT comparison_candidate');break;
    }catch(error){await abandon();if((error as {code?:string}).code!=='55P03')throw error;}
   }
   if(!job)return false;
   const profileGroups=(await client.query(`SELECT d.id,(SELECT f->>'pollGroup' FROM jsonb_array_elements(p.config->'fields') f WHERE f->>'tag'=CASE WHEN d.id=$1 THEN $3 ELSE $4 END) AS poll_group FROM devices d JOIN payload_profile_revisions p ON p.id=d.payload_profile_revision_id WHERE d.id=ANY($2::uuid[])`,[job.left_device_id,[job.left_device_id,job.right_device_id],job.left_tag,job.right_tag])).rows;
   const leftCadence=Number(job.left_groups[profileGroups.find(d=>d.id===job.left_device_id)?.poll_group]??job.left_cadence),rightCadence=Number(job.right_groups[profileGroups.find(d=>d.id===job.right_device_id)?.poll_group]??job.right_cadence);
   const seconds=Math.max(900,job.window_seconds,2*leftCadence,2*rightCadence),duration=seconds*1000;
   let start=Math.floor(new Date(job.from_time).getTime()/duration)*duration;
   // Recompute the preceding window too: a late endpoint can change its closing counter.
   start=Math.max(0,start-duration);
   const newest=(await client.query(`SELECT max(coalesce(measured_at,polled_at)) AS time FROM payload_samples WHERE device_id=ANY($1::uuid[])`,[[job.left_device_id,job.right_device_id]])).rows[0]?.time;
   const last=Math.floor(new Date(newest??Date.now()).getTime()/duration)*duration;
   for(let i=0;i<12&&start<last;i++,start+=duration){
    const bracket=Math.max(leftCadence,rightCadence)*1000;
    const samples=(await client.query(`SELECT device_id,coalesce(measured_at,polled_at) AS time,value,unit,quality,communication FROM payload_samples WHERE ((device_id=$1 AND tag=$3) OR (device_id=$2 AND tag=$4)) AND coalesce(measured_at,polled_at)>=$5 AND coalesce(measured_at,polled_at)<=$6 ORDER BY coalesce(measured_at,polled_at),received_at`,[job.left_device_id,job.right_device_id,job.left_tag,job.right_tag,new Date(start-bracket),new Date(start+duration+bracket)])).rows;
    const points=(id:string)=>samples.filter(s=>s.device_id===id).map(s=>({time:new Date(s.time).getTime(),value:Number(s.value)/((job.kind==='power'&&s.unit==='W'||job.kind==='energy'&&s.unit==='Wh')?1000:1),quality:['online','ok','connected','success'].includes(s.communication)?s.quality:'invalid'}));
    const result=compareWindow({kind:job.kind,left:points(job.left_device_id),right:points(job.right_device_id),leftCadenceSeconds:leftCadence,rightCadenceSeconds:rightCadence,windowSeconds:seconds,windowStart:start,windowEnd:start+duration,relativeTolerance:job.relative_tolerance,absoluteFloor:job.absolute_floor});
    await client.query(`INSERT INTO measurement_comparison_windows(pair_id,window_start,window_end,state,result) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(pair_id,window_start) DO UPDATE SET window_end=EXCLUDED.window_end,state=EXCLUDED.state,result=EXCLUDED.result,computed_at=now()`,[job.id,new Date(start),new Date(start+duration),result.state,JSON.stringify(result)]);
   }
   if(start<last)await client.query('UPDATE measurement_comparison_dirty SET from_time=$2 WHERE pair_id=$1',[job.id,new Date(start+duration)]);
   else await client.query('DELETE FROM measurement_comparison_dirty WHERE pair_id=$1',[job.id]);
   const setting=(await client.query(`SELECT value FROM system_settings WHERE key='comparisonConsecutiveWindows'`)).rows[0];
   const consecutive=Math.min(20,Math.max(1,Number(setting?.value??3)));
   const recent=(await client.query(`SELECT state,window_start FROM measurement_comparison_windows WHERE pair_id=$1 AND state IN ('ok','mismatch') ORDER BY window_start DESC LIMIT $2`,[job.id,consecutive])).rows;
   if(job.alert_enabled&&recent.length===consecutive&&recent.every(w=>w.state==='mismatch'))await client.query(`INSERT INTO alerts(id,site_id,gateway_id,severity,title,detail,status,occurred_at,comparison_pair_id,comparison_window_start) SELECT $1,g.site_id,g.id,'warning','ค่าตรวจเทียบต่างกันเกินเกณฑ์','หน้าต่างตรวจเทียบที่มีข้อมูลครบต่างกันเกินเกณฑ์ต่อเนื่อง แหล่งข้อมูลออกบิลยังคงเดิม','open',now(),$2,$4 FROM gateways g WHERE g.id=$3 ON CONFLICT DO NOTHING`,[randomUUID(),job.id,job.gateway_id,recent[0]!.window_start]);
   return true;
  });
 }
}
