import {createRequire} from 'node:module';
import {stat,writeFile,mkdir} from 'node:fs/promises';
import {randomBytes,scryptSync,randomUUID} from 'node:crypto';
import {assertLocalDockerTarget} from './guard.mjs';
import {validateReplacement,password,marker} from './fixture.mjs';
import {buildDemoAccounts} from './demo-accounts.mjs';
const require=createRequire(new URL('../../apps/api/package.json',import.meta.url));
assertLocalDockerTarget('financial');
const pool=new (require('pg').Pool)({connectionString:process.env.DATABASE_URL});
const c=await pool.connect();const q=x=>'"'+x.replaceAll('"','""')+'"';
try{
 await c.query('BEGIN');
 await c.query('SELECT pg_advisory_xact_lock(107202649)');
 await c.query('LOCK TABLE users IN ACCESS EXCLUSIVE MODE');
 const oldUsers=(await c.query('SELECT * FROM users ORDER BY role,email')).rows;
 validateReplacement({databaseUrl:process.env.DATABASE_URL,backupBytes:(await stat('.tmp/local-system-backups/financial-before-users.dump')).size,oldUsers});
 const sites=(await c.query('SELECT s.id,s.customer_id,s.name,s.external_site_id,c.name AS customer_name FROM sites s JOIN customers c ON c.id=s.customer_id ORDER BY s.external_site_id')).rows;
 if(sites.length!==10)throw Error('Expected ten-site fixture');
 const accounts=buildDemoAccounts(oldUsers,sites);
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({dryRun:true,accounts},null,2));await c.query('ROLLBACK');}
 else{
 if((await c.query('SELECT 1 FROM audit_events WHERE action=$1',[marker])).rowCount)throw Error('Already replaced; use existing credentials');
 // Reuse identity keys so immutable provenance is untouched. Only FK check timing
 // changes inside this transaction; original constraint modes are restored before commit.
 const constraints=(await c.query(`SELECT co.conname,co.condeferrable,co.condeferred,ns.nspname AS schema,cl.relname AS table FROM pg_constraint co JOIN pg_class cl ON cl.oid=co.conrelid JOIN pg_namespace ns ON ns.oid=cl.relnamespace WHERE co.contype='f' AND co.confrelid='users'::regclass`)).rows;
 for(const r of constraints)await c.query(`ALTER TABLE ${q(r.schema)}.${q(r.table)} ALTER CONSTRAINT ${q(r.conname)} DEFERRABLE INITIALLY DEFERRED`);
 await c.query('SET CONSTRAINTS ALL DEFERRED');
 await c.query('DELETE FROM users');
 for(const a of accounts){const salt=randomBytes(16).toString('hex');const hash=`scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`;
 await c.query(`INSERT INTO users(id,email,display_name,role,status,customer_id,password_hash,email_verified_at,verified_email) VALUES($1,$2,$3,$4,'active',$5,$6,now(),$2)`,[a.id,a.email,a.name,a.role,a.customerId??null,hash]);}
 const owner=accounts.find(a=>a.role==='owner');
 for(const a of accounts.filter(a=>a.siteId))await c.query('UPDATE site_billing_settings SET recipient_user_ids=$2,reminders_enabled=true,reminder_start_days=0,reminder_interval_days=7 WHERE site_id=$1',[a.siteId,[a.id]]);
 const resources={business:['dashboard','sites','customers','billing','receipts','documents','tariffs','settings','audit'],technical:['dashboard','gateways','devices','fields','profiles','registers','reception','brokers','alerts','settings','telemetry','audit']};
 for(const a of accounts.filter(a=>['operator','accountant'].includes(a.role))){const domain=a.role==='operator'?'technical':'business';const overrides=Object.fromEntries(resources[domain].flatMap(r=>['view','edit','approve','download'].map(action=>[`${domain}.${r}.${action}`,true])));
 await c.query(`INSERT INTO employee_domain_grants(user_id,domain,overrides,scope_mode,updated_by) VALUES($1,$2,$3,'all',$4)`,[a.id,domain,overrides,owner.id]);}
 await c.query(`UPDATE operational_delivery_outbox SET state='cancelled',last_error='Local test identities replaced' WHERE state IN('pending','failed')`);
 await c.query('SET CONSTRAINTS ALL IMMEDIATE');
 for(const r of constraints)await c.query(`ALTER TABLE ${q(r.schema)}.${q(r.table)} ALTER CONSTRAINT ${q(r.conname)} ${r.condeferrable?'DEFERRABLE':'NOT DEFERRABLE'} INITIALLY ${r.condeferred?'DEFERRED':'IMMEDIATE'}`);
 await c.query(`INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,after_json,correlation_id) VALUES($1,$2,$3,'platform',$2,$4,$3)`,[randomUUID(),owner.id,marker,JSON.stringify({replaced:oldUsers.length,created:accounts.length,preservedHistoricalIdentityKeys:true})]);
 await c.query('COMMIT');await mkdir('output/local-system',{recursive:true});await writeFile('output/local-system/accounts.json',JSON.stringify({password,accounts},null,2));console.log(JSON.stringify({replaced:oldUsers.length,created:accounts.length}));
 }
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
