import 'reflect-metadata';
import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import {mkdir, readFile, writeFile,rm} from 'node:fs/promises';
import {S3Client,HeadBucketCommand,CreateBucketCommand,PutObjectCommand,GetObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {Pool} from 'pg';
import {DatabaseService} from '../src/database/database.service.js';
import {FinancialReadinessService} from '../src/modules/financial-readiness/financial-readiness.service.js';
import {FinancialApplicationService} from '../src/modules/billing/financial-application.service.js';
import {FinancialScheduler} from '../src/modules/billing/financial-scheduler.js';
import {SettingsService} from '../src/modules/settings/settings.service.js';
import {NotificationFeedService} from '../src/modules/notifications/notification-feed.service.js';
import {AuthService} from '../src/modules/identity/auth.service.js';
import {runBillingCutover} from '../src/scripts/billing-cutover-runner.js';
import {startAcceptanceApps} from './production-finance-browser-stack.js';

// Removing approval checks, site isolation, frozen snapshots or durable replay
// guards must break this flow. Every monetary expectation is hand calculated.
const target=new URL(process.env.PRODUCTION_FINANCE_DATABASE_URL??'');
const local=target.port==='15449'&&target.pathname==='/solar_financial_flow_review';
const ci=target.port==='15432'&&target.pathname==='/solar_readiness';
assert.equal(process.env.NODE_ENV,'production','Exercise the production path explicitly');assert.equal(process.env.LOCAL_FINANCIAL_FIXTURE_MARKER,undefined,'Never activate the synthetic TEST bypass');
assert.ok(['postgres:','postgresql:'].includes(target.protocol)&&target.hostname==='127.0.0.1'&&!target.search&&!target.hash&&(local||ci),'Disposable loopback database required');
const smtpPort=local?'11049':'11025',mailUrl=local?'http://127.0.0.1:18049':'http://127.0.0.1:18026';
assert.equal(process.env.SMTP_HOST,'127.0.0.1');assert.equal(process.env.SMTP_PORT,smtpPort);
assert.equal(process.env.REDIS_URL,local?'redis://127.0.0.1:16449':'redis://127.0.0.1:16432','Disposable loopback Redis required for browser sessions');
 assert.ok(local||['19000','19001'].includes(process.env.PLATFORM_CI_STORAGE_PORT??'19000'));
 assert.equal(process.env.STORAGE_ENDPOINT,local?'http://127.0.0.1:19049':`http://127.0.0.1:${process.env.PLATFORM_CI_STORAGE_PORT??'19000'}`);
assert.ok(local||process.env.COMPOSE_PROJECT_NAME?.match(/^solar-ci-[0-9a-f-]{36}$/));
const retain=process.argv.includes('--retain');assert.ok(!retain||local,'Only the dedicated review stack may retain acceptance data');
const schema='task9_'+randomUUID().replaceAll('-','');
const admin=new Pool({connectionString:target.toString()});
const pool=new Pool({connectionString:target.toString(),options:`-c search_path=${schema},public`,max:8});
const db={pool,query:pool.query.bind(pool),transaction:DatabaseService.prototype.transaction} as unknown as DatabaseService;
const readiness=new FinancialReadinessService(db),financial=new FinancialApplicationService(db,readiness),settings=new SettingsService(db);
const ids={owner:randomUUID(),admin:randomUUID(),recipient:randomUUID(),customer:randomUUID(),site:randomUUID(),blockedSite:randomUUID(),gateway:randomUUID(),meter:randomUUID(),device:randomUUID(),profile:randomUUID(),binding:randomUUID(),contract:randomUUID()};
const artifacts=new URL(`../../../test/artifacts/${process.env.PRODUCTION_FINANCE_ACCEPTANCE_ISOLATED==='true'?`final-fixes-${schema}/`:''}`,import.meta.url);
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const storage=new S3Client({endpoint:process.env.STORAGE_ENDPOINT,region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:process.env.STORAGE_ACCESS_KEY!,secretAccessKey:process.env.STORAGE_SECRET_KEY!}});
const bucket=process.env.STORAGE_BUCKET!;assert.equal(bucket,local?'solar-financial-flow-review':'solar-readiness');
const evidenceKey=`${schema}/bank-transfer.json`;
const messages=async()=>{const response=await fetch(`${mailUrl}/api/v1/messages?limit=500`);assert.equal(response.status,200);return (await response.json()) as {messages:Array<{ID:string;Subject:string}>};};
let retained=false;
let apps:Awaited<ReturnType<typeof startAcceptanceApps>>|undefined;
try {
 const existingMail=new Set((await messages()).messages.map(message=>message.ID));
 try{await storage.send(new HeadBucketCommand({Bucket:bucket}));}catch(error){if((error as any).$metadata?.httpStatusCode!==404)throw error;await storage.send(new CreateBucketCommand({Bucket:bucket}));}
 await admin.query(`CREATE SCHEMA ${schema}`);
 const tables=(await admin.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
 for(const {tablename}of tables){assert.match(tablename,/^[a-z_0-9]+$/);await pool.query(`CREATE TABLE ${schema}.${tablename} (LIKE public.${tablename} INCLUDING ALL)`);}
 // Copy actual immutability/validation triggers, not just the table shapes.
 const triggers=(await admin.query("SELECT pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace WHERE n.nspname='public' AND pn.nspname='public' AND NOT t.tgisinternal")).rows;
 for(const {definition}of triggers)await pool.query(definition.replace(/ ON public\./,` ON ${schema}.`));
 await pool.query('INSERT INTO system_settings SELECT * FROM public.system_settings');
 const auth=new AuthService('acceptance-access-secret-local-only-2026','acceptance-refresh-secret-local-only-2026');
const password=process.env.PRODUCTION_FINANCE_PASSWORD??('Acceptance-local-only-'+randomUUID());
 for(const [role,id]of [['owner',ids.owner],['admin',ids.admin],['customer_user',ids.recipient]])await pool.query("INSERT INTO users(id,email,display_name,role,status,password_hash,email_verified_at,verified_email) VALUES($1,$2,$3,$4,'active',$5,now(),$2)",[id,`${role}@acceptance.example.test`,`${role} acceptance`,role,auth.hashPassword(password)]);
 await pool.query("INSERT INTO customers(id,name,code,region,legal_name,tax_id,tax_address,document_email,status) VALUES($1::uuid,'Bangkok Energy Manufacturing',$1::text,'Bangkok','Bangkok Energy Manufacturing Co., Ltd.','0105559123456','99 Rama IX Road, Bangkok','customer_user@acceptance.example.test','active')",[ids.customer]);
 await pool.query('UPDATE users SET customer_id=$2 WHERE id=$1',[ids.recipient,ids.customer]);
 for(const [site,name]of [[ids.site,'Bangkok factory rooftop'],[ids.blockedSite,'Chonburi warehouse incomplete']]) {
  await pool.query("INSERT INTO sites(id,customer_id,name,capacity_mwp,status,timezone) VALUES($1,$2,$3,0.25,'active','Asia/Bangkok')",[site,ids.customer,name]);
  if(site===ids.site)await pool.query('INSERT INTO site_account_assignments(id,user_id,site_id) VALUES($1,$2,$3)',[randomUUID(),ids.recipient,site]);
  await pool.query("INSERT INTO site_billing_settings(site_id,service_start_date,payment_term_days,recipient_user_ids,tax_rate,tax_confirmed,prices_include_tax) VALUES($1,'2026-09-01',30,$2,7,$3,false)",[site,[ids.recipient],site===ids.site]);
 }
 await pool.query("INSERT INTO gateways(id,site_id,name,protocol,endpoint) VALUES($1,$2,'ACCEPTANCE-FACTORY','mqtt','/ACCEPTANCE-FACTORY/#')",[ids.gateway,ids.site]);
 await pool.query("INSERT INTO payload_profile_revisions(id,profile_id,version,config) VALUES($1,'acceptance-meter','1.0.0',$2)",[ids.profile,JSON.stringify({fields:[{sourceTag:'energy',tag:'energy.active.import.total',sourceUnit:'kWh',targetUnit:'kWh',conversion:'identity',role:'billing-import'}]})]);
 await pool.query("INSERT INTO devices(id,gateway_id,site_id,name,device_type,model,serial_number,payload_profile_revision_id,external_device_id) VALUES($1::uuid,$2,$3,'Revenue meter','meter','Schneider PM2230',$1::text,$4,'acceptance-meter')",[ids.device,ids.gateway,ids.site,ids.profile]);
 await pool.query("INSERT INTO billing_meters(id,site_id,device_id,semantic_field) VALUES($1,$2,$3,'energy.active.import.total')",[ids.meter,ids.site,ids.device]);
 await pool.query("INSERT INTO billing_source_bindings(id,meter_id,site_id,device_id,profile_revision_id,source_tag,canonical_tag,source_unit,target_unit,conversion,measurement_purpose,created_by) VALUES($1,$2,$3,$4,$5,'energy','energy.active.import.total','kWh','kWh','identity','solar-delivered',$6)",[ids.binding,ids.meter,ids.site,ids.device,ids.profile,ids.owner]);
 await pool.query('UPDATE billing_meters SET billing_source_binding_id=$2 WHERE id=$1',[ids.meter,ids.binding]);
 await pool.query("INSERT INTO contracts(id,site_id,version,start_date,status,company_name,tax_id,tax_address,signer_name,payment_terms,recipient_user_ids) VALUES($1,$2,1,'2026-09-01','active','Bangkok Energy Manufacturing Co., Ltd.','0105559123456','99 Rama IX Road, Bangkok','Somchai Energy','30 calendar days',$3)",[ids.contract,ids.site,[ids.recipient]]);
 await pool.query("INSERT INTO rate_versions(id,site_id,contract_id,effective_from,rate_type,rate,currency,changed_by,change_reason) VALUES($1,$2,$3,'2026-09-01','fixed_kwh',4.3210,'THB',$4,'Acceptance agreed tariff')",[randomUUID(),ids.site,ids.contract,ids.owner]);
 for(const [date,value]of [['2026-09-01',125000],['2026-10-01',126000]])await pool.query("INSERT INTO telemetry_raw(id,device_id,site_id,source_time,received_time,raw_payload,normalized_value,unit,quality,ingestion_id,semantic_field,total_energy_kwh,payload_profile_revision_id,billing_source_binding_id) VALUES($1::uuid,$2,$3,($4::date::timestamp AT TIME ZONE 'Asia/Bangkok'),now(),$5,$6,'kWh','complete',$1::text,'energy.active.import.total',$6,$7,$8)",[randomUUID(),ids.device,ids.site,date,JSON.stringify({acceptance:true,source:'controlled boundary reading'}),value,ids.profile,ids.binding]);
 // LIKE does not copy foreign keys. Validate the seeded graph, then enforce the
 // migrated constraints (including original deferral rules) for every workflow write.
 const foreignKeys=(await pool.query("SELECT c.relname AS tablename,k.conname,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND k.contype='f'")).rows;
 for(const key of foreignKeys){assert.match(key.tablename,/^[a-z_0-9]+$/);assert.match(key.conname,/^[a-z_0-9]+$/);await pool.query(`ALTER TABLE ${schema}.${key.tablename} ADD CONSTRAINT ${key.conname} ${key.definition.replaceAll('REFERENCES public.',`REFERENCES ${schema}.`)}`);}
 const owner={id:ids.owner,role:'owner'};
 const initial=await readiness.status(owner,{siteId:ids.site,periodStart:'2026-09-01',periodEnd:'2026-09-30'});
 assert.equal(initial.approval,null);assert.equal(initial.actions.calculate.enabled,false);
 const feed=new NotificationFeedService(db,readiness);const setup=(await feed.feed(owner)).rows.filter((row:any)=>row.metadata?.type==='finance-readiness');
 assert.equal(setup.length,1);assert.equal(setup[0].destination,'/settings/company');
 await assert.rejects(readiness.confirm(owner),(error:any)=>error.getStatus()===503);
 await assert.rejects(readiness.confirm({id:ids.admin,role:'admin'}),(error:any)=>error.getStatus()===403);
 if(process.env.PRODUCTION_FINANCE_BROWSER==='true'){
  apps=await startAcceptanceApps(target.toString(),password,schema,ids.site,retain,ids.blockedSite);apps.browser('setup');
 }else{
  const image=await readFile(new URL('../../web/public/brand/solar-roof-mark.png',import.meta.url));
  await settings.updateCompanyProfile({companyName:'Siam Solar Operations Co., Ltd.',taxId:'0105558123456',branch:'Head office',address:'88 Wireless Road, Bangkok 10330',phone:'021234567',email:'billing@acceptance.example.test',logoUrl:`data:image/png;base64,${image.toString('base64')}`,signatureDataUri:`data:image/png;base64,${image.toString('base64')}`,signatoryName:'Natee Energy',signatoryTitle:'Finance Director'},ids.owner);
  await settings.saveBankAccount({bankName:'Bangkok Bank',bankCode:'BBL',accountName:'Siam Solar Operations Co., Ltd.',accountNumber:'1234567890',branchName:'Head office',promptpayId:'',isDefault:true},ids.owner);
  await assert.rejects(financial.calculate(ids.site,'2026-09-01','2026-09-30',ids.owner),(error:any)=>error.getStatus()===503&&error.getResponse().missing.includes('approval.confirmation'));
 }
 const savedLogo=(await settings.getCompanyProfile()).logoUrl!;
 await readiness.confirm(owner);
 // The initial run fails here with flags off; only disposable harness wiring enables writes.
 assert.equal((await readiness.status(owner,{siteId:ids.site,periodStart:'2026-09-01',periodEnd:'2026-09-30'})).actions.calculate.enabled,true);
 assert.equal((await readiness.status(owner,{siteId:ids.blockedSite})).actions.calculate.enabled,false);
 const cycle=(await financial.calculate(ids.site,'2026-09-01','2026-09-30',ids.owner)).cycles[0];
 assert.equal(cycle.financial_scope,'PRODUCTION');assert.equal(Number(cycle.subtotal),4321);assert.equal(Number(cycle.simulated_tax),302.47);assert.equal(Number(cycle.amount),4623.47);
 const invoice=(await financial.issueInvoice(cycle.id,ids.owner)).document;
 assert.equal(invoice.snapshot.policy.scope,'PRODUCTION');assert.equal(invoice.snapshot.company.company_name,'Siam Solar Operations Co., Ltd.');assert.equal(invoice.snapshot.recipients[0].id,ids.recipient);
 await financial.send(cycle.id,ids.owner);
 const transfer=Buffer.from(JSON.stringify({amount:'4623.47',currency:'THB',transferAt:'2026-10-10T01:00:00Z',payer:'Bangkok Energy Manufacturing Co., Ltd.',account:'1234567890',acceptanceFixture:true}));
 await storage.send(new PutObjectCommand({Bucket:bucket,Key:evidenceKey,Body:transfer,ContentType:'application/json'}));
 const stored=await storage.send(new GetObjectCommand({Bucket:bucket,Key:evidenceKey}));assert.equal(hash(Buffer.from(await stored.Body!.transformToByteArray())),hash(transfer));
 await pool.query(`CREATE FUNCTION reject_payment_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='finance.payment_submitted' THEN RAISE EXCEPTION 'Acceptance payment audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_payment_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_payment_audit();`);
 try{
  await assert.rejects(financial.submitPayment(cycle.id,{amount:'4623.47',evidenceKey},ids.recipient),/Acceptance payment audit failure/);
  assert.equal((await pool.query('SELECT count(*)::int n FROM payments')).rows[0].n,0);assert.equal((await pool.query('SELECT status FROM billing_cycles WHERE id=$1',[cycle.id])).rows[0].status,'approved');
 }finally{await pool.query('DROP TRIGGER reject_payment_audit ON audit_events');}
 const submitted=await Promise.allSettled(Array.from({length:4},()=>financial.submitPayment(cycle.id,{amount:'4623.47',evidenceKey,payerName:'Bangkok Energy Manufacturing Co., Ltd.',paymentMethod:'bank_transfer',originBank:'Bangkok Bank',originAccount:'9876543210'},ids.recipient)));
 assert.equal(submitted.filter(result=>result.status==='fulfilled').length,1,'Concurrent duplicate transfer is accepted once');
 for(const result of submitted)if(result.status==='rejected')assert.equal(result.reason.getStatus(),409);
 const payment=submitted.find(result=>result.status==='fulfilled')! as PromiseFulfilledResult<Awaited<ReturnType<typeof financial.submitPayment>>>;
 const metadata={paymentId:payment.value.paymentId,verifiedAmount:'4623.47',verifiedTransferAt:'2026-10-10T01:00:00Z'};
 const receipt=(await financial.verifyPayment(cycle.id,'approved',undefined,ids.owner,metadata)).receipt;
 assert.equal(receipt.snapshot.invoiceNumber,invoice.document_number);assert.equal(receipt.snapshot.company.company_name,invoice.snapshot.company.company_name);
 await financial.send(cycle.id,ids.owner);
 await mkdir(artifacts,{recursive:true});
 const originalRows=(await pool.query('SELECT id,document_number,snapshot,content_hash FROM documents ORDER BY id')).rows;
 const mailIds:Record<string,string>={};
 for(const document of [invoice,receipt]){
  const bytes=(await pool.query('SELECT pdf_bytes FROM document_artifacts WHERE document_id=$1',[document.id])).rows[0].pdf_bytes as Buffer;
  assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.equal(hash(bytes),document.content_hash);
  const captured=(await messages()).messages.filter(message=>!existingMail.has(message.ID)&&message.Subject.includes(document.document_number));assert.equal(captured.length,1);assert.ok(!captured[0].Subject.includes('TEST'));
  mailIds[document.document_type]=captured[0].ID;
  const detail=await (await fetch(`${mailUrl}/api/v1/message/${captured[0].ID}`)).json() as any;assert.equal(detail.Attachments.length,1);
  const attachment=Buffer.from(await (await fetch(`${mailUrl}/api/v1/message/${captured[0].ID}/part/${detail.Attachments[0].PartID}`)).arrayBuffer());assert.equal(hash(attachment),document.content_hash);
  await writeFile(new URL(`production-${document.document_type}.pdf`,artifacts),bytes);
 }
 const mailBefore=(await messages()).messages.map(message=>message.ID).sort();
 assert.equal((await financial.calculate(ids.site,'2026-09-01','2026-09-30',ids.owner)).cycles[0].id,cycle.id);
 assert.equal((await financial.issueInvoice(cycle.id,ids.owner)).document.id,invoice.id);
 assert.equal((await financial.verifyPayment(cycle.id,'approved',undefined,ids.owner,metadata)).receipt.id,receipt.id);
 await financial.send(cycle.id,ids.owner);
 assert.deepEqual(await financial.monthly(new Date('2026-09-30T17:59:00Z')),[]);
 const at=new Date('2026-09-30T18:00:00Z');await new FinancialScheduler(financial,readiness).tick(at);await new FinancialScheduler(financial,readiness).tick(at);
 const jobs=(await pool.query('SELECT site_id,state,last_error FROM financial_month_jobs ORDER BY site_id')).rows;
 assert.equal(jobs.find(job=>job.site_id===ids.site).state,'done');assert.equal(jobs.find(job=>job.site_id===ids.blockedSite).state,'blocked');
 const notices=(await pool.query('SELECT detail FROM financial_staff_notices WHERE site_id=$1',[ids.blockedSite])).rows;assert.equal(notices.length,1);assert.ok(notices[0].detail.missing.includes('site.tax'));
 const notifications=(await pool.query('SELECT id,user_id,title,status FROM notification_deliveries ORDER BY id')).rows;assert.equal(notifications.length,1);assert.equal(notifications[0].user_id,ids.owner);assert.equal(notifications[0].status,'delivered');assert.ok(!notifications[0].title.includes('TEST'));
 const cutover={siteId:ids.site,ownerId:ids.owner,periodStart:'2026-09-01',periodEnd:'2026-09-30',operationKey:`acceptance-${schema}`,apply:true};
 assert.equal((await runBillingCutover(cutover,db,readiness,financial)).documentId,invoice.id);await runBillingCutover(cutover,db,readiness,financial);
 assert.deepEqual((await messages()).messages.map(message=>message.ID).sort(),mailBefore);
 await settings.updateCompanyProfile({logoUrl:''},ids.owner);
 assert.equal((await readiness.status(owner)).approval,null);
 await assert.rejects(financial.send(cycle.id,ids.owner),(error:any)=>error.getStatus()===503);
 assert.deepEqual((await pool.query('SELECT id,document_number,snapshot,content_hash FROM documents ORDER BY id')).rows,originalRows);
 for(const document of [invoice,receipt])assert.equal(hash((await pool.query('SELECT pdf_bytes FROM document_artifacts WHERE document_id=$1',[document.id])).rows[0].pdf_bytes),document.content_hash);
 await assert.rejects(pool.query('UPDATE document_artifacts SET sha256=$2 WHERE document_id=$1',[invoice.id,'0'.repeat(64)]),/immutable/);
 await settings.updateCompanyProfile({logoUrl:savedLogo},ids.owner);const finalReadiness=await readiness.confirm(owner);
 const audits=(await pool.query('SELECT action,count(*)::int n FROM audit_events GROUP BY action ORDER BY action')).rows;
 for(const action of ['finance.approval.confirmed','company.profile.updated','company.bank.created','finance.issue_invoice','finance.issue_receipt','finance.send','finance.cutover_started'])assert.ok(audits.some(row=>row.action===action&&row.n>0),action);
 for(const [action,want]of [['finance.calculate',1],['finance.issue_invoice',1],['finance.issue_receipt',1],['finance.payment_submitted',1],['payment.verify_approved',1],['finance.cutover_started',1],['finance.send',2],['finance.send_started',2]])assert.equal(audits.find(row=>row.action===action)?.n,want,`${action} replay audit uniqueness`);
 const counts=(await pool.query("SELECT (SELECT count(*)::int FROM billing_cycles) cycles,(SELECT count(*)::int FROM documents) documents,(SELECT count(*)::int FROM payments) payments,(SELECT count(*)::int FROM financial_delivery_outbox WHERE state='sent') sent,(SELECT count(*)::int FROM financial_month_jobs) jobs")).rows[0];
 assert.deepEqual(counts,{cycles:1,documents:2,payments:1,sent:2,jobs:2});
 const evidence={schema,ids,counts,audits,jobs,notifications,approvalId:finalReadiness.approval!.id,invoiceId:invoice.id,receiptId:receipt.id,invoiceHash:invoice.content_hash,receiptHash:receipt.content_hash,evidenceKey,mailUrl,mailIds,retained:false};
 await writeFile(new URL('production-finance.json',artifacts),JSON.stringify(evidence,null,2));
 apps?.browser('documents',cycle.id);
 if(retain){const scoped=new URL(target);scoped.searchParams.set('options',`-c search_path=${schema},public`);evidence.retained=true;await writeFile(new URL('production-finance-runtime.json',artifacts),JSON.stringify({databaseUrl:scoped.toString(),password,apiUrl:'http://127.0.0.1:13059',webUrl:'http://localhost:13049',pids:apps?.pids,...evidence},null,2),{mode:0o600});await writeFile(new URL('production-finance.json',artifacts),JSON.stringify(evidence,null,2));retained=true;}
 console.log(JSON.stringify(evidence,null,2));
} finally {
 if(!retained)await apps?.stop();await pool.end();
 if(!retained){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await storage.send(new DeleteObjectCommand({Bucket:bucket,Key:evidenceKey}));await rm(new URL('production-browser-fixture.json',artifacts),{force:true});}
 storage.destroy();await admin.end();
}
