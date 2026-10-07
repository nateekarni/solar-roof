// Synthetic, isolated UI review data. Never loads .env; never truncates or deletes.
import {createRequire} from 'node:module';
import {createHash,randomBytes,scryptSync} from 'node:crypto';
import {assertReviewTarget} from './guard.mjs';
const require=createRequire(new URL('../../apps/api/package.json',import.meta.url));
const {Pool}=require('pg');
assertReviewTarget(process.env.DATABASE_URL,'solar_dashboard_review');
if(process.env.MQTT_ENABLED!=='false')throw Error('Review requires MQTT disabled');
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const client=await pool.connect();
export const id=key=>createHash('sha256').update(`solar-dashboard-review:${key}`).digest('hex').slice(0,32).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5');
const insert=async(table,values)=>{const keys=Object.keys(values);return client.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_,i)=>`$${i+1}`).join(',')})`,Object.values(values));};
try {
 assertReviewTarget(process.env.DATABASE_URL,(await client.query('SELECT current_database() AS name')).rows[0].name);
 await client.query('BEGIN');
 await client.query('SELECT pg_advisory_xact_lock(107202613)');
 if(Number((await client.query('SELECT count(*) FROM schools')).rows[0].count)!==0)throw Error('Database already contains schools; refusing seed. Existing review data is preserved.');
 const suffix=['คลองแสน','ดอนแก้ว','ทุ่งยาว','ริมคลอง','เขาดิน','บ้านสวน','หนองบัว','ไผ่เมือง','สาธิต','เมืองใหม่','วิทยาพัฒนา','แสงอรุณ','ร่มเกล้า','ลำธาร','ทุ่งทอง','วัดใหม่','ข้อมูลว่าง','ยังไม่เชื่อมต่อ'];
 const meterProfile='00000000-0000-4000-8000-000000000001',loggerProfile='00000000-0000-4000-8000-000000000002';
 const base=(await client.query('SELECT config FROM payload_profile_revisions WHERE id=$1',[meterProfile])).rows[0].config;
 for(const [n,name] of ['PILOT SPM911 (จำลอง)','Future meter connection','Campus energy system','Three-phase laboratory'].entries()) {
  const config={...base,id:`review-profile-${n}`,displayName:`[DEMO] ${name}`,sourceProfile:{id:base.id,version:base.version}};
  await insert('payload_profile_revisions',{id:id(`profile-${n}`),profile_id:config.id,version:'1.0.0',config:JSON.stringify(config)});
 }
 const salt=randomBytes(16).toString('hex'),passwordHash=`scrypt:${salt}:${scryptSync('ReviewSolar2026!',salt,64).toString('hex')}`;
 for(let i=0;i<18;i++) {
  const number=String(i+1).padStart(2,'0');
  await insert('schools',{id:id(`school-${i}`),name:`[DEMO] โรงเรียน${suffix[i]}`,code:`REVIEW-${number}`,region:['ภาคกลาง','ภาคเหนือ','ภาคใต้'][i%3],status:'active'});
  await insert('sites',{id:id(`site-${i}`),school_id:id(`school-${i}`),name:`[DEMO] ${number} ${suffix[i]}`,capacity_mwp:0.08+i*0.013,timezone:'Asia/Bangkok',status:'online',latitude:13.7+(i%6)*0.5,longitude:100.5+Math.floor(i/6)*0.9,external_site_id:`REVIEW-SITE-${number}`});
  if(i===17)continue;
  await insert('gateways',{id:id(`gateway-${i}`),site_id:id(`site-${i}`),name:`REVIEW-GW-${number}`,protocol:'mqtt',endpoint:`solar/v1/sites/REVIEW-SITE-${number}/gateways/REVIEW-GW-${number}/devices/+/telemetry`,external_gateway_id:`REVIEW-GW-${number}`,status:i===15?'offline':'online',last_seen_at:i===16?null:new Date(Date.now()-(i===15?3600000:15000))});
  for(const kind of ['meter','logger'])await insert('devices',{id:id(`${kind}-${i}`),gateway_id:id(`gateway-${i}`),site_id:id(`site-${i}`),name:`[DEMO] ${kind} ${number}`,device_type:kind,model:kind==='meter'?'Schneider PM2230':'Huawei SmartLogger3000A',serial_number:`REVIEW-${kind}-${number}`,slave_id:kind==='meter'?1:2,status:'online',external_device_id:`REVIEW-${kind}-${number}`,payload_profile_revision_id:kind==='meter'?meterProfile:loggerProfile});
  await insert('billing_meters',{id:id(`billing-meter-${i}`),site_id:id(`site-${i}`),device_id:id(`meter-${i}`),semantic_field:'total_energy',active:true});
  if(i>=16)continue;
  await insert('contracts',{id:id(`contract-${i}`),site_id:id(`site-${i}`),version:1,start_date:'2025-01-01',status:'active',payment_terms:'ข้อมูลสังเคราะห์สำหรับทดสอบเท่านั้น',signer_name:'ผู้ลงนามจำลอง'});
  await insert('rate_versions',{id:id(`rate-${i}`),contract_id:id(`contract-${i}`),effective_from:'2025-01-01',rate_type:'fixed_kwh',rate:3.4+i*0.04,currency:'THB'});
  for(let year=2025;year<=2027;year++)for(let month=1;month<=12;month++) {
   const start=`${year}-${String(month).padStart(2,'0')}-01`,end=`${year}-${String(month).padStart(2,'0')}-${new Date(Date.UTC(year,month,0)).getUTCDate()}`;
   const kwh=2100+i*163+month*32,rate=3.4+i*0.04,amount=Number((kwh*rate).toFixed(2));
   const key=`${i}-${year}-${month}`,paid=(i+month)%3!==0;
   await insert('billing_cycles',{id:id(`bill-${key}`),site_id:id(`site-${i}`),period_start:start,period_end:end,cutoff_time:`${end}T16:59:59Z`,status:paid?'approved':'pending_review',quality:'complete',opening_energy:100000,closing_energy:100000+kwh,consumed_kwh:kwh,rate,amount});
   await insert('documents',{id:id(`invoice-${key}`),site_id:id(`site-${i}`),billing_cycle_id:id(`bill-${key}`),document_type:'invoice',document_number:`DEMO-INV-${key}`,status:'issued',issue_date:end,amount});
   if(paid)await insert('payments',{id:id(`payment-${key}`),billing_cycle_id:id(`bill-${key}`),status:'paid',paid_at:`${end}T10:00:00Z`,amount,note:'SYNTHETIC REVIEW PAYMENT'});
  }
  // Three readings/day establish actual cumulative differences without treating snapshots as increments.
  await client.query(`INSERT INTO telemetry_raw(id,device_id,site_id,source_time,received_time,raw_payload,normalized_value,unit,quality,ingestion_id,semantic_field,total_energy_kwh,active_power_w,payload_profile_revision_id)
   SELECT md5($1||stamp::text)::uuid,$2,$3,stamp,stamp,jsonb_build_object('synthetic',true),100000+extract(epoch from(stamp-'2025-10-01T00:00:00+07:00'::timestamptz))/86400*(180+$4::int*12),'kWh','complete','review-history-'||$1||stamp::text,'total_energy',100000+extract(epoch from(stamp-'2025-10-01T00:00:00+07:00'::timestamptz))/86400*(180+$4::int*12),20000+$4::int*2300,$5
   FROM generate_series('2025-10-01 00:00:00+07'::timestamptz,'2027-10-31 23:00:00+07',interval '8 hours')stamp
   WHERE NOT($4::int=14 AND extract(day from stamp)::int%7=0)`,[String(i),id(`meter-${i}`),id(`site-${i}`),i,meterProfile]);
  if(i<5)await insert('alerts',{id:id(`alert-${i}`),site_id:id(`site-${i}`),gateway_id:id(`gateway-${i}`),severity:i===0?'critical':'warning',title:`[DEMO] ${['ข้อมูลขาดช่วง','ตรวจสอบแรงดัน','กำลังผลิตลดลง','อุณหภูมิสูง','รอบตรวจอุปกรณ์'][i]}`,detail:'เหตุการณ์สังเคราะห์สำหรับตรวจหน้าจอ ไม่ใช่สถานะอุปกรณ์จริง',status:'open',occurred_at:new Date(Date.now()-i*3600000)});
 }
 for(const role of ['admin','owner','operator','accountant','school_user'])await insert('users',{id:id(`user-${role}`),email:`${role}@review.local`,display_name:`[DEMO] ${role}`,role,status:'active',school_id:role==='school_user'?id('school-0'):null,password_hash:passwordHash,preferred_language:'th',preferred_theme:'light'});
 await insert('meter_presets',{id:id('legacy-register'),brand:'[DEMO] Legacy',model:'Raw register compatibility',device_type:'meter',registers:JSON.stringify([{semanticField:'total_energy',registerAddress:'3204',dataType:'uint32',byteOrder:'ABCD',scale:0.01,unit:'kWh'}])});
 await insert('audit_events',{id:id('seed-audit'),actor_id:id('user-admin'),action:'LOCAL_SYNTHETIC_REVIEW_SEED',entity_type:'platform',entity_id:id('site-0'),after_json:JSON.stringify({synthetic:true,schools:18,sites:18}),reason:'Isolated local UI review only',correlation_id:'solar-dashboard-review-v1'});
 await client.query('COMMIT');
 console.log(JSON.stringify({synthetic:true,schools:18,sites:18,gateways:17,devices:34,users:5,billingCycles:576,dateRange:'2025-10-01 to 2027-10-31',emptySite:id('site-16'),unconfiguredSite:id('site-17')}));
} catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
