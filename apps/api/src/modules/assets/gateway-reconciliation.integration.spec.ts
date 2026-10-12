import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { MeasurementComparisons } from './measurement-comparisons.js';
import { acknowledgeGatewayConfiguration,snapshotGatewayConfiguration,recordGatewayPublished } from './gateway-lifecycle.js';
import { AssetsController } from './assets.controller.js';
import { MqttIngestionService } from '../telemetry/mqtt-ingestion.service.js';
import {DashboardService} from '../dashboard/dashboard.service.js';

test('local rollback integration persists independent comparisons and version lifecycle without financial changes',{skip:process.env.GATEWAY_LOCAL_INTEGRATION!=='true'},async()=>{
 const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15449');
 const pool=new Pool({connectionString:url.toString()}),client=await pool.connect();
 try{
  await client.query('BEGIN');
  const installed=(await client.query("SELECT 1 FROM information_schema.columns WHERE table_name='gateways' AND column_name='retired_at'")).rows.length;
  if(!installed)await client.query(readFileSync(new URL('../../../../../infra/migrations/048_gateway_reconciliation.sql',import.meta.url),'utf8'));
  if(!(await client.query("SELECT to_regclass('measurement_comparison_dirty') AS installed")).rows[0].installed)await client.query(readFileSync(new URL('../../../../../infra/migrations/050_gateway_continuous_comparison.sql',import.meta.url),'utf8'));
  if(!(await client.query("SELECT to_regclass('gateway_dashboard_sources') AS installed")).rows[0].installed)await client.query(readFileSync(new URL('../../../../../infra/migrations/052_dashboard_production_sources.sql',import.meta.url),'utf8'));
  const customer=(await client.query('SELECT id FROM customers LIMIT 1')).rows[0];assert.ok(customer);
  const site=randomUUID(),gateway=randomUUID(),left=randomUUID(),right=randomUUID();
  await client.query(`INSERT INTO sites(id,customer_id,name,capacity_mwp,external_site_id) VALUES($1,$2,'Gateway rollback test',1,$3)`,[site,customer.id,`S${site.slice(0,8)}`]);
  await client.query(`INSERT INTO gateways(id,site_id,name,protocol,endpoint,external_gateway_id) VALUES($1,$2,$3,'mqtt',$4,$5)`,[gateway,site,`G${gateway.slice(0,8)}`,`solar/v1/sites/S${site.slice(0,8)}/gateways/G${gateway.slice(0,8)}/devices/+/telemetry`,`G${gateway.slice(0,8)}`]);
  const profile=(await client.query("SELECT id FROM payload_profile_revisions WHERE profile_id='schneider-pm2230' LIMIT 1")).rows[0];
  for(const id of [left,right])await client.query(`INSERT INTO devices(id,gateway_id,site_id,name,model,serial_number,device_type,external_device_id,payload_profile_revision_id,expected_interval_seconds) VALUES($1,$2,$3,$4,'Test',$4,'meter',$4,$5,450)`,[id,gateway,site,`D${id.slice(0,8)}`,profile.id]);
  const db={query:(sql:string,values:unknown[]=[])=>client.query(sql,values),transaction:async(fn:(c:any)=>any)=>fn(client)} as any;
  const controller=new AssetsController(db,{refreshSubscriptions:async()=>{},publishHardwareConfig:async()=>false} as any),admin={user:{role:'admin'}};
  assert.equal((await controller.listGateways(admin)).filter(g=>g.id===gateway).length,1);
  assert.equal((await controller.gatewaySiteOptions(undefined,admin)).filter(g=>g.id===site).length,0);
  const configured=await controller.configureGateway(site,{name:`G${gateway.slice(0,8)}`,topicContract:'legacy-energy'} as any);assert.equal(configured.endpoint,`energy/G${gateway.slice(0,8)}/#`);
  assert.equal((await client.query('SELECT desired_config_version FROM gateways WHERE id=$1',[gateway])).rows[0].desired_config_version,1);
  await controller.configureGateway(site,{name:`G${gateway.slice(0,8)}`});
  assert.equal((await client.query('SELECT endpoint FROM gateways WHERE id=$1',[gateway])).rows[0].endpoint,`energy/G${gateway.slice(0,8)}/#`);
  await controller.saveDeviceCadence(left,{expectedIntervalSeconds:450,pollGroups:{energy:450,realtime:10}});
  assert.equal((await client.query('SELECT desired_config_version FROM gateways WHERE id=$1',[gateway])).rows[0].desired_config_version,3);
  const snapshot=await snapshotGatewayConfiguration(client,gateway);assert.equal(snapshot.version,4);
  assert.equal(await acknowledgeGatewayConfiguration(db,`S${site.slice(0,8)}`,`G${gateway.slice(0,8)}`,null,1,true),false);
  await recordGatewayPublished(db,gateway,1);
  assert.equal(await acknowledgeGatewayConfiguration(db,`S${site.slice(0,8)}`,`G${gateway.slice(0,8)}`,null,1,false),true);
  const state=(await client.query('SELECT applied_config_version,published_config_version,acknowledged_config_version FROM gateways WHERE id=$1',[gateway])).rows[0];assert.equal(state.applied_config_version,0);assert.equal(state.acknowledged_config_version,1);
  const comparisons=new MeasurementComparisons(db);
  const pair=await comparisons.create(gateway,{leftDeviceId:left,rightDeviceId:right,leftTag:'energy.active.import.total',rightTag:'energy.active.import.total',kind:'energy'});
  await assert.rejects(comparisons.commission(gateway,pair.id,{alertEnabled:true,commissioningConfirmed:true}),/preview/);
  const base=new Date('2026-01-01T00:00:00Z').getTime();
  for(let step=0;step<=6;step++)for(const id of [left,right]){
   const message=randomUUID(),time=new Date(base+step*450000);
   await client.query(`INSERT INTO payload_messages(id,gateway_id,device_id,message_id,digest,accepted_at,profile_revision_id,lot_number,sequence,polled_at,sent_at,raw_payload,unmapped) VALUES($1::uuid,$2,$3,$1::uuid::text,'test',now(),$4,1,$5,$6,$6,'{}','[]')`,[message,gateway,id,profile.id,step,time]);
   await client.query(`INSERT INTO payload_samples(id,message_id,site_id,gateway_id,device_id,profile_revision_id,tag,value,unit,raw_value,raw_unit,poll_group,polled_at,received_at,quality,communication) VALUES($1,$2,$3,$4,$5,$6,'energy.active.import.total',$7,'kWh',$7,'kWh','energy',$8,now(),'good','online')`,[randomUUID(),message,site,gateway,id,profile.id,1000+step*(id===left?1:2),time]);
  }
  await comparisons.recomputeNext();
  assert.equal((await comparisons.list(gateway))[0]!.latest.state,'mismatch');
  await comparisons.commission(gateway,pair.id,{alertEnabled:true,commissioningConfirmed:true});
  await client.query('INSERT INTO measurement_comparison_dirty(pair_id,from_time) VALUES($1,$2)',[pair.id,new Date(base)]);
  await comparisons.recomputeNext();
  const alerts=await client.query('SELECT severity FROM alerts WHERE comparison_pair_id=$1',[pair.id]);assert.deepEqual(alerts.rows,[{severity:'warning'}]);
  assert.equal(Number((await client.query('SELECT count(*) FROM billing_meters WHERE site_id=$1',[site])).rows[0].count),0);
  const logger=randomUUID(),loggerProfile=(await client.query("SELECT id FROM payload_profile_revisions WHERE profile_id='huawei-smartlogger3000a' LIMIT 1")).rows[0];
  await client.query(`INSERT INTO devices(id,gateway_id,site_id,name,model,serial_number,device_type,external_device_id,payload_profile_revision_id) VALUES($1,$2,$3,'Logger','Logger',$4,'logger',$4,$5)`,[logger,gateway,site,`L${logger.slice(0,8)}`,loggerProfile.id]);
  await controller.setGatewayDashboardSources(gateway,{impactConfirmed:true,sources:{energy:{deviceId:logger,tag:'solar.total_yield'},power:{deviceId:logger,tag:'solar.active_power'}}},{user:{id:undefined}} as any);
  const sourceMap=(await controller.gatewayConfiguration(gateway)).metricSources;
  assert.deepEqual(sourceMap,{energy:{deviceId:logger,tag:'solar.total_yield'},power:{deviceId:logger,tag:'solar.active_power'}});
  const secondLogger=randomUUID();
  await client.query(`INSERT INTO devices(id,gateway_id,site_id,name,model,serial_number,device_type,external_device_id,payload_profile_revision_id) VALUES($1,$2,$3,'Second Logger','Logger',$4,'logger',$4,$5)`,[secondLogger,gateway,site,`L${secondLogger.slice(0,8)}`,loggerProfile.id]);
  for(const [device,watts] of [[logger,5000],[secondLogger,9000]] as const){
   const message=randomUUID();
   await client.query(`INSERT INTO payload_messages(id,gateway_id,device_id,message_id,digest,accepted_at,profile_revision_id,lot_number,sequence,polled_at,sent_at,raw_payload,unmapped) VALUES($1,$2,$3,$1::uuid::text,'source-test',now(),$4,1,1,now(),now(),'{}','[]')`,[message,gateway,device,loggerProfile.id]);
   await client.query(`INSERT INTO payload_samples(id,message_id,site_id,gateway_id,device_id,profile_revision_id,tag,value,unit,raw_value,raw_unit,poll_group,polled_at,received_at,quality,communication) VALUES($1,$2,$3,$4,$5,$6,'solar.active_power',$7,'W',$7,'W','realtime',now(),now(),'good','online')`,[randomUUID(),message,site,gateway,device,loggerProfile.id,watts]);
  }
  const dashboard=new DashboardService(db);
  assert.equal((await dashboard.getPowerFlow({role:'admin'},site)).sites[0]?.generationKw,5,'Explicit first logger is used despite a second logger');
  await controller.setGatewayDashboardSources(gateway,{impactConfirmed:true,sources:{power:{deviceId:secondLogger,tag:'solar.active_power'}}},{user:{id:undefined}} as any);
  assert.equal((await dashboard.getPowerFlow({role:'admin'},site)).sites[0]?.generationKw,9,'Selected power source is applied in Dashboard');
  assert.equal(Number((await controller.listGateways(admin)).find(row=>row.id===gateway)?.currentProductionKw),9);
  await controller.setGatewayDashboardSources(gateway,{impactConfirmed:true,sources:{power:null}},{user:{id:undefined}} as any);
  assert.equal((await dashboard.getPowerFlow({role:'admin'},site)).sites[0]?.generationKw,null,'Ambiguous default loggers do not become an invented sum or meter fallback');
  await assert.rejects(controller.setGatewayDashboardSources(gateway,{impactConfirmed:true,sources:{energy:{deviceId:left,tag:'solar.total_yield'}}},{user:{id:undefined}} as any),/registered|production/i);
  await client.query(`INSERT INTO payload_samples(id,message_id,site_id,gateway_id,device_id,profile_revision_id,tag,value,unit,raw_value,raw_unit,poll_group,polled_at,measured_at,received_at,quality,communication) SELECT $1,id,$2,$3,$4,$5,'energy.active.import.total',999,'kWh',999,'kWh','energy',$6,$7,now(),'good','online' FROM payload_messages WHERE device_id=$4 LIMIT 1`,[randomUUID(),site,gateway,left,profile.id,new Date(base+3600000),new Date(base)]);
  const telemetry=await new MqttIngestionService(db,db).getLatestTelemetry(site);
  assert.equal(telemetry!.canonicalFields!.find(f=>f.deviceId===left)?.value,1006);
  const replacement=await controller.replaceGateway(gateway,{name:`Replacement${gateway.slice(0,8)}`,externalGatewayId:`R${gateway.slice(0,8)}`});
  assert.equal((await controller.listGateways(admin)).filter(g=>g.siteId===site).length,1);
  assert.equal((await controller.gatewayHistory(replacement.id)).length,2);
  assert.ok((await controller.gatewayHistory(replacement.id)).find(h=>h.gatewayId===gateway)?.removedAt);
  assert.equal((await controller.listDevices(site,admin)).length,0);
 }finally{await client.query('ROLLBACK');client.release();await pool.end();}
});
