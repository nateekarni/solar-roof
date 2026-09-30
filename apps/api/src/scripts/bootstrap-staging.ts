import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {S3Client, HeadBucketCommand, CreateBucketCommand} from '@aws-sdk/client-s3';
import {AuthService} from '../modules/identity/auth.service.js';
import {parseBootstrapConfig} from './bootstrap-config.js';

// Explicit environment only: never import a development .env or demo seed here.
const config=parseBootstrapConfig(process.env);
const db=new Pool({connectionString:config.databaseUrl,connectionTimeoutMillis:5000});
const storage=new S3Client({endpoint:config.storageEndpoint,region:config.storageRegion,forcePathStyle:true,credentials:{accessKeyId:config.storageAccessKey,secretAccessKey:config.storageSecretKey}});
try {
 try {await storage.send(new HeadBucketCommand({Bucket:config.storageBucket}));}
 catch(error) {
  if((error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode!==404) throw error;
  try {await storage.send(new CreateBucketCommand({Bucket:config.storageBucket,...(config.storageRegion==='us-east-1'?{}:{CreateBucketConfiguration:{LocationConstraint:config.storageRegion as 'eu-west-1'}})}));}
  catch(createError) {if((createError as {name?:string}).name!=='BucketAlreadyOwnedByYou')throw createError;}
 }
 const client=await db.connect();
 try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(73501931)');
  const existing=await client.query('SELECT id,role,status,school_id,password_hash FROM users WHERE lower(email)=$1 FOR UPDATE',[config.email]);
  if(existing.rows.length) {
   const user=existing.rows[0];
   if(existing.rows.length!==1 || user.role!=='admin' || user.school_id!==null || user.status!=='active' || !user.password_hash) throw new Error('Bootstrap email belongs to an incompatible account; resolve manually. No account was changed.');
   await client.query('COMMIT');
   process.stdout.write('Bootstrap complete: existing admin preserved (password unchanged).\n');
  } else {
   const id=randomUUID();
   const passwordHash=new AuthService('', '').hashPassword(config.password);
   await client.query("INSERT INTO users(id,email,display_name,role,status,password_hash) VALUES($1,$2,'Staging administrator','admin','active',$3)",[id,config.email,passwordHash]);
   await client.query("INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,after_json,correlation_id) VALUES($1,$2,'bootstrap_admin','user',$2,$3::jsonb,$4)",[randomUUID(),id,JSON.stringify({role:'admin'}),randomUUID()]);
   await client.query('COMMIT');
   process.stdout.write('Bootstrap complete: administrator created.\n');
  }
 } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
} finally {await db.end();storage.destroy();}
