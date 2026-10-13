import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {assertOwnership,marker,ownedDisplayChanges,needsFixtureAssignment,cleanProfileConfig,acceptanceDisplayName,acceptanceGatewayName} from './guard.mjs';
import {accounts,fixtureId,fixtureMarker} from './september-fixture.mjs';
import {TEST_FINANCIAL_POLICY} from '../../apps/api/src/modules/billing/local-financial-policy.ts';
const baseId=key=>createHash('sha256').update(`${marker}:${key}`).digest('hex').slice(0,32).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5');
// Caller must hold the seed advisory lock inside a guarded transaction.
export async function normalizeOwnedFixtures(client){
 const audits=(await client.query("SELECT action,correlation_id FROM audit_events WHERE action IN ('LOCAL_FINANCIAL_PREREQUISITE_SEED','SEPTEMBER_BILLING_FIXTURE_SEED')")).rows;
 assertOwnership(1,audits.find(a=>a.action==='LOCAL_FINANCIAL_PREREQUISITE_SEED')?.correlation_id);
 const fixture=JSON.parse(await readFile(new URL('../../docs/financial-local-fixture-inputs-2026-10-08.json',import.meta.url),'utf8'));
 const september=audits.some(a=>a.action==='SEPTEMBER_BILLING_FIXTURE_SEED'&&a.correlation_id===fixtureMarker);
 const deviceIds=fixture.sites.flatMap((_,n)=>['meter','logger'].map(k=>baseId(`${k}-${n}`)));
 const specs=[['customers','name',fixture.organizations.map(o=>baseId(o.key)),september?[fixtureId('customer')]:[]],['sites','name',fixture.sites.map(s=>baseId(s.key)),september?[fixtureId('site')]:[]],['users','display_name',fixture.users.map(u=>baseId(u.key)),september?accounts.map(a=>fixtureId(a.key)):[]],['devices','name',deviceIds,september?['meter','logger'].map(fixtureId):[]],['devices','model',deviceIds,september?['meter','logger'].map(fixtureId):[]],['contracts','company_name',fixture.sites.map((_,n)=>baseId(`contract-${n}`)),[]]];
 let renamed=0;
 for(const [table,column,base,extra] of specs){const ids=new Set([...base,...extra]);const rows=(await client.query(`SELECT id,${column}${table==='users'?',role':''} FROM ${table} WHERE id=ANY($1::uuid[])`,[[...ids]])).rows;for(const change of ownedDisplayChanges(rows,ids,column)){await client.query(`UPDATE ${table} SET ${column}=$1 WHERE id=$2`,[change.value,change.id]);renamed++;}}
 // Reuse reference names already present in the repository's local review fixture.
 for(const [id,oldName,name] of [[baseId('organization-a'),'องค์กรทดสอบเอ','ลูกค้าบ้านคลองแสน'],[baseId('organization-b'),'องค์กรทดสอบบี','ลูกค้าบ้านดอนแก้ว'],[fixtureId('customer'),'ลูกค้าทดสอบกันยายน','ลูกค้าบ้านไผ่เมือง']])renamed+=(await client.query('UPDATE customers SET name=$1 WHERE id=$2 AND name=$3',[name,id,oldName])).rowCount;
 if(september)renamed+=(await client.query("UPDATE sites SET name='ไผ่เมือง อาคารพลังงาน' WHERE id=$1 AND name='Solar September 2026'",[fixtureId('site')])).rowCount;
 if(september)await client.query("UPDATE customers SET legal_name='ลูกค้าบ้านไผ่เมือง' WHERE id=$1 AND legal_name='บริษัท ลูกค้าทดสอบกันยายน จำกัด'",[fixtureId('customer')]);
 const acceptance=(await client.query("SELECT s.id,s.name,s.customer_id,s.external_site_id FROM sites s WHERE s.name ~ '^(Billing MQTT |Browser acceptance |Document channel acceptance )' AND EXISTS(SELECT 1 FROM audit_events a WHERE a.entity_id=s.id AND a.entity_type='site' AND a.action='billing_source.bind') ORDER BY s.name,s.id")).rows;
 for(const [n,site] of acceptance.entries()){
  const name=acceptanceDisplayName(site.name,site.external_site_id,n+1);if(!name)continue;
  renamed+=(await client.query('UPDATE sites SET name=$1 WHERE id=$2 AND name=$3',[name,site.id,site.name])).rowCount;
  renamed+=(await client.query('UPDATE customers SET name=$1 WHERE id=$2 AND name=$3',[name,site.customer_id,site.name])).rowCount;
  await client.query("INSERT INTO audit_events(id,action,entity_type,entity_id,before_json,after_json,reason,correlation_id) VALUES($1,'LOCAL_DEMO_DISPLAY_NORMALIZED','site',$2,$3,$4,'Owned local acceptance fixture; preserve original document snapshots',$5)",[baseId('display:'+site.id),site.id,JSON.stringify({name:site.name}),JSON.stringify({name}),marker]);
 }
 const acceptanceGateways=(await client.query("SELECT g.id,g.name,s.id AS site_id,s.name AS site_name,s.external_site_id FROM gateways g JOIN sites s ON s.id=g.site_id WHERE g.name ~ '^(Document gateway |Display gateway |GW-[a-f0-9]{32}$)' AND EXISTS(SELECT 1 FROM audit_events a WHERE a.entity_id=s.id AND a.entity_type='site' AND a.action='billing_source.bind') ORDER BY s.id")).rows;
 let additional=0;
 for(const gateway of acceptanceGateways){
  let siteName=gateway.site_name;
  if(siteName==='ไซต์งานทดสอบเอกสาร Solar Roof'&&acceptanceGatewayName(gateway.name,gateway.external_site_id,siteName)){
   siteName=`โครงการ Solar Roof อาคารเอกสารเพิ่มเติม ${++additional}`;
   renamed+=(await client.query('UPDATE sites SET name=$1 WHERE id=$2 AND name=$3',[siteName,gateway.site_id,gateway.site_name])).rowCount;
  }
  const name=acceptanceGatewayName(gateway.name,gateway.external_site_id,siteName);if(name)renamed+=(await client.query('UPDATE gateways SET name=$1 WHERE id=$2 AND name=$3',[name,gateway.id,gateway.name])).rowCount;
 }
 if(september)for(const kind of ['meter','logger']){
  const original=(await client.query('SELECT profile_id,config FROM payload_profile_revisions WHERE id=$1',[fixtureId('profile-'+kind)])).rows[0];
  if(original&&/\[(?:test|demo)[^\]]*\]/i.test(original.config.displayName)){
   const revisionId=fixtureId('clean-profile-'+kind),config=cleanProfileConfig(original.config);
   await client.query('INSERT INTO payload_profile_revisions(id,profile_id,version,config) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',[revisionId,original.profile_id,config.version,JSON.stringify(config)]);
   await client.query('UPDATE devices SET payload_profile_revision_id=$1 WHERE id=$2 AND payload_profile_revision_id=$3',[revisionId,fixtureId(kind),fixtureId('profile-'+kind)]);
  }
 }
 const assignments=fixture.users.filter(u=>u.organizationKey).map(u=>({user:baseId(u.key),site:baseId(fixture.sites.find(s=>s.organizationKey===u.organizationKey).key)}));
 if(september)assignments.push({user:fixtureId('customer'),site:fixtureId('site')});
 for(const assignment of assignments){
  const user=(await client.query("SELECT id FROM users WHERE id=$1 AND role IN ('customer_user','school_user')",[assignment.user])).rows[0];if(!user)continue;
  const active=(await client.query('SELECT site_id FROM site_account_assignments WHERE user_id=$1 AND revoked_at IS NULL',[assignment.user])).rows[0];
  if(!needsFixtureAssignment(active,assignment.site))continue;
  const assignmentId=baseId(`assignment:${assignment.user}:${assignment.site}`);
  await client.query('INSERT INTO site_account_assignments(id,user_id,site_id) VALUES($1,$2,$3)',[assignmentId,assignment.user,assignment.site]);
 }
 const sites=fixture.sites.map((s,n)=>({id:baseId(s.key),recipient:assignments.find(a=>a.site===baseId(s.key))?.user,start:'2026-07-01',admin:baseId('admin'),rate:baseId(`rate-${n}`)}));
 if(september)sites.push({id:fixtureId('site'),recipient:fixtureId('customer'),start:'2026-09-01',admin:fixtureId('admin')});
 for(const site of sites){
  if(!(await client.query('SELECT id FROM sites WHERE id=$1',[site.id])).rowCount)continue;
  // This explicitly records the approved local DEMO policy, never a production tax default.
  await client.query('INSERT INTO site_billing_settings(site_id,version,service_start_date,payment_term_days,recipient_user_ids,tax_rate,prices_include_tax,tax_confirmed,updated_by) VALUES($1,1,$2,30,$3,$5,false,true,$4) ON CONFLICT(site_id) DO NOTHING',[site.id,site.start,site.recipient?[site.recipient]:[],site.admin,TEST_FINANCIAL_POLICY.taxPercent]);
  if(site.rate)await client.query('UPDATE rate_versions SET site_id=$1 WHERE id=$2 AND site_id IS NULL',[site.id,site.rate]);
 }
 return {renamed,assignmentCandidates:assignments.length};
}
