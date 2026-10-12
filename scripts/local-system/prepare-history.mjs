import {createRequire} from 'node:module';
import {assertLocalDockerTarget} from './guard.mjs';
assertLocalDockerTarget('financial');
const require=createRequire(new URL('../../apps/api/package.json',import.meta.url));
const db=new (require('pg').Pool)({connectionString:process.env.DATABASE_URL});
try{
 // Current production-power query orders by measured_at with a polled_at fallback.
 // The old polled_at-only index cannot satisfy that ordering on the large fixture.
 await db.query(`CREATE INDEX IF NOT EXISTS local_system_payload_latest_measured ON payload_samples(site_id,device_id,profile_revision_id,tag,(coalesce(measured_at,polled_at)) DESC,received_at DESC,id DESC)`);
 await db.query(`CREATE INDEX IF NOT EXISTS local_system_payload_device_latest ON payload_samples(device_id,polled_at DESC,received_at DESC)`);
 await db.query(`CREATE INDEX IF NOT EXISTS local_system_payload_device_measured ON payload_samples(device_id,profile_revision_id,tag,(coalesce(measured_at,polled_at)) DESC,received_at DESC,id DESC)`);
 await db.query('ANALYZE payload_samples');await db.query('ANALYZE devices');
 console.log('Prepared local history query index and planner statistics');
}finally{await db.end();}
