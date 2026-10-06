import {Pool} from 'pg';
import {parseManualUser,createManualUser} from './manual-user.js';

// Run explicitly in the API terminal. Never load local .env or create demo data.
async function main(){
 const config=parseManualUser(process.env);
 const pool=new Pool({connectionString:config.databaseUrl,connectionTimeoutMillis:5000});
 try{const client=await pool.connect();try{
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(73501931)');
  const user=await createManualUser(client,config);await client.query('COMMIT');
  console.log(`${user.role}: ${user.email} — ${user.created?'created':'preserved; password unchanged'}${user.schoolId?` — school ${user.schoolId}`:''}`);
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
 finally{await pool.end();}
}
main().catch(error=>{const message=error instanceof Error?error.message:'';console.error(message.startsWith('Invalid manual user fields:')||message.startsWith('Manual user ')?message:'Manual user creation failed; transaction rolled back. Check database and configuration.');process.exitCode=1;});
