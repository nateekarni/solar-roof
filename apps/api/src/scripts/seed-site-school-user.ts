import {Pool} from 'pg';
import {parseSiteUserSeed,seedSchoolUserForSite} from './site-user-seed.js';
const config=parseSiteUserSeed(process.env);
const pool=new Pool({connectionString:config.databaseUrl,connectionTimeoutMillis:5000});
try{const client=await pool.connect();try{
 await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(73501931)');
 const user=await seedSchoolUserForSite(client,config);await client.query('COMMIT');
 console.log(`school_user: ${user.email} — ${user.created?'created':'preserved; password unchanged'} — school ${user.schoolId}`);
}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
catch(error){const message=error instanceof Error?error.message:'';console.error(message.startsWith('Site user seed ')?message:'Site user seed failed; transaction rolled back. Check database and configuration.');process.exitCode=1;}finally{await pool.end();}
