import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {assertLocalDockerTarget} from './guard.mjs';
import {sites,reading} from './telemetry-fixture.mjs';
assertLocalDockerTarget('financial');
const require=createRequire(new URL('../../apps/api/package.json',import.meta.url));
const pool=new (require('pg').Pool)({connectionString:process.env.DATABASE_URL});
const {accounts,password}=JSON.parse(await readFile('output/local-system/accounts.json','utf8'));
const tokens=new Map(),results=[];
export async function api(path,token,method='GET',body,attempt=0){const r=await fetch('http://127.0.0.1:3001'+path,{method,headers:{Origin:'http://localhost:3000','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});if(r.status===429&&attempt<3){console.log('Rate limit: retry in 30 seconds');await new Promise(r=>setTimeout(r,30000));return api(path,token,method,body,attempt+1);}const text=await r.text();assert.ok(r.ok,`${method} ${path}: ${r.status} ${text.slice(0,700)}`);return text?JSON.parse(text):null;}
try{
 const loginAccounts=process.argv.includes('--roles-only')?['owner','admin','operator','accountant','customer_user'].map(role=>accounts.find(a=>a.role===role)):accounts;
 for(const [index,a] of loginAccounts.entries()){
 if(index>0&&index%8===0){console.log('Waiting for authentication rate-limit window');await new Promise(r=>setTimeout(r,60000));}
 const login=await api('/v1/auth/login',null,'POST',{email:a.email,password});assert.equal(login.user.role,a.role);tokens.set(a.email,login.accessToken);console.log('Login verified: '+a.email);}
 results.push({check:'Accounts login',passed:true,count:loginAccounts.length});
 for(const role of ['owner','admin','operator','accountant','customer_user']){
 const a=accounts.find(a=>a.role===role),token=tokens.get(a.email);
 const data=await api('/v1/dashboard/summary?start_date=2026-09-01&end_date=2026-09-30',token);
 const expected=role==='customer_user'?sites.filter(s=>s.siteId===a.siteId):sites;
 assert.equal(data.stats.totalSites,expected.length);
 assert.deepEqual(data.sites.map(s=>s.id).sort(),expected.map(s=>s.siteId).sort());
 const energy=expected.reduce((sum,s)=>sum+reading(s,'logger','2026-10-01T00:00:00+07:00').kwh-reading(s,'logger','2026-09-01T00:00:00+07:00').kwh,0);
 assert.ok(Math.abs(data.stats.periodKwh-energy)<0.05,`Dashboard energy ${data.stats.periodKwh} must match fixture ${energy}`);
 await writeFile(`output/local-system/dashboard-${role}.json`,JSON.stringify(data,null,2));
 await api('/v1/me/notification-feed',token);results.push({check:`Dashboard and notification feed: ${role}`,passed:true});
 }
 const owner=tokens.get(accounts.find(a=>a.role==='owner').email),admin=tokens.get(accounts.find(a=>a.role==='admin').email);
 for(const [kind,token] of [['sites',owner],['gateways',admin],['billing',owner]]){const value=await api(kind==='gateways'?'/v1/gateways':'/v1/operations/'+kind,token);const rows=Array.isArray(value)?value:value.rows;assert.ok(rows?.length>=10,`${kind}: ten seeded rows required`);if(kind!=='billing')assert.deepEqual(rows.map(r=>r.id).sort(),sites.map(s=>kind==='sites'?s.siteId:s.gatewayId).sort());results.push({check:kind,passed:true,count:rows.length});}
 const docs=(await pool.query(`SELECT d.id,d.document_number,d.content_hash FROM documents d JOIN billing_cycles b ON b.id=d.billing_cycle_id WHERE b.period_start>='2026-07-01' AND b.period_start<'2026-08-01' AND d.document_type='invoice' ORDER BY d.id`)).rows;
 assert.equal(docs.length,10,'July partial-period invoices are required');
 const mail=(await(await fetch('http://127.0.0.1:18049/api/v1/messages?limit=200')).json()).messages;
 for(const d of docs){const response=await fetch(`http://127.0.0.1:3001/v1/operations/documents/${d.id}/pdf`,{headers:{Authorization:'Bearer '+owner}});assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.subarray(0,5).toString(),'%PDF-');const hash=createHash('sha256').update(bytes).digest('hex');assert.equal(hash,d.content_hash);await writeFile(`output/local-system/${d.document_number}.pdf`,bytes);
 const message=mail.find(m=>m.Subject.includes(d.document_number));assert.ok(message,`Local SMTP missing ${d.document_number}`);const detail=await(await fetch(`http://127.0.0.1:18049/api/v1/message/${message.ID}`)).json();assert.equal(detail.Attachments.length,1);const attachment=Buffer.from(await(await fetch(`http://127.0.0.1:18049/api/v1/message/${message.ID}/part/${detail.Attachments[0].PartID}`)).arrayBuffer());assert.equal(createHash('sha256').update(attachment).digest('hex'),hash);
 }
 results.push({check:'Invoice PDFs, stored hashes and SMTP attachment bytes',passed:true,count:docs.length});
 const customer=accounts.find(a=>a.role==='customer_user'),other=(await pool.query(`SELECT d.id FROM documents d JOIN billing_cycles b ON b.id=d.billing_cycle_id WHERE b.site_id<>$1 LIMIT 1`,[customer.siteId])).rows[0];const denied=await fetch(`http://127.0.0.1:3001/v1/operations/documents/${other.id}/pdf`,{headers:{Authorization:'Bearer '+tokens.get(customer.email)}});assert.ok([403,404].includes(denied.status));results.push({check:'Customer cannot download another site document',passed:true});
 const counts=(await pool.query(`SELECT (SELECT count(*) FROM sites) sites,(SELECT count(*) FROM gateways) gateways,(SELECT count(*) FROM devices) devices,(SELECT count(*) FROM telemetry_raw) readings,(SELECT count(*) FROM documents) documents,(SELECT count(*) FROM alerts) alerts`)).rows[0];
 await writeFile('output/local-system/check-results.json',JSON.stringify({checkedAt:new Date().toISOString(),results,counts},null,2));console.log(JSON.stringify({results,counts},null,2));
}catch(e){await writeFile('output/local-system/check-results.json',JSON.stringify({checkedAt:new Date().toISOString(),results,failure:e.message},null,2));throw e;}finally{await pool.end();}
