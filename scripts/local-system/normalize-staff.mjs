import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {assertLocalDockerTarget} from './guard.mjs';
import {id,marker} from './fixture.mjs';
assertLocalDockerTarget('financial');
const require=createRequire(new URL('../../apps/api/package.json',import.meta.url)),{z}=require('zod');
const pool=new (require('pg').Pool)({connectionString:process.env.DATABASE_URL});
const manifest=JSON.parse(await readFile('output/local-system/accounts.json','utf8'));
const c=await pool.connect();
try{
 await c.query('BEGIN');await c.query('LOCK TABLE users IN ACCESS EXCLUSIVE MODE');
 if(!(await c.query('SELECT 1 FROM audit_events WHERE action=$1',[marker])).rowCount)throw Error('Replacement fixture marker required');
 let changed=0;
 for(const a of manifest.accounts.filter(a=>a.role!=='customer_user'&&!z.uuid().safeParse(a.id).success)){
 const old=(await c.query('SELECT * FROM users WHERE id=$1 AND email=$2 AND status=$3',[a.id,a.email,'active'])).rows[0];if(!old)throw Error('Unexpected active staff identity');
 const next=id('staff:'+a.id);
 await c.query("UPDATE users SET email=$2,verified_email=NULL,email_verified_at=NULL,status='inactive',password_hash=NULL WHERE id=$1",[a.id,`retired-${a.id}@example.invalid`]);
 await c.query('DELETE FROM auth_sessions WHERE user_id=$1',[a.id]);
 await c.query(`INSERT INTO users(id,email,display_name,role,status,password_hash,email_verified_at,verified_email) VALUES($1,$2,$3,$4,'active',$5,now(),$2)`,[next,a.email,a.name,a.role,old.password_hash]);
 await c.query(`INSERT INTO employee_domain_grants(user_id,domain,position_id,overrides,scope_mode,site_ids) SELECT $2,domain,position_id,overrides,scope_mode,site_ids FROM employee_domain_grants WHERE user_id=$1`,[a.id,next]);
 await c.query('DELETE FROM employee_domain_grants WHERE user_id=$1',[a.id]);
 await c.query('UPDATE operational_alert_rules SET recipient_user_ids=array_replace(recipient_user_ids,$1::uuid,$2::uuid) WHERE $1=ANY(recipient_user_ids)',[a.id,next]);
 a.id=next;changed++;
 }
 await c.query('COMMIT');await writeFile('output/local-system/accounts.json',JSON.stringify(manifest,null,2));console.log(JSON.stringify({newActiveStaff:changed,historicalPrincipals:'inactive, no password, no sessions'}));
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
