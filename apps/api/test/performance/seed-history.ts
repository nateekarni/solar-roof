import assert from 'node:assert/strict';
import {randomUUID,randomBytes,scryptSync} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {Pool} from 'pg';
import {assertIsolatedDatabase} from '../platform/fixtures';
import type {Profile} from './capacity-policy';

export function ownedPool() {
  assert.match(process.env.COMPOSE_PROJECT_NAME??'',/^solar-ci-[a-f0-9-]{36}$/);
  const ids=execFileSync('docker',['ps','--filter',`label=com.docker.compose.project=${process.env.COMPOSE_PROJECT_NAME}`,'--filter','label=com.docker.compose.service=postgres','-q'],{encoding:'utf8'}).trim().split(/\s+/);
  assert.equal(ids.length,1);assert.ok(ids[0]);
  const [container]=JSON.parse(execFileSync('docker',['inspect',ids[0]],{encoding:'utf8'}));
  assert.ok(container.NetworkSettings.Ports['5432/tcp'].some((p:{HostIp:string;HostPort:string})=>p.HostIp==='127.0.0.1'&&p.HostPort==='15432'));
  return new Pool({connectionString:assertIsolatedDatabase(process.env.READINESS_DATABASE_URL!),max:10});
}
export async function seedHistory(db: Pool, profile: Profile) {
  assert.equal(Number((await db.query('SELECT count(*) AS n FROM telemetry_raw')).rows[0].n),0,'Capacity requires an empty owned fixture');
  const devices:{id:string;site:string;gateway:string}[]=[],users:{id:string;email:string;password:string}[]=[];
  const end=new Date(Math.floor(Date.now()/60000)*60000-60000);
  for(let school=0;school<profile.schools;school++) {
    const schoolId=randomUUID(),site=randomUUID(),gateway=randomUUID();
    await db.query("INSERT INTO schools(id,name,code,region) VALUES($1::uuid,$2,$1::text,'capacity-fixture')",[schoolId,`Capacity school ${school}`]);
    await db.query("INSERT INTO sites(id,school_id,name,capacity_mwp) VALUES($1,$2,$3,0.1)",[site,schoolId,`Capacity site ${school}`]);
    await db.query("INSERT INTO gateways(id,site_id,name,protocol,endpoint) VALUES($1::uuid,$2,$1::text,'mqtt',$3)",[gateway,site,`energy/${gateway}/#`]);
    for(let meter=0;meter<profile.meters/profile.schools;meter++) {
      const id=randomUUID();devices.push({id,site,gateway});
      await db.query("INSERT INTO devices(id,gateway_id,site_id,name,device_type,model,serial_number) VALUES($1::uuid,$2,$3,'Capacity meter','meter','fixture',$1::text)",[id,gateway,site]);
      await db.query("INSERT INTO billing_meters(id,site_id,device_id) VALUES($1,$2,$3)",[randomUUID(),site,id]);
    }
    // Operational history must exist too; no financial feature is activated.
    for(let month=0;month<24;month++) {
      const start=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()-month,1));
      const finish=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0));
      await db.query("INSERT INTO billing_cycles(id,site_id,period_start,period_end,cutoff_time,status,quality,opening_energy,closing_energy,consumed_kwh,rate,amount) VALUES($1,$2,$3,$4::date,$4::date::timestamptz,'pending_review','complete',0,100,100,4,400)",[randomUUID(),site,start,finish]);
    }
  }
  for(let i=0;i<profile.users;i++) {
    const id=randomUUID(),email=`capacity-${id}@example.test`,password=`Fixture-${randomUUID()}!`,salt=randomBytes(16).toString('hex');
    const hash=`scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`;
    await db.query("INSERT INTO users(id,email,display_name,role,status,password_hash,preferred_language) VALUES($1,$2,'Capacity actor','admin','active',$3,'en')",[id,email,hash]);users.push({id,email,password});
  }
  const perDevice=profile.historyRows/profile.meters;
  const intervalSeconds=profile.name==='target'?60:86400;
  // Bounded transactions, real triggers enabled. Never set replication_role or fabricate summaries.
  for(const device of devices) for(let offset=0;offset<perDevice;offset+=1440) {
    const count=Math.min(1440,perDevice-offset);
    await db.query(`INSERT INTO telemetry_raw(id,device_id,site_id,source_time,received_time,raw_payload,normalized_value,unit,quality,ingestion_id,total_energy_kwh,active_power_w,semantic_field)
      SELECT gen_random_uuid(),$1,$2,$3::timestamptz-(g*$4::int*interval '1 second'),now(),'{}',1000000-g,'kWh','complete',gen_random_uuid()::text,1000000-g,1000,'total_energy' FROM generate_series($5::int,$6::int) g`,[device.id,device.site,end,intervalSeconds,offset,offset+count-1]);
  }
  await db.query(`INSERT INTO audit_events(id,action,entity_type,entity_id,occurred_at,correlation_id) SELECT gen_random_uuid(),'capacity.fixture','site',$1,now()-g*interval '1 minute',gen_random_uuid()::text FROM generate_series(1,$2::int) g`,[devices[0].site,profile.name==='target'?100000:100]);
  await db.query('ANALYZE telemetry_raw');await db.query('ANALYZE billing_cycles');await db.query('ANALYZE audit_events');
  const historyRows=Number((await db.query('SELECT count(*) AS n FROM telemetry_raw')).rows[0].n);
  assert.equal(historyRows,profile.historyRows);
  return {devices,users,end:end.toISOString(),historyRows,seedTriggers:'enabled',roleDistribution:{admin:profile.users}};
}
