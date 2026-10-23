import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {AuthService} from '../modules/identity/auth.service.js';

const schema=z.object({
 DATABASE_URL:z.string().url().refine(value=>['postgres:','postgresql:'].includes(new URL(value).protocol)),
 DEMO_CUSTOMER_PROVISION_ENABLED:z.literal('true'),SITE_CODE:z.string().trim().min(1).max(120),
 USER_EMAIL:z.string().trim().toLowerCase().email().max(254),USER_PASSWORD:z.string().min(16).max(1024),
 USER_NAME:z.string().trim().min(2).max(200),
});

export function parseDemoCustomerUser(input:Record<string,string|undefined>){
 const result=schema.safeParse(input);
 if(!result.success)throw Error(`Invalid demo customer fields: ${[...new Set(result.error.issues.map(issue=>issue.path.join('.')))].join(', ')}`);
 return {databaseUrl:result.data.DATABASE_URL,siteCode:result.data.SITE_CODE,email:result.data.USER_EMAIL,password:result.data.USER_PASSWORD,name:result.data.USER_NAME};
}

export async function provisionDemoCustomerUser(client:{query(sql:string,values?:unknown[]):Promise<{rows:any[]}>},config:ReturnType<typeof parseDemoCustomerUser>){
 const site=(await client.query(`SELECT s.id,s.customer_id,s.external_site_id FROM sites s JOIN customers c ON c.id=s.customer_id WHERE s.external_site_id=$1 AND s.status<>'archived' AND c.status='active' FOR UPDATE OF s,c`,[config.siteCode])).rows;
 if(site.length!==1)throw Error(`Expected exactly one active site with code ${config.siteCode}`);
 const target=site[0];
 const users=(await client.query('SELECT id,role,customer_id FROM users WHERE lower(email)=$1 FOR UPDATE',[config.email])).rows;
 if(users.length>1||users[0]&&(users[0].role!=='customer_user'||users[0].customer_id!==target.customer_id))throw Error('Demo customer email belongs to an incompatible account; no user changed');
 const userId=users[0]?.id??randomUUID();const created=!users[0];const passwordHash=new AuthService('','').hashPassword(config.password);
 if(!created&&!(await client.query("SELECT id FROM audit_events WHERE entity_id=$1 AND action='demo_customer_user.provisioned' LIMIT 1",[userId])).rows[0])throw Error('Existing account was not created by the demo provisioning tool; no credentials changed');
 if(created)await client.query(`INSERT INTO users(id,email,display_name,role,status,customer_id,password_hash,email_verified_at,verified_email) VALUES($1,$2,$3,'customer_user','active',$4,$5,now(),$2)`,[userId,config.email,config.name,target.customer_id,passwordHash]);
 else{
  await client.query(`UPDATE users SET display_name=$2,status='active',password_hash=$3,email_verified_at=now(),verified_email=email,updated_at=now() WHERE id=$1`,[userId,config.name,passwordHash]);
  await client.query(`UPDATE auth_sessions SET revoked_at=now(),refresh_hash=NULL WHERE user_id=$1 AND revoked_at IS NULL`,[userId]);
  await client.query(`UPDATE user_invitations SET revoked_at=coalesce(revoked_at,now()),consumed_at=coalesce(consumed_at,now()),updated_at=now() WHERE user_id=$1 AND consumed_at IS NULL`,[userId]);
 }
 const active=(await client.query(`SELECT id,site_id FROM site_account_assignments WHERE user_id=$1 AND revoked_at IS NULL FOR UPDATE`,[userId])).rows;
 if(active.some(row=>row.site_id!==target.id))throw Error('Demo customer account is already assigned to another active site');
 if(!active.some(row=>row.site_id===target.id)){
  const prior=(await client.query(`SELECT id FROM site_account_assignments WHERE user_id=$1 AND site_id=$2 ORDER BY assigned_at DESC LIMIT 1 FOR UPDATE`,[userId,target.id])).rows[0];
  if(prior)await client.query(`UPDATE site_account_assignments SET revoked_at=NULL,revoked_by=NULL,assigned_at=now() WHERE id=$1`,[prior.id]);
  else await client.query(`INSERT INTO site_account_assignments(id,user_id,site_id,assigned_at) VALUES($1,$2,$3,now())`,[randomUUID(),userId,target.id]);
 }
 await client.query(`INSERT INTO audit_events(id,action,entity_type,entity_id,after_json,reason,correlation_id) VALUES($1,'demo_customer_user.provisioned','user',$2,$3::jsonb,$4,$5)`,[randomUUID(),userId,JSON.stringify({email:config.email,role:'customer_user',customerId:target.customer_id,siteId:target.id,externalSiteId:target.external_site_id,created}),`Provision demo customer for ${config.siteCode}`,randomUUID()]);
 return {created,userId,email:config.email,siteCode:config.siteCode};
}
