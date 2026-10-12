import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {AuthService} from '../modules/identity/auth.service.js';
const schema=z.object({DATABASE_URL:z.string().url().refine(value=>['postgres:','postgresql:'].includes(new URL(value).protocol)),SITE_USER_SEED_ENABLED:z.literal('true'),SITE_USER_SEED_SITE_ID:z.uuid(),SITE_USER_SEED_EMAIL:z.string().trim().toLowerCase().email().max(254),SITE_USER_SEED_PASSWORD:z.string().min(16),SITE_USER_SEED_NAME:z.string().trim().min(2).max(200)});
export function parseSiteUserSeed(input:Record<string,string|undefined>){
 const result=schema.safeParse(input);if(!result.success)throw Error(`Invalid site user seed fields: ${[...new Set(result.error.issues.map(issue=>issue.path.join('.')))].join(', ')}`);
 const value=result.data;return {databaseUrl:value.DATABASE_URL,siteId:value.SITE_USER_SEED_SITE_ID,email:value.SITE_USER_SEED_EMAIL,password:value.SITE_USER_SEED_PASSWORD,name:value.SITE_USER_SEED_NAME};
}
export async function seedCustomerUserForSite(client:PoolClient,config:ReturnType<typeof parseSiteUserSeed>){
 const site=(await client.query("SELECT s.customer_id FROM sites s JOIN customers sc ON sc.id=s.customer_id WHERE s.id=$1 AND s.status<>'archived' AND sc.status='active' FOR SHARE OF s,sc",[config.siteId])).rows[0];
 if(!site)throw Error('Site user seed requires a non-archived site with an active customer');
 const users=await client.query('SELECT id,role,customer_id,status,password_hash FROM users WHERE lower(email)=$1 FOR UPDATE',[config.email]);
 const existing=users.rows[0];
 if(users.rows.length>1||existing&&(existing.role!=='customer_user'||existing.customer_id!==site.customer_id||existing.status!=='active'||!existing.password_hash))throw Error('Site user seed email belongs to an incompatible account; no user changed');
 if(existing)return {id:existing.id,email:config.email,customerId:site.customer_id,created:false};
 const id=randomUUID(),hash=new AuthService('','').hashPassword(config.password);
 await client.query("INSERT INTO users(id,email,display_name,role,status,customer_id,password_hash) VALUES($1,$2,$3,'customer_user','active',$4,$5)",[id,config.email,config.name,site.customer_id,hash]);
 await client.query("INSERT INTO audit_events(id,action,entity_type,entity_id,after_json,correlation_id) VALUES($1,'site.customer_user.seeded','user',$2,$3::jsonb,$4)",[randomUUID(),id,JSON.stringify({role:'customer_user',siteId:config.siteId,customerId:site.customer_id}),randomUUID()]);
 return {id,email:config.email,customerId:site.customer_id,created:true};
}
