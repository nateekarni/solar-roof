import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {assertLocalDockerTarget} from './guard.mjs';
import {buildDemoAccounts} from './demo-accounts.mjs';
import {marker,password} from './fixture.mjs';

export function buildIdentityUpdates(currentUsers,desiredAccounts){
 const currentIds=currentUsers.map(user=>String(user.id));
 const desiredIds=desiredAccounts.map(account=>String(account.id));
 if(currentIds.length!==desiredIds.length||new Set(currentIds).size!==currentIds.length||new Set(desiredIds).size!==desiredIds.length||currentIds.some(id=>!desiredIds.includes(id))){
  throw Error('Every active fixture user must be mapped exactly once');
 }
 const emails=desiredAccounts.map(account=>account.email.toLowerCase());
 if(new Set(emails).size!==emails.length)throw Error('Desired demo emails must be unique');
 const currentById=new Map(currentUsers.map(user=>[String(user.id),user]));
 return desiredAccounts.filter(account=>{
  const current=currentById.get(String(account.id));
  return current.email.toLowerCase()!==account.email.toLowerCase()||current.display_name!==account.name;
 });
}

const accountMarkdown=accounts=>`# บัญชีทดสอบ local

เว็บ: http://localhost:3000/login

รหัสผ่านทุกบัญชี: \`${password}\`

| ชื่อผู้ใช้ | อีเมล | Role | รหัส/ไซต์ |
| --- | --- | --- | --- |
${accounts.map(account=>`| ${account.name} | ${account.email} | ${account.role} | ${account.siteCode?`${account.siteCode} · ${account.siteName}`:'ทุกไซต์ตามสิทธิ์'} |`).join('\n')}
`;

async function main(){
 assertLocalDockerTarget('financial');
 const require=createRequire(new URL('../../apps/api/package.json',import.meta.url));
 const pool=new (require('pg').Pool)({connectionString:process.env.DATABASE_URL});
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(107202649)');
  if(!(await client.query('SELECT 1 FROM audit_events WHERE action=$1',[marker])).rowCount)throw Error('Local system fixture marker required');
  const current=(await client.query("SELECT id,email,display_name,role,customer_id FROM users WHERE status='active' ORDER BY role,email")).rows;
  const sites=(await client.query('SELECT s.id,s.customer_id,s.name,s.external_site_id,c.name AS customer_name FROM sites s JOIN customers c ON c.id=s.customer_id ORDER BY s.external_site_id')).rows;
  const accounts=buildDemoAccounts(current,sites);
  const updates=buildIdentityUpdates(current,accounts);
  const duplicate=(await client.query('SELECT id,email FROM users WHERE lower(email)=ANY($1::text[]) AND NOT(id=ANY($2::uuid[])) LIMIT 1',[accounts.map(account=>account.email.toLowerCase()),accounts.map(account=>account.id)])).rows[0];
  if(duplicate)throw Error(`Demo email already belongs to another identity: ${duplicate.email}`);
  if(updates.length){
   for(const account of accounts)await client.query("UPDATE users SET email=$2,verified_email=NULL WHERE id=$1",[account.id,`reconciling-${String(account.id).replaceAll('-','')}@example.invalid`]);
   for(const account of accounts)await client.query('UPDATE users SET email=$2,display_name=$3,verified_email=$2,email_verified_at=now() WHERE id=$1',[account.id,account.email,account.name]);
   for(const account of accounts.filter(account=>account.customerId)){
    await client.query('UPDATE customers SET document_email=$2 WHERE id=$1',[account.customerId,account.email]);
    await client.query('UPDATE contracts c SET billing_email=$2 FROM sites s WHERE c.site_id=s.id AND s.customer_id=$1',[account.customerId,account.email]);
   }
   const owner=accounts.find(account=>account.role==='owner');
   await client.query(`INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,after_json,correlation_id) VALUES($1,$2,'LOCAL_DEMO_IDENTITIES_RECONCILED','platform',$2,$3,$4)`,[randomUUID(),owner.id,JSON.stringify({synthetic:true,updated:updates.length,accounts:accounts.length}),marker]);
  }
  await client.query('COMMIT');
  await mkdir('output/local-system',{recursive:true});
  await writeFile('output/local-system/accounts.json',JSON.stringify({password,accounts},null,2));
  await writeFile('output/local-system/ACCOUNTS.md',accountMarkdown(accounts));
  console.log(JSON.stringify({accounts:accounts.length,updated:updates.length,manifest:'output/local-system/accounts.json'}));
 }catch(error){
  await client.query('ROLLBACK');
  throw error;
 }finally{
  client.release();
  await pool.end();
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
