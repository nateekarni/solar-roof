import {Pool} from 'pg';
import {parsePilotUsersConfig,seedPilotUsers} from './pilot-users.js';

// Explicit deployment environment only; no demo data and no development .env imports.
const config=parsePilotUsersConfig(process.env);
const pool=new Pool({connectionString:config.databaseUrl,connectionTimeoutMillis:5000});
try {
 const client=await pool.connect();
 try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(73501931)');
  const users=await seedPilotUsers(client,config);
  await client.query('COMMIT');
  for(const user of users)console.log(`${user.role}: ${user.email} — ${user.created?'created':'preserved; password unchanged'}${user.schoolId?` — school ${user.schoolId}`:''}`);
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}catch(error){
 // Avoid driver diagnostics printing connection credentials or supplied passwords.
 const message=error instanceof Error?error.message:'';
 console.error(message.startsWith('Pilot ')||message.startsWith('PILOT_SCHOOL_ID')?message:'Pilot user seed failed; transaction rolled back. Check database and configuration.');
 process.exitCode=1;
}finally{await pool.end();}
