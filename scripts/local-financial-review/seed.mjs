// Prerequisites only: no billing cycle, issued document, payment or receipt inserts.
import {createRequire} from 'node:module';
import {createHash,randomBytes,scryptSync,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {assertTarget,assertOwnership,marker} from './guard.mjs';
import {energySampleSpec} from './canonical-energy.mjs';
import {TEST_FINANCIAL_POLICY,TEST_FINANCIAL_POLICY_HASH,localFinancialBinding} from '../../apps/api/src/modules/billing/local-financial-policy.ts';
const require=createRequire(new URL('../../apps/api/package.json',import.meta.url));
const {Pool}=require('pg');
assertTarget(process.env.DATABASE_URL,'solar_financial_flow_review');
if(process.env.MQTT_ENABLED!=='false'||process.env.LOCAL_FINANCIAL_FIXTURE_MARKER!==marker)throw Error('Dedicated disabled MQTT fixture environment required');
const fixture=JSON.parse(await readFile(new URL('../../docs/financial-local-fixture-inputs-2026-10-08.json',import.meta.url),'utf8'));
export const id=key=>createHash('sha256').update(`${marker}:${key}`).digest('hex').slice(0,32).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5');
const pool=new Pool({connectionString:process.env.DATABASE_URL}),c=await pool.connect();
const insert=async(table,v)=>{const keys=Object.keys(v);await c.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_,i)=>`$${i+1}`).join(',')})`,Object.values(v));};
try{
assertTarget(process.env.DATABASE_URL,(await c.query('SELECT current_database() AS name')).rows[0].name);
await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(107202649)');
const count=Number((await c.query('SELECT (SELECT count(*) FROM schools)+(SELECT count(*) FROM users)+(SELECT count(*) FROM contracts)+(SELECT count(*) FROM billing_cycles)+(SELECT count(*) FROM documents)+(SELECT count(*) FROM payments) AS count')).rows[0].count);
const owned=(await c.query("SELECT correlation_id FROM audit_events WHERE action='LOCAL_FINANCIAL_PREREQUISITE_SEED' LIMIT 1")).rows[0]?.correlation_id;
assertOwnership(count,owned);if(count)throw Error('Already seeded; explicit guarded reset required');
const salt=randomBytes(16).toString('hex');const password=process.env.LOCAL_FINANCIAL_TEST_PASSWORD||'LocalFinancial2026!';
const hash=`scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`;
for(const org of fixture.organizations)await insert('schools',{id:id(org.key),name:org.name,code:org.code,region:'Bangkok',status:'active'});
for(const user of fixture.users)await insert('users',{id:id(user.key),email:user.email,display_name:`[TEST] ${user.key}`,role:user.role,status:'active',school_id:user.organizationKey?id(user.organizationKey):null,password_hash:hash,preferred_language:'th',preferred_theme:'light',email_verified_at:'2026-07-01T00:00:00+07:00',verified_email:user.email});
for(const [n,site] of fixture.sites.entries()){
await insert('sites',{id:id(site.key),school_id:id(site.organizationKey),name:site.name,capacity_mwp:site.capacityMwp,timezone:'Asia/Bangkok',status:'online',external_site_id:`FLOW-${n}`});
await insert('gateways',{id:id(`gateway-${n}`),site_id:id(site.key),name:`FLOW-GW-${n}`,protocol:'mqtt',endpoint:`solar/v1/sites/FLOW-${n}/gateways/FLOW-GW-${n}/devices/+/telemetry`,external_gateway_id:`FLOW-GW-${n}`,status:'online'});
for(const kind of ['meter','logger']){
const profile=kind==='meter'?'00000000-0000-4000-8000-000000000001':'00000000-0000-4000-8000-000000000002';
await insert('devices',{id:id(`${kind}-${n}`),gateway_id:id(`gateway-${n}`),site_id:id(site.key),name:`[TEST] ${kind} ${n}`,device_type:kind,model:kind==='meter'?'Schneider PM2230':'Huawei SmartLogger3000A',serial_number:`FLOW-${kind}-${n}`,slave_id:kind==='meter'?1:2,status:'online',external_device_id:`FLOW-${kind}-${n}`,payload_profile_revision_id:profile});
await c.query(`INSERT INTO telemetry_raw(id,device_id,site_id,source_time,received_time,raw_payload,normalized_value,unit,quality,ingestion_id,semantic_field,total_energy_kwh,active_power_w,payload_profile_revision_id)
SELECT md5($1||stamp::text)::uuid,$2,$3,stamp,stamp,jsonb_build_object('synthetic',true,'fixtureMarker',$6::text),10000+extract(epoch FROM(stamp-'2026-07-01T00:00:00+07:00'::timestamptz))/86400*$4::numeric,'kWh','complete',$1||stamp::text,$7,10000+extract(epoch FROM(stamp-'2026-07-01T00:00:00+07:00'::timestamptz))/86400*$4::numeric,20000,$5 FROM generate_series('2026-07-01T00:00:00+07:00'::timestamptz,'2026-10-01T00:00:00+07:00'::timestamptz,interval '1 hour')stamp WHERE NOT($8::boolean AND stamp>'2026-09-30T23:00:00+07:00'::timestamptz)`,[`${marker}-${kind}-${n}`,id(`${kind}-${n}`),id(site.key),kind==='meter'?41.152233333333:52.1,profile,marker,kind==='meter'?'total_energy':'solar_total_yield',n===2]);
await c.query(`INSERT INTO payload_messages(id,gateway_id,device_id,message_id,digest,accepted_at,profile_revision_id,lot_number,sequence,polled_at,sent_at,raw_payload,unmapped)
SELECT md5($1||stamp::text)::uuid,$2,$3,$1||stamp::text,encode(sha256(($1||stamp::text)::bytea),'hex'),stamp,$4,1,row_number() OVER (ORDER BY stamp),stamp,stamp,jsonb_build_object('synthetic',true,'fixtureMarker',$5::text),'{}'::jsonb FROM generate_series('2026-07-01T00:00:00+07:00'::timestamptz,'2026-10-01T00:00:00+07:00'::timestamptz,interval '1 hour')stamp WHERE NOT($6::boolean AND stamp>'2026-09-30T23:00:00+07:00'::timestamptz)`,[`${marker}-${kind}-${n}`,id(`gateway-${n}`),id(`${kind}-${n}`),profile,marker,n===2]);
const energyTag=kind==='meter'?'energy.active.import.total':'solar.total_yield';
const energyProfile=(await c.query('SELECT config FROM payload_profile_revisions WHERE id=$1',[profile])).rows[0]?.config;
const canonicalEnergy=energySampleSpec(energyProfile,energyTag);
await c.query(`INSERT INTO payload_samples(id,message_id,site_id,gateway_id,device_id,profile_revision_id,tag,value,unit,raw_value,raw_unit,poll_group,polled_at,measured_at,received_at,quality,communication)
SELECT md5(m.id::text||'energy')::uuid,m.id,$1,m.gateway_id,m.device_id,m.profile_revision_id,$3,(10000+extract(epoch FROM(m.polled_at-'2026-07-01T00:00:00+07:00'::timestamptz))/86400*$4::numeric)*$6::numeric,$7::text,(10000+extract(epoch FROM(m.polled_at-'2026-07-01T00:00:00+07:00'::timestamptz))/86400*$4::numeric)*1000,'Wh',$5,m.polled_at,m.polled_at,m.polled_at,'good','online' FROM payload_messages m WHERE m.device_id=$2`,[id(site.key),id(`${kind}-${n}`),kind==='meter'?'energy.active.import.total':'solar.total_yield',kind==='meter'?41.152233333333:52.1,kind==='meter'?'energy':'plant',canonicalEnergy.valueMultiplier,canonicalEnergy.unit]);
}
await insert('register_mapping_versions',{id:id('mapping-'+n),device_id:id('meter-'+n),semantic_field:'total_energy',register_address:'energy.active.import.total',data_type:'uint32',byte_order:'ABCD',scale:1,unit:'kWh',effective_from:'2026-07-01T00:00:00+07:00'});
await c.query('UPDATE telemetry_raw SET mapping_version_id=$1 WHERE device_id=$2',[id('mapping-'+n),id('meter-'+n)]);
await insert('billing_meters',{id:id(`billing-meter-${n}`),site_id:id(site.key),device_id:id(`meter-${n}`),semantic_field:'total_energy',active:true});
if(n===1)continue;
const org=fixture.organizations.find(o=>o.key===site.organizationKey);
await insert('contracts',{id:id(`contract-${n}`),site_id:id(site.key),version:1,start_date:'2026-07-01',status:'active',payment_terms:'30 calendar days; synthetic local test',payment_term_days:30,recipient_user_ids:[id(n===2?'organization-user-b':'organization-user-a')],signer_name:fixture.issuer.signerName,tax_id:org.taxId,company_name:org.name,branch:org.branch,tax_address:org.address,billing_email:org.billingEmail});
await insert('rate_versions',{id:id(`rate-${n}`),contract_id:id(`contract-${n}`),effective_from:'2026-07-01',rate_type:'fixed_kwh',rate:'3.5000',currency:'THB'});
}
const binding=localFinancialBinding();if(!binding)throw Error('Exact local policy environment required');
await insert('local_financial_test_policy',{id:randomUUID(),fixture_marker:marker,environment_binding:binding,policy_hash:TEST_FINANCIAL_POLICY_HASH,policy:JSON.stringify(TEST_FINANCIAL_POLICY),selected_by:'User-selected synthetic local financial policy 2026-10-08',workflow_state:'verification_in_progress',workflow_evidence:JSON.stringify({runId:randomUUID(),startedAt:new Date().toISOString(),purpose:'real_api_workflow_verification'})});
const issuer=fixture.issuer;
await c.query('UPDATE company_profile SET company_name=$1,tax_id=$2,branch=$3,address=$4,phone=$5,email=$6,logo_url=$7,is_configured=true',[issuer.companyName,issuer.taxId,issuer.branch,issuer.address,issuer.phone,issuer.email,issuer.logoUrl]);
const bank=issuer.bankAccounts[0];await c.query('UPDATE company_bank_accounts SET bank_name=$1,bank_code=$2,account_name=$3,account_number=$4,branch_name=$5,promptpay_id=$6,is_default=true,is_configured=true',[bank.bankName,bank.bankCode,bank.accountName,bank.accountNumber,'Test branch','0000000000000']);
await insert('audit_events',{id:id('seed-marker'),actor_id:id('admin'),action:'LOCAL_FINANCIAL_PREREQUISITE_SEED',entity_type:'platform',entity_id:id('site-a-main'),after_json:JSON.stringify({synthetic:true,fixtureMarker:marker,organizations:2,sites:3,users:6,policy:'7% test tax exclusive half up; API workflow pending'}),reason:'User-selected isolated synthetic workflow prerequisites',correlation_id:marker});
await c.query('COMMIT');console.log(JSON.stringify({marker,runId:randomUUID(),sites:fixture.sites.map(s=>({key:s.key,id:id(s.key)})),users:fixture.users.map(u=>({email:u.email,id:id(u.key),role:u.role})),issuedDocuments:0}));
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
