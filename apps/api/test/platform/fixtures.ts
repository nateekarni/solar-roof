import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
export function assertIsolatedDatabase(value: string): string {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.search || url.hash || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.pathname !== '/solar_readiness' || url.port !== '15432') throw new Error('Requires loopback solar_readiness database on port 15432 without overrides');
  return value;
}
export async function createFixture(db: PoolClient) {
  const schoolIds: string[] = [], siteIds: string[] = [], deviceIds: string[] = [];
  for (let school = 0; school < 100; school++) {
    const schoolId=randomUUID(), siteId=randomUUID(), gatewayId=randomUUID();
    schoolIds.push(schoolId); siteIds.push(siteId);
    await db.query("INSERT INTO schools(id,name,code,region) VALUES($1,$2,$3,'fixture')",[schoolId,`School ${school}`,schoolId]);
    await db.query("INSERT INTO sites(id,school_id,name,capacity_mwp) VALUES($1,$2,$3,0.1)",[siteId,schoolId,`Site ${school}`]);
    await db.query("INSERT INTO gateways(id,site_id,name,protocol,endpoint) VALUES($1,$2,$3,'mqtt',$4)",[gatewayId,siteId,gatewayId,`energy/${gatewayId}/#`]);
    for(let meter=0;meter<10;meter++) {
      const deviceId=randomUUID();deviceIds.push(deviceId);
      await db.query("INSERT INTO devices(id,gateway_id,site_id,name,device_type,model,serial_number) VALUES($1,$2,$3,'Meter','meter','fixture',$4)",[deviceId,gatewayId,siteId,deviceId]);
      for(let minute=0;minute<3;minute++) await db.query("INSERT INTO telemetry_raw(id,device_id,site_id,source_time,received_time,raw_payload,normalized_value,unit,quality,ingestion_id,total_energy_kwh,active_power_w) VALUES($1,$2,$3,$4,$4,'{}',100,'kWh','complete',$5,100,1000)",[randomUUID(),deviceId,siteId,new Date(Date.now()-minute*60000),randomUUID()]);
    }
  }
  const users = [randomUUID(),randomUUID()];
  await db.query("INSERT INTO users(id,email,display_name,role,school_id) VALUES($1,'tenant-a@example.test','Tenant A','school_user',$2),($3,'tenant-b@example.test','Tenant B','admin',$4)",[users[0],schoolIds[0],users[1],schoolIds[1]]);
  const documentId=randomUUID();
  await db.query("INSERT INTO documents(id,site_id,document_type,document_number,amount) VALUES($1,$2,'invoice','fixture-original',123.45)",[documentId,siteIds[0]]);
  return { schoolIds,siteIds,deviceIds,users,documentId };
}
