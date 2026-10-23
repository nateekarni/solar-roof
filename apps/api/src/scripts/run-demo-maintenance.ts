import 'dotenv/config';
import {Pool} from 'pg';
import {deleteGateway,deleteSite,parseDemoMaintenance,resetBilling} from './demo-maintenance.js';

const config=parseDemoMaintenance(process.env);const pool=new Pool({connectionString:config.databaseUrl,connectionTimeoutMillis:5000,application_name:'demo-maintenance'});
try{const client=await pool.connect();try{await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='120s'");await client.query("SELECT pg_advisory_xact_lock(hashtext('demo-maintenance'))");const result=config.action==='reset-billing'?await resetBilling(client):config.action==='delete-gateway'?await deleteGateway(client,config.target!):await deleteSite(client,config.target!);await client.query('COMMIT');process.stdout.write(`${JSON.stringify({action:config.action,...result})}\n`);}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
catch(error){process.stderr.write(`Demo maintenance failed: ${error instanceof Error?error.message:String(error)}\n`);process.exitCode=1;}finally{await pool.end();}
