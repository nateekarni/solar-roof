import 'reflect-metadata';
import 'dotenv/config';
import {AuthService} from '../modules/identity/auth.service.js';
import {AuthorizationService} from '../modules/identity/authorization.service.js';
import {hasPermission,siteScope} from '../common/auth/authorization.js';
import {DatabaseService} from '../database/database.service.js';
import {FinancialApplicationService} from '../modules/billing/financial-application.service.js';
import {FinancialReadinessService} from '../modules/financial-readiness/financial-readiness.service.js';
import {createDemoEnergyManualBill,type DemoEnergyBillRepository,type DemoEnergyCheckpoint,type DemoEnergyContext} from '../modules/billing/demo-energy-manual-bill.js';
import {scaledDecimal} from '../modules/billing/site-billing-policy.js';

type JsonObject=Record<string,unknown>;

function argumentsFrom(argv:string[]){
 let siteCode='',firstBaseline:string|undefined;
 for(const arg of argv){
  if(arg==='--')continue;
  if(arg.startsWith('--site='))siteCode=arg.slice('--site='.length).trim();
  else if(arg.startsWith('--first-baseline='))firstBaseline=arg.slice('--first-baseline='.length).trim();
  else throw Error(`Unknown argument: ${arg}`);
 }
 if(!siteCode)throw Error('Usage: pnpm demo:energy-bill -- --site=SITE-001 [--first-baseline=0]');
 return {siteCode,...(firstBaseline!==undefined?{firstBaseline}:{})};
}

function checkpoint(row:any):DemoEnergyCheckpoint|null{
 if(!Array.isArray(row.manual_lines))return null;
 for(const line of row.manual_lines){
  const value=line?.demoEnergy as JsonObject|undefined;
  if(!value||value.version!==1||typeof value.meterId!=='string'||typeof value.deviceId!=='string'||typeof value.bindingId!=='string'||typeof value.openingKwh!=='string'||typeof value.closingKwh!=='string'||typeof value.closingReadingId!=='string'||typeof value.closingSourceTime!=='string')continue;
  return {cycleId:row.id,status:row.status,documentNumber:row.document_number??null,meterId:value.meterId,deviceId:value.deviceId,bindingId:value.bindingId,openingKwh:value.openingKwh,closingKwh:value.closingKwh,closingReadingId:value.closingReadingId,closingSourceTime:value.closingSourceTime};
 }
 return null;
}

