import 'reflect-metadata';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {Pool} from 'pg';
import {DatabaseService} from '../src/database/database.service.js';
import {AuthService} from '../src/modules/identity/auth.service.js';
import {FinancialReadinessService} from '../src/modules/financial-readiness/financial-readiness.service.js';
import {FinancialApplicationService} from '../src/modules/billing/financial-application.service.js';
import {SettingsService} from '../src/modules/settings/settings.service.js';
import {startAcceptanceApps} from './production-finance-browser-stack.js';

// Real production API + rendered Next application. Only owned prerequisite data
// is seeded; all issuance, position and signature mutations occur through UI.
const target=new URL(process.env.PRODUCTION_FINANCE_DATABASE_URL!);
assert.ok(['postgres:','postgresql:'].includes(target.protocol));assert.equal(target.hash,'');
assert.equal(target.hostname,'127.0.0.1');assert.equal(target.port,'15449');assert.equal(target.pathname,'/solar_financial_flow_review');assert.equal(target.search,'');
assert.equal(process.env.NODE_ENV,'production');assert.equal(process.env.LOCAL_FINANCIAL_FIXTURE_MARKER,undefined);
assert.equal(process.env.PRODUCTION_FINANCE_ACCEPTANCE_ISOLATED,'true');
assert.equal(process.env.SMTP_HOST,'127.0.0.1');assert.equal(process.env.SMTP_PORT,'11049');assert.equal(process.env.REDIS_URL,'redis://127.0.0.1:16449');
const password=process.env.PRODUCTION_FINANCE_PASSWORD!;assert.ok(password);
const schema='task9_'+randomUUID().replaceAll('-','');
const artifacts=new URL(`../../../test/artifacts/final-fixes-${schema}/`,import.meta.url);
const admin=new Pool({connectionString:target.toString()});
const pool=new Pool({connectionString:target.toString(),options:`-c search_path=${schema},public`,max:8});
const db={pool,query:pool.query.bind(pool),transaction:DatabaseService.prototype.transaction} as unknown as DatabaseService;
const readiness=new FinancialReadinessService(db),financial=new FinancialApplicationService(db,readiness),settings=new SettingsService(db);
const ids={owner:randomUUID(),accountant:randomUUID(),recipient:randomUUID(),position:randomUUID(),reviewerPosition:randomUUID(),customer:randomUUID(),sites:[randomUUID(),randomUUID(),randomUUID()] as const};
const recipients=[ids.recipient,randomUUID(),randomUUID()];
const ownerName='Somchai Approval',reviewerName='Suda Receipt Review';
let apps:Awaited<ReturnType<typeof startAcceptanceApps>>|undefined;
try{
 await admin.query(`CREATE SCHEMA ${schema}`);await mkdir(artifacts,{recursive:true});
 for(const {tablename} of (await admin.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows){assert.match(tablename,/^[a-z_0-9]+$/);await pool.query(`CREATE TABLE ${schema}.${tablename} (LIKE public.${tablename} INCLUDING ALL)`);}
 const triggers=(await admin.query("SELECT pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace WHERE n.nspname='public' AND pn.nspname='public' AND NOT t.tgisinternal")).rows;
 for(const {definition}of triggers)await pool.query(definition.replace(/ ON public\./,` ON ${schema}.`));
 await pool.query('INSERT INTO system_settings SELECT * FROM public.system_settings');
 const auth=new AuthService('acceptance-access-secret-local-only-2026','acceptance-refresh-secret-local-only-2026');
 for(const [role,id,name]of [['owner',ids.owner,ownerName],['accountant',ids.accountant,reviewerName],['customer_user',ids.recipient,'Customer Contact']])await pool.query("INSERT INTO users(id,email,display_name,role,status,password_hash,email_verified_at,verified_email,preferred_language) VALUES($1,$2,$3,$4,'active',$5,now(),$2,'en')",[id,`${role}@acceptance.example.test`,name,role,auth.hashPassword(password)]);
 await pool.query("INSERT INTO employee_positions(id,name) VALUES($1,'Finance Director'),($2,'Receipt Reviewer')",[ids.position,ids.reviewerPosition]);
 const rules={'business.dashboard.view':true,'business.billing.view':true,'business.billing.edit':true,'business.billing.approve':true,'business.documents.view':true,'business.documents.download':true,'business.receipts.view':true};
 for(const id of [ids.position,ids.reviewerPosition])await pool.query("INSERT INTO employee_position_domains(position_id,domain,rules) VALUES($1,'business',$2)",[id,JSON.stringify(rules)]);
 await pool.query('UPDATE users SET company_position_id=$2 WHERE id=$1',[ids.accountant,ids.reviewerPosition]);
 await pool.query("INSERT INTO employee_domain_grants(user_id,domain,position_id,scope_mode,updated_by) VALUES($1,'business',$2,'all',$3)",[ids.accountant,ids.reviewerPosition,ids.owner]);
 await pool.query("INSERT INTO customers(id,name,code,region,legal_name,tax_id,tax_address,document_email,status) VALUES($1,'Bangkok Energy Customer','ACCEPTANCE','Bangkok','Bangkok Energy Customer Co., Ltd.','0105559123456','99 Rama IX Road, Bangkok','customer_user@acceptance.example.test','active')",[ids.customer]);
 await pool.query('UPDATE users SET customer_id=$2 WHERE id=$1',[ids.recipient,ids.customer]);
 for(const [i,id]of recipients.entries())if(i>0)await pool.query("INSERT INTO users(id,email,display_name,role,status,password_hash,email_verified_at,verified_email,customer_id) VALUES($1,$2,'Customer Contact','customer_user','active',$3,now(),$2,$4)",[id,`customer_${i}@acceptance.example.test`,auth.hashPassword(password),ids.customer]);
 const siteNames=['Single approval rooftop','Batch success rooftop','Batch corrective rooftop'];
 for(const [i,id]of ids.sites.entries()){
  await pool.query("INSERT INTO sites(id,customer_id,name,capacity_mwp,status,timezone) VALUES($1,$2,$3,0.25,'active','Asia/Bangkok')",[id,ids.customer,siteNames[i]]);
  await pool.query("INSERT INTO site_billing_settings(site_id,service_start_date,payment_term_days,recipient_user_ids,tax_rate,tax_confirmed,prices_include_tax) VALUES($1,'2026-09-01',30,$2,7,true,false)",[id,[recipients[i]]]);
  await pool.query('INSERT INTO site_account_assignments(id,user_id,site_id) VALUES($1,$2,$3)',[randomUUID(),recipients[i],id]);
  // Global live capabilities include site configuration prerequisites even when
  // these particular prepared bills use manual lines; provision valid bindings.
  const gateway=randomUUID(),profile=randomUUID(),device=randomUUID(),meter=randomUUID(),binding=randomUUID();
  await pool.query("INSERT INTO gateways(id,site_id,name,protocol,endpoint) VALUES($1,$2,$3,'mqtt',$4)",[gateway,id,'ACCEPTANCE-GW-'+i,`/ACCEPTANCE-GW-${i}/#`]);
  await pool.query("INSERT INTO payload_profile_revisions(id,profile_id,version,config) VALUES($1,$2,'1.0.0',$3)",[profile,'acceptance-meter-'+i,JSON.stringify({fields:[{sourceTag:'energy',tag:'energy.active.import.total',sourceUnit:'kWh',targetUnit:'kWh',conversion:'identity',role:'billing-import'}]})]);
  await pool.query("INSERT INTO devices(id,gateway_id,site_id,name,device_type,model,serial_number,payload_profile_revision_id,external_device_id) VALUES($1,$2,$3,'Revenue meter','meter','Schneider PM2230',$4,$5,$4)",[device,gateway,id,'ACCEPTANCE-'+i,profile]);
  await pool.query("INSERT INTO billing_meters(id,site_id,device_id,semantic_field) VALUES($1,$2,$3,'energy.active.import.total')",[meter,id,device]);
  await pool.query("INSERT INTO billing_source_bindings(id,meter_id,site_id,device_id,profile_revision_id,source_tag,canonical_tag,source_unit,target_unit,conversion,measurement_purpose,created_by) VALUES($1,$2,$3,$4,$5,'energy','energy.active.import.total','kWh','kWh','identity','solar-delivered',$6)",[binding,meter,id,device,profile,ids.owner]);
  await pool.query('UPDATE billing_meters SET billing_source_binding_id=$2 WHERE id=$1',[meter,binding]);
  await pool.query("INSERT INTO rate_versions(id,site_id,effective_from,rate_type,rate,currency,changed_by,change_reason) VALUES($1,$2,'2026-09-01','fixed_kwh',4.3210,'THB',$3,'Controlled browser acceptance tariff')",[randomUUID(),id,ids.owner]);
 }
 const logo='data:image/png;base64,'+(await readFile(new URL('../../web/public/brand/solar-roof-mark.png',import.meta.url))).toString('base64');
 await settings.updateCompanyProfile({companyName:'Siam Solar Workflow Co., Ltd.',taxId:'0105558123456',branch:'Head office',address:'88 Wireless Road, Bangkok 10330',phone:'021234567',email:'billing@acceptance.example.test',logoUrl:logo},ids.owner);
 await settings.saveBankAccount({bankName:'Bangkok Bank',bankCode:'BBL',accountName:'Siam Solar Workflow Co., Ltd.',accountNumber:'1234567890',branchName:'Head office',promptpayId:'',isDefault:true},ids.owner);
 await readiness.confirm({id:ids.owner,role:'owner'});
 const cycles:string[]=[];
 for(const siteId of ids.sites){const result=await financial.manualInvoice({siteId,lines:[{description:'Energy services',quantity:'1',unitPrice:'100'}],dueDate:'2026-11-15',idempotencyKey:randomUUID()},ids.owner);cycles.push(result.cycle.id);}
 // Persist a stale calculated-settings version to exercise a real independent
 // corrective failure, while retaining canonical pending eligibility in UI.
 await pool.query('UPDATE site_billing_settings SET version=version+1 WHERE site_id=$1',[ids.sites[2]]);
 assert.equal((await pool.query('SELECT count(*)::int n FROM documents')).rows[0].n,0);assert.equal((await pool.query('SELECT count(*)::int n FROM document_number_series')).rows[0].n,0);
 apps=await startAcceptanceApps(target.toString(),password,schema,ids.sites[0],false,ids.sites[2],{browserScript:'test/platform/finance-workflow-ui-browser.mjs',nextOutputDir:'.next/task7-webpack',fixture:{cycles,ids,ownerName,reviewerName,siteNames}});
 apps.browser('issuance');
 const invoice=(await pool.query("SELECT * FROM documents WHERE billing_cycle_id=$1 AND document_type='invoice'",[cycles[0]])).rows[0];assert.ok(invoice?.document_number);
 const ownerIdentity=(await pool.query('SELECT display_name,signature_data,p.name AS position FROM users u JOIN employee_positions p ON p.id=u.company_position_id WHERE u.id=$1',[ids.owner])).rows[0];
 assert.equal(ownerIdentity.position,'Workflow Approval Director');assert.equal(invoice.snapshot.approver.userId,ids.owner);assert.equal(invoice.snapshot.approver.displayName,ownerName);assert.equal(invoice.snapshot.approver.position,ownerIdentity.position);assert.equal(invoice.snapshot.approver.signatureDataUri,ownerIdentity.signature_data);
 const issued=(await pool.query("SELECT billing_cycle_id,document_number FROM documents WHERE document_type='invoice' ORDER BY billing_cycle_id")).rows;assert.equal(issued.length,2);assert.ok(issued.some(row=>row.billing_cycle_id===cycles[1]));assert.ok(!issued.some(row=>row.billing_cycle_id===cycles[2]));
 assert.equal((await pool.query('SELECT status FROM billing_cycles WHERE id=$1',[cycles[2]])).rows[0].status,'pending_issue_approval');
 // The payment is a controlled real pending submission prerequisite. Its
 // approval and receipt allocation happen solely through the rendered UI.
 const payment=await financial.submitPayment(cycles[0]!,{amount:'107.00',evidenceKey:`${schema}/controlled-transfer`,payerName:'Bangkok Energy Customer'},ids.recipient);
 assert.equal((await pool.query("SELECT count(*)::int n FROM documents WHERE document_type='receipt'")).rows[0].n,0);
 apps.browser('settlement');
 const receipt=(await pool.query("SELECT * FROM documents WHERE billing_cycle_id=$1 AND document_type='receipt'",[cycles[0]])).rows[0];assert.ok(receipt?.document_number);
 const reviewerIdentity=(await pool.query('SELECT signature_data,p.name AS position FROM users u JOIN employee_positions p ON p.id=u.company_position_id WHERE u.id=$1',[ids.accountant])).rows[0];
 assert.equal(receipt.snapshot.approver.userId,ids.accountant);assert.equal(receipt.snapshot.approver.displayName,reviewerName);assert.equal(receipt.snapshot.approver.position,reviewerIdentity.position);assert.equal(receipt.snapshot.approver.signatureDataUri,reviewerIdentity.signature_data);assert.notEqual(receipt.snapshot.approver.userId,invoice.snapshot.approver.userId);assert.notEqual(receipt.snapshot.approver.signatureDataUri,invoice.snapshot.approver.signatureDataUri);assert.equal(receipt.snapshot.invoiceNumber,invoice.document_number);
 assert.equal((await pool.query('SELECT verified_by FROM payments WHERE id=$1',[payment.paymentId])).rows[0].verified_by,ids.accountant);
 for(const document of [invoice,receipt]){const bytes=(await pool.query('SELECT pdf_bytes FROM document_artifacts WHERE document_id=$1',[document.id])).rows[0].pdf_bytes;assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.equal(createHash('sha256').update(bytes).digest('hex'),document.content_hash);await writeFile(new URL(document.document_type+'.pdf',artifacts),bytes);}
 const issuedBrowser=JSON.parse(await readFile(new URL('live-browser-issuance.json',artifacts),'utf8')),settledBrowser=JSON.parse(await readFile(new URL('live-browser-settlement.json',artifacts),'utf8'));
 assert.equal(issuedBrowser.pdfHashes.invoice,invoice.content_hash);assert.equal(settledBrowser.pdfHashes.receipt,receipt.content_hash);
 await writeFile(new URL('workflow-database-evidence.json',artifacts),JSON.stringify({schema,invoice:{number:invoice.document_number,approver:invoice.snapshot.approver,hash:invoice.content_hash},receipt:{number:receipt.document_number,approver:receipt.snapshot.approver,hash:receipt.content_hash},checks:['no-number-before-approval','staff-select-create-through-ui','single-ui-approval','mixed-ui-issued-and-corrective-failure','receipt-ui-approval-distinct-actor-signature','immutable-original-pdf-sha256'],password:'[REDACTED]'},null,2));
 console.log('PASS live finance workflow UI acceptance; artifacts: '+artifacts.pathname);
}finally{
 await apps?.stop();await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();await rm(new URL('production-browser-fixture.json',artifacts),{force:true});
}
