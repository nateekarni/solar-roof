import 'dotenv/config';
import {Pool} from 'pg';
import {parseDemoCustomerUser,provisionDemoCustomerUser} from './demo-customer-user.js';

const config=parseDemoCustomerUser(process.env);
const pool=new Pool({connectionString:config.databaseUrl,connectionTimeoutMillis:5000,application_name:'demo-customer-provision'});
try{
 const client=await pool.connect();
 try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(73501931)');const result=await provisionDemoCustomerUser(client,config);await client.query('COMMIT');process.stdout.write(`${JSON.stringify(result)}\n`);}
 catch(error){await client.query('ROLLBACK');throw error;}
 finally{client.release();}
}catch(error){process.stderr.write(`Demo customer provisioning failed: ${error instanceof Error?error.message:String(error)}\n`);process.exitCode=1;}
finally{await pool.end();}