class PostgresDemoEnergyBillRepository implements DemoEnergyBillRepository {
 constructor(private readonly db:DatabaseService,private readonly financial:FinancialApplicationService){}
 async withSiteLock<T>(siteCode:string,work:()=>Promise<T>):Promise<T>{
  const client=await this.db.pool.connect();
  const key=`demo-energy-manual-bill:${siteCode}`;
  let locked=false;
  try{
   locked=Boolean((await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',[key])).rows[0]?.locked);
   if(!locked)throw Error(`Another demo billing run is already active for ${siteCode}`);
   return await work();
  }finally{
   if(locked)try{await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[key]);}catch{}
   client.release();
  }
 }
 async loadContext(siteCode:string):Promise<DemoEnergyContext>{
  const site=(await this.db.query(`SELECT s.id,s.external_site_id AS "siteCode",cfg.version::text AS "billingSettingsVersion",to_char((now() AT TIME ZONE 'Asia/Bangkok')::date+cfg.payment_term_days,'YYYY-MM-DD') AS "dueDate",
   r.id AS "rateId",r.rate::text AS rate FROM sites s JOIN site_billing_settings cfg ON cfg.site_id=s.id
   LEFT JOIN LATERAL(SELECT id,rate FROM rate_versions WHERE site_id=s.id AND retired_at IS NULL AND effective_from<=(now() AT TIME ZONE 'Asia/Bangkok')::date AND (effective_to IS NULL OR effective_to>=(now() AT TIME ZONE 'Asia/Bangkok')::date) ORDER BY effective_from DESC,id DESC LIMIT 1) r ON true
   WHERE s.external_site_id=$1`,[siteCode])).rows[0];
  if(!site)throw Error(`Site ${siteCode} was not found or has no billing settings`);
  if(!site.rate)throw Error(`Site ${siteCode} has no currently effective electricity rate`);
  const meters=(await this.db.query(`SELECT m.id AS "meterId",m.device_id AS "deviceId",m.semantic_field AS "semanticField",m.billing_source_binding_id AS "bindingId",b.profile_revision_id AS "profileRevisionId"
   FROM billing_meters m JOIN devices d ON d.id=m.device_id AND d.site_id=m.site_id
   LEFT JOIN billing_source_bindings b ON b.id=m.billing_source_binding_id AND b.meter_id=m.id AND b.site_id=m.site_id AND b.device_id=m.device_id AND b.profile_revision_id=d.payload_profile_revision_id
   LEFT JOIN payload_profile_revisions p ON p.id=b.profile_revision_id
   WHERE m.site_id=$1 AND m.active=true ORDER BY m.id`,[site.id])).rows;
  if(meters.length!==1)throw Error(`Site ${siteCode} must have exactly one active billing meter`);
  const meter=meters[0]!;
  if(!meter.bindingId||!meter.profileRevisionId)throw Error(`Site ${siteCode} has no complete billing source binding for the device's current profile`);
  const ready=(await this.db.query(`SELECT EXISTS(SELECT 1 FROM billing_source_bindings b JOIN payload_profile_revisions p ON p.id=b.profile_revision_id
   WHERE b.id=$1 AND b.meter_id=$2 AND b.device_id=$3 AND b.canonical_tag='energy.active.import.total' AND b.target_unit='kWh'
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(p.config->'fields') f WHERE coalesce(f->>'sourceTag',f->>'tag')=b.source_tag AND f->>'tag'=b.canonical_tag AND f->>'sourceUnit'=b.source_unit AND f->>'targetUnit'=b.target_unit AND f->>'conversion'=b.conversion AND f->>'role'='billing-import')) AS ready`,[meter.bindingId,meter.meterId,meter.deviceId])).rows[0]?.ready;
  if(!ready)throw Error(`Site ${siteCode} billing source is no longer valid for the active profile`);
  const reading=(await this.db.query(`SELECT id,normalized_value::text AS "valueKwh",source_time AS "sourceTime",quality,unit
   FROM telemetry_raw WHERE site_id=$1 AND device_id=$2 AND semantic_field=$3 AND billing_source_binding_id=$4 AND payload_profile_revision_id=$5
    AND source_time>=now()-interval '120 seconds' AND source_time<=now()
   ORDER BY source_time DESC,received_time DESC,id DESC LIMIT 1`,[site.id,meter.deviceId,meter.semanticField,meter.bindingId,meter.profileRevisionId])).rows[0];
  if(!reading)throw Error(`Site ${siteCode} has no cumulative energy reading for its current billing source`);
  try{if(reading.quality!=='complete'||String(reading.unit).toLowerCase()!=='kwh'||reading.valueKwh===null)throw Error();scaledDecimal(reading.valueKwh,3);}catch{throw Error(`The latest cumulative energy reading for ${siteCode} is not verified`);}
  return {siteId:site.id,siteCode:site.siteCode,billingSettingsVersion:site.billingSettingsVersion,rateId:site.rateId,rate:site.rate,dueDate:site.dueDate,reading:{id:reading.id,valueKwh:reading.valueKwh,sourceTime:new Date(reading.sourceTime).toISOString(),meterId:meter.meterId,deviceId:meter.deviceId,bindingId:meter.bindingId,profileRevisionId:meter.profileRevisionId}};
 }
 private async checkpoints(siteId:string):Promise<DemoEnergyCheckpoint[]>{
  const rows=(await this.db.query(`SELECT bc.id,bc.status,bc.manual_lines,d.document_number FROM billing_cycles bc
   LEFT JOIN LATERAL(SELECT document_number FROM documents WHERE billing_cycle_id=bc.id AND document_type='invoice' AND is_current AND status IN ('issued','finalized') ORDER BY revision DESC,id DESC LIMIT 1) d ON true
   WHERE bc.site_id=$1 AND bc.billing_kind='manual' ORDER BY bc.cutoff_time DESC,bc.id DESC`,[siteId])).rows;
  return rows.map(checkpoint).filter((value):value is DemoEnergyCheckpoint=>value!==null);
 }
 async findByClosingReading(siteId:string,readingId:string){return (await this.checkpoints(siteId)).find(value=>value.closingReadingId===readingId)??null;}
 async latestCheckpoint(siteId:string){return (await this.checkpoints(siteId))[0]??null;}
 async assertContinuous(context:DemoEnergyContext,prior:DemoEnergyCheckpoint){
  const rows=(await this.db.query(`SELECT id,normalized_value::text AS value,quality,unit,billing_source_binding_id AS "bindingId" FROM telemetry_raw
   WHERE site_id=$1 AND device_id=$2 AND semantic_field='total_energy' AND source_time BETWEEN $3::timestamptz AND $4::timestamptz
    AND (billing_source_binding_id IS NOT NULL OR normalized_value IS NOT NULL)
   ORDER BY source_time,received_time,id`,[context.siteId,context.reading.deviceId,prior.closingSourceTime,context.reading.sourceTime])).rows;
  let previous:bigint;
  try{previous=scaledDecimal(prior.closingKwh,3);}catch{throw Error('Previous demo checkpoint is invalid');}
  for(const row of rows){
   if(row.id===prior.closingReadingId)continue;
   if(row.bindingId!==context.reading.bindingId)throw Error('Billing source changed inside the demo billing interval');
   let value:bigint;
   try{if(row.quality!=='complete'||String(row.unit).toLowerCase()!=='kwh'||row.value===null)throw Error();value=scaledDecimal(row.value,3);}catch{throw Error('Unverified cumulative energy data inside the demo billing interval');}
   if(value<previous)throw Error('Meter reset inside the demo billing interval');
   previous=value;
  }
 }
 async createManualInvoice(input:Parameters<DemoEnergyBillRepository['createManualInvoice']>[0],actorId:string){
  return this.financial.manualInvoice(input,actorId);
 }
}

async function actorFor(db:DatabaseService,email:string,password:string,siteId:string){
 if(!email||!password)throw Error('DEMO_BILLING_ACTOR_EMAIL and DEMO_BILLING_ACTOR_PASSWORD are required');
 const row=(await db.query("SELECT id,email,role,password_hash FROM users WHERE lower(email)=lower($1) AND status='active'",[email.trim()])).rows[0];
 const auth=new AuthService('demo-script-unused-access','demo-script-unused-refresh');
 if(!row?.password_hash||!auth.verifyPassword(password,row.password_hash))throw Error('Demo billing actor credentials are invalid');
 if(!['owner','accountant'].includes(row.role))throw Error('Demo billing actor must be an owner or accountant');
 const authorization=await new AuthorizationService(db).load(row.id,row.role);
 const actor={id:row.id,role:row.role,authorization};
 if(!hasPermission(actor,'business.billing.edit'))throw Error('Demo billing actor lacks business.billing.edit');
 const scope=siteScope(actor,'business');
 if(scope!==null&&!scope.includes(siteId))throw Error('Demo billing actor cannot access the requested site');
 return row.id as string;
}

async function main(){
 const args=argumentsFrom(process.argv.slice(2));
 if(process.env.DEMO_ENERGY_MANUAL_BILL_ENABLED!=='true')throw Error('Demo energy manual billing is disabled; set DEMO_ENERGY_MANUAL_BILL_ENABLED=true');
 const db=new DatabaseService({max:4,statementTimeout:5000,applicationName:'demo-energy-manual-bill'});
 try{
  const readiness=new FinancialReadinessService(db);
  const financial=new FinancialApplicationService(db,readiness);
  const repository=new PostgresDemoEnergyBillRepository(db,financial);
  const preview=await repository.loadContext(args.siteCode);
  const actorId=await actorFor(db,process.env.DEMO_BILLING_ACTOR_EMAIL??'',process.env.DEMO_BILLING_ACTOR_PASSWORD??'',preview.siteId);
  const result=await createDemoEnergyManualBill({enabled:true,siteCode:args.siteCode,actorId,...(args.firstBaseline!==undefined?{firstBaseline:args.firstBaseline}:{})},repository);
  process.stdout.write(`${JSON.stringify({...result,siteCode:args.siteCode})}\n`);
 }finally{await db.onModuleDestroy();}
}

main().catch(error=>{process.stderr.write(`Demo energy bill failed: ${error instanceof Error?error.message:String(error)}\n`);process.exitCode=1;});
