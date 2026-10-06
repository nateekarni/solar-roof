import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {AuthService} from '../modules/identity/auth.service.js';
const schema=z.object({DATABASE_URL:z.string().url().refine(value=>['postgres:','postgresql:'].includes(new URL(value).protocol)),SITE_USER_SEED_ENABLED:z.literal('true'),SITE_USER_SEED_SITE_ID:z.uuid(),SITE_USER_SEED_EMAIL:z.string().trim().toLowerCase().email().max(254),SITE_USER_SEED_PASSWORD:z.string().min(16),SITE_USER_SEED_NAME:z.string().trim().min(2).max(200)});
export function parseSiteUserSeed(input:Record<string,string|undefined>){
 const result=schema.safeParse(input);if(!result.success)throw Error(`Invalid site user seed fields: ${[...new Set(result.error.issues.map(issue=>issue.path.join('.')))].join(', ')}`);
 const value=result.data;return {databaseUrl:value.DATABASE_URL,siteId:value.SITE_USER_SEED_SITE_ID,email:value.SITE_USER_SEED_EMAIL,password:value.SITE_USER_SEED_PASSWORD,name:value.SITE_USER_SEED_NAME};
}
export async function seedSchoolUserForSite(client:PoolClient,config:ReturnType<typeof parseSiteUserSeed>){
 const site=(await client.query("SELECT s.school_id FROM sites s JOIN schools sc ON sc.id=s.school_id WHERE s.id=$1 AND s.status<>'archived' AND sc.status='active' FOR SHARE OF s,sc",[config.siteId])).rows[0];
 if(!site)throw Error('Site user seed requires a non-archived site with an active school');
 const users=await client.query('SELECT id,role,school_id,status,password_hash FROM users WHERE lower(email)=$1 FOR UPDATE',[config.email]);
 const existing=users.rows[0];
 if(users.rows.length>1||existing&&(existing.role!=='school_user'||existing.school_id!==site.school_id||existing.status!=='active'||!existing.password_hash))throw Error('Site user seed email belongs to an incompatible account; no user changed');
 if(existing)return {id:existing.id,email:config.email,schoolId:site.school_id,created:false};
 const id=randomUUID(),hash=new AuthService('','').hashPassword(config.password);
 await client.query("INSERT INTO users(id,email,display_name,role,status,school_id,password_hash) VALUES($1,$2,$3,'school_user','active',$4,$5)",[id,config.email,config.name,site.school_id,hash]);
 await client.query("INSERT INTO audit_events(id,action,entity_type,entity_id,after_json,correlation_id) VALUES($1,'site.school_user.seeded','user',$2,$3::jsonb,$4)",[randomUUID(),id,JSON.stringify({role:'school_user',siteId:config.siteId,schoolId:site.school_id}),randomUUID()]);
 return {id,email:config.email,schoolId:site.school_id,created:true};
}
