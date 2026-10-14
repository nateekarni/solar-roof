import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {DatabaseService} from '../../database/database.service.js';
import {FinancialReadinessService} from '../financial-readiness/financial-readiness.service.js';
import {FinancialApplicationService} from './financial-application.service.js';
import {SiteBillingService} from './site-billing.service.js';
import {SiteBillingController} from './site-billing.controller.js';
import {BillingController} from './billing.controller.js';
import {financialDocumentSnapshot,renderFinancialDocumentPdf} from '../documents/financial-document-pdf.js';
import {DocumentIdentityService} from '../identity/document-identity.js';
import {ContractPdfService} from '../documents/contract-pdf.service.js';
import {routeAllowed} from '../../common/auth/route-policy.js';
import {authorizedRoute} from '../../common/auth/domain-route-policy.js';
import nodemailer from 'nodemailer';
import {SettingsService} from '../settings/settings.service.js';
import {renderDocumentPdf} from '../documents/document-layout.js';
import sharp from 'sharp';
import {Reflector} from '@nestjs/core';
import type {ExecutionContext} from '@nestjs/common';
import {RolesGuard as LegacyRolesGuard} from '../../common/roles.guard.js';
import {PlatformAccessGuard} from '../../common/auth/platform-access.guard.js';
import {effectiveAuthorization} from '../../common/auth/authorization.js';
import {TeamService} from '../identity/team.service.js';
import {financialPolicySnapshot,financialPolicyHash} from './financial-policy.js';
import {manualTotals} from './site-billing-policy.js';

test('legacy invoice generation and approval-status routes deny unauthorized actors through the registered guard chain',async()=>{
 for(const [handler,method,path] of [
  [BillingController.prototype.generateInvoiceForBillingCycle,'POST','/v1/billing-cycles/cycle/generate-invoice'],
  [BillingController.prototype.updateBillingCycleStatus,'PATCH','/v1/billing-cycles/cycle/status'],
 ] as const){
  for(const role of ['admin','operator','customer_user','accountant']){
   const authorization=effectiveAuthorization(role,1,[{domain:'business',preset:{'business.billing.edit':false},overrides:{},scope:{mode:'all',siteIds:[]}}]);
   const context={getHandler:()=>handler,getClass:()=>BillingController,switchToHttp:()=>({getRequest:()=>({method,path,user:{id:'actor',role,authorization}})})} as unknown as ExecutionContext;
   const db={query:async()=>{throw new Error('Unauthorized request reached resource lookup');}} as unknown as DatabaseService;
   await assert.rejects(async()=>{new LegacyRolesGuard(new Reflector()).canActivate(context);await new PlatformAccessGuard(db,new Reflector()).canActivate(context);},(error:any)=>error.getStatus()===403);
  }
 }
});

// Real database SQL, transactions, readiness and PDF rendering; SMTP is the only external double.
test('production finance freezes configured policy and artifacts across calculation, revision, settlement, manual issuance and replay',
 {skip:!process.env.FINANCIAL_READINESS_TEST_DATABASE_URL},async t=>{
 const url=new URL(process.env.FINANCIAL_READINESS_TEST_DATABASE_URL!);
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15449');assert.equal(url.pathname,'/solar_financial_flow_review');
 const schema='task7_'+randomUUID().replaceAll('-','');
 const admin=new Pool({connectionString:url.toString()});await admin.query(`CREATE SCHEMA ${schema}`);
 const pool=new Pool({connectionString:url.toString(),options:`-c search_path=${schema},public`,max:8,application_name:schema});
 const savedEnv={...process.env};const originalTransport=nodemailer.createTransport;const messages:any[]=[];
 Object.assign(process.env,{NODE_ENV:'production',FINANCIAL_WRITES_ENABLED:'true',SMTP_HOST:'127.0.0.1',SMTP_PORT:'11049',SMTP_FROM:'finance@example.invalid',SMTP_SECURE:'false'});delete process.env.LOCAL_FINANCIAL_FIXTURE_MARKER;
 try{
  const copy=['employee_positions','users','employee_position_domains','employee_domain_grants','customers','sites','site_account_assignments','site_billing_settings','devices','payload_profile_revisions','billing_source_bindings','billing_meters','register_mapping_versions','rate_versions','company_profile','company_bank_accounts','contracts'];
  for(const table of [...copy,'billing_cycles','documents','document_artifacts','financial_delivery_outbox','document_number_series','payments','audit_events','financial_readiness_approvals','telemetry_raw']){
   await pool.query(`CREATE TABLE ${schema}.${table} (LIKE public.${table} INCLUDING ALL)`);
   if(copy.includes(table))await pool.query(`INSERT INTO ${schema}.${table} SELECT * FROM public.${table}`);
  }
  await pool.query(await readFile(new URL('../../../../../infra/migrations/059_billing_issuance_approval.sql',import.meta.url),'utf8'));
  await pool.query(await readFile(new URL('../../../../../infra/migrations/058_user_document_identity.sql',import.meta.url),'utf8'));
  // Authorization uses the real database function, with its unqualified tables resolving in this schema.
  const owner=(await pool.query("SELECT id FROM users WHERE role='owner' AND status='active' ORDER BY id LIMIT 1")).rows[0];assert.ok(owner);
  const fixture=(await pool.query(`SELECT s.id FROM sites s JOIN site_billing_settings cfg ON cfg.site_id=s.id WHERE EXISTS(SELECT 1 FROM billing_meters b WHERE b.site_id=s.id AND b.active) AND EXISTS(SELECT 1 FROM public.telemetry_raw tr WHERE tr.site_id=s.id AND tr.source_time='2026-09-01T00:00:00+07:00') ORDER BY s.id LIMIT 1`)).rows[0];assert.ok(fixture,'Existing dedicated review meter fixture required');const siteId=fixture.id;
  await pool.query(`INSERT INTO telemetry_raw SELECT * FROM public.telemetry_raw WHERE site_id=$1 AND source_time BETWEEN '2026-08-31T23:55:00+07:00' AND '2026-10-01T00:05:00+07:00'`,[siteId]);
  const meter=(await pool.query('SELECT * FROM billing_meters WHERE site_id=$1 AND active ORDER BY id LIMIT 1',[siteId])).rows[0];
  await pool.query('UPDATE billing_meters SET active=false WHERE site_id=$1 AND id<>$2',[siteId,meter.id]);
  await pool.query("DELETE FROM telemetry_raw WHERE source_time NOT IN('2026-09-01T00:00:00+07:00','2026-10-01T00:00:00+07:00')");
  await pool.query("UPDATE telemetry_raw SET normalized_value=CASE WHEN source_time='2026-09-01T00:00:00+07:00' THEN 1000 ELSE 2000 END WHERE device_id=$1 AND semantic_field=$2",[meter.device_id,meter.semantic_field]);
  await pool.query('UPDATE rate_versions SET retired_at=now() WHERE site_id=$1',[siteId]);
  await pool.query("INSERT INTO rate_versions(id,site_id,effective_from,rate_type,rate,currency,changed_by,change_reason) VALUES($1,$2,'2026-09-01','fixed_kwh',4.3210,'THB',$3,'Task 7 deterministic fixture')",[randomUUID(),siteId,(await pool.query("SELECT id FROM users WHERE role='owner' LIMIT 1")).rows[0].id]);
  const logo='data:image/png;base64,'+(await readFile(new URL('../../../../web/public/brand/solar-roof-mark.png',import.meta.url))).toString('base64');
  const signature='data:image/png;base64,'+(await sharp({create:{width:120,height:40,channels:4,background:'#123456'}}).png().toBuffer()).toString('base64');
  const positionId=randomUUID();await pool.query("INSERT INTO employee_positions(id,name) VALUES($1,'กรรมการบริษัท')",[positionId]);
  await pool.query("UPDATE users SET company_position_id=$2,display_name='สมชาย ใจดี',signature_data=$3 WHERE id=$1",[owner.id,positionId,signature]);
  await pool.query("UPDATE company_profile SET company_name='Production issuer',tax_id='1234567890123',branch='Head office',address='Issuer address',phone='021234567',email='billing@example.invalid',logo_url=$1,signature_data_uri=$1,signatory_name='Authorized signer',signatory_title='Director'",[logo]);
  await pool.query("UPDATE site_billing_settings SET tax_rate=10,prices_include_tax=false,tax_confirmed=true,version=version+1 WHERE site_id=$1",[siteId]);
  await pool.query("UPDATE customers SET legal_name='Production customer',tax_id='1234567890123',tax_address='Customer address',document_email='customer@example.invalid',status='active' WHERE id=(SELECT customer_id FROM sites WHERE id=$1)",[siteId]);
  await pool.query("UPDATE sites SET status='active',timezone='Asia/Bangkok' WHERE id=$1",[siteId]);
  const db={pool,query:pool.query.bind(pool),transaction:DatabaseService.prototype.transaction} as unknown as DatabaseService;
  const readiness=new FinancialReadinessService(db);await readiness.confirm({id:owner.id,role:'owner'});
  const gates:Array<{action:string;context:any;transaction:boolean}>=[];const gate=readiness.assertEnabled.bind(readiness);
  readiness.assertEnabled=async(action,context={},client)=>{gates.push({action,context,transaction:!!client});return gate(action,context,client);};
  const service=new FinancialApplicationService(db,readiness);
  const siteBilling=new SiteBillingService(db,service);
  const manualController=new SiteBillingController(siteBilling);
  nodemailer.createTransport=(()=>({sendMail:async(message:any)=>{messages.push(message);return {accepted:[message.to]};},close:()=>{}})) as any;
  let cycle:any,invoice:any,approvedInvoice:any;
  await t.test('ordinary frozen production contracts deliver by persisted site without creating a billing cycle',async()=>{
   const contract={id:randomUUID()};
   await pool.query("INSERT INTO contracts(id,site_id,version,start_date,status,company_name,tax_id,tax_address,signer_name,signer_title,payment_terms,recipient_user_ids) VALUES($1,$2,1,'2026-09-01','active','Production customer','1234567890123','Customer address','Authorized signer','Director','30 days',(SELECT recipient_user_ids FROM site_billing_settings WHERE site_id=$2))",[contract.id,siteId]);
   await pool.query("INSERT INTO rate_versions(id,contract_id,effective_from,rate_type,rate,currency) VALUES($1,$2,'2026-09-01','fixed_kwh',4.3210,'THB')",[randomUUID(),contract.id]);
   const pdfs=new ContractPdfService(db);const actor={id:owner.id,role:'owner'};
   const controller=new BillingController(db,readiness,service,pdfs,siteBilling);
   await assert.rejects(controller.contractOriginal(contract.id,{user:actor}),error=>(error as any).getStatus()===404);
   await assert.rejects(controller.createContractOriginal(contract.id,{siteId:'caller-selected'},{user:actor}),error=>(error as any).getStatus()===400);
   await assert.rejects(controller.createContractOriginal(contract.id,{},{user:{id:owner.id,role:'customer_user'}}),error=>(error as any).getStatus()===403);
   process.env.FINANCIAL_WRITES_ENABLED='false';await assert.rejects(controller.createContractOriginal(contract.id,{},{user:actor}),error=>(error as any).getResponse().missing.includes('environment.financial_writes'));process.env.FINANCIAL_WRITES_ENABLED='true';
   await pool.query("UPDATE company_profile SET company_name='Stale approval issuer'");
   await assert.rejects(controller.createContractOriginal(contract.id,{},{user:actor}),error=>(error as any).getResponse().missing.includes('approval.confirmation'));
   await pool.query("UPDATE company_profile SET company_name='Production issuer'");
   await pool.query("UPDATE financial_readiness_approvals SET revoked_at=now(),revoked_by=$1,revoke_reason='test absent approval' WHERE revoked_at IS NULL",[owner.id]);
   await assert.rejects(controller.createContractOriginal(contract.id,{},{user:actor}),error=>(error as any).getResponse().missing.includes('approval.confirmation'));await readiness.confirm(actor);
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM documents')).rows[0].n,0);
   await pool.query(`CREATE FUNCTION reject_contract_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='finance.issue_contract' THEN RAISE EXCEPTION 'contract audit unavailable'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_contract_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_contract_audit();`);
   await assert.rejects(pdfs.ensureContractOriginal(contract.id,actor),/contract audit unavailable/);
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM documents')).rows[0].n,0);assert.equal((await pool.query('SELECT count(*)::int AS n FROM document_artifacts')).rows[0].n,0);
   await pool.query('DROP TRIGGER reject_contract_audit ON audit_events');
   const approval=(await readiness.status(actor)).approval!.id;
   let entered!:()=>void,release!:()=>void;const atRender=new Promise<void>(resolve=>entered=resolve),renderHeld=new Promise<void>(resolve=>release=resolve);
   const racingPdfs=new ContractPdfService(db,async snapshot=>{entered();await renderHeld;return renderDocumentPdf(snapshot);});
   const issuance=racingPdfs.ensureContractOriginal(contract.id,actor);await atRender;
   const settings=new SettingsService(db);const mutation=settings.updateCompanyProfile({companyName:'Later issuer'},owner.id);
   let lockWaiting=false;
   try {
    for(let attempts=0;attempts<100;attempts++){
     lockWaiting=(await pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event='advisory') AS waiting",[schema])).rows[0].waiting;if(lockWaiting)break;await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.equal(lockWaiting,true,'Issuer mutation must wait for the issuance configuration lock');
   }finally{release();}
   const original=await issuance;await mutation;
   const audit=(await pool.query("SELECT actor_id,after_json FROM audit_events WHERE action='finance.issue_contract' AND entity_id=$1",[original.documentId])).rows[0];assert.equal(audit.actor_id,owner.id);assert.equal(audit.after_json.siteId,siteId);assert.equal(audit.after_json.approvalId,approval);assert.equal(audit.after_json.contentHash,original.sha256);
   assert.equal((await pool.query('SELECT snapshot FROM documents WHERE id=$1',[original.documentId])).rows[0].snapshot.issuer.name,'Production issuer');assert.equal((await readiness.status(actor)).approval,null);
   assert.equal((await controller.contractOriginal(contract.id,{user:actor})).sha256,original.sha256);
   const recipient=(await pool.query("SELECT u.id,u.customer_id FROM users u JOIN site_account_assignments sa ON sa.user_id=u.id WHERE sa.site_id=$1 AND sa.revoked_at IS NULL AND u.role='customer_user' AND u.status='active' LIMIT 1",[siteId])).rows[0];assert.ok(recipient);
   process.env.FINANCIAL_WRITES_ENABLED='false';
   try{const saved=await controller.contractOriginal(contract.id,{user:{id:recipient.id,role:'customer_user',customerId:recipient.customer_id,assignedSiteIds:[siteId]}});assert.equal(saved.sha256,original.sha256);assert.equal(saved.deliveryEnabled,false);}finally{process.env.FINANCIAL_WRITES_ENABLED='true';}
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='finance.issue_contract'")).rows[0].n,1);
   await settings.updateCompanyProfile({companyName:'Production issuer'},owner.id);await readiness.confirm(actor);
   const metadata=await controller.contractOriginal(contract.id,{user:{id:owner.id,role:'owner'}});assert.equal(metadata.deliveryEnabled,true);
   process.env.FINANCIAL_WRITES_ENABLED='false';try{assert.equal((await controller.contractOriginal(contract.id,{user:{id:owner.id,role:'owner'}})).deliveryEnabled,false);}finally{process.env.FINANCIAL_WRITES_ENABLED='true';}
   assert.equal((await pool.query('SELECT billing_cycle_id FROM documents WHERE id=$1',[original.documentId])).rows[0].billing_cycle_id,null);
   assert.equal(routeAllowed('owner','POST',`/v1/contracts/${contract.id}/send-email`),true);assert.equal(authorizedRoute({role:'owner'},'POST',`/v1/contracts/${contract.id}/send-email`),true);
   const before=messages.length;await service.sendContract(contract.id,{id:owner.id,role:'owner'});await service.sendContract(contract.id,{id:owner.id,role:'owner'});
   assert.ok(messages.length>before);assert.equal((await pool.query('SELECT count(*)::int AS n FROM billing_cycles')).rows[0].n,0);
   messages.length=0;
  });
  await t.test('calculate persists production policy and literal configured tax rather than TEST tax',async()=>{
   cycle=(await service.calculate(siteId,'2026-09-01','2026-09-30',owner.id)).cycles[0];
   assert.equal(cycle.financial_scope,'PRODUCTION');assert.equal(cycle.policy_snapshot.taxRate,'10.0000');
   // Literal seed energy 1000 kWh at 4.3210 = 4321.00; configured ten percent = 432.10.
   assert.equal(Number(cycle.subtotal),4321);assert.equal(Number(cycle.simulated_tax),432.1);assert.equal(Number(cycle.amount),4753.1);
   assert.equal((await service.calculate(siteId,'2026-09-01','2026-09-30',owner.id)).cycles[0].id,cycle.id);
  });
  await t.test('preparation rolls back failed audit and readiness, then serializes concurrent retries without issuing',async()=>{
   const originals=(await pool.query('SELECT * FROM documents ORDER BY id')).rows;
   const series=(await pool.query('SELECT * FROM document_number_series ORDER BY prefix')).rows;
   process.env.FINANCIAL_WRITES_ENABLED='false';
   try{await assert.rejects(service.prepareInvoice(cycle.id,owner.id),error=>(error as any).getStatus()===503);}finally{process.env.FINANCIAL_WRITES_ENABLED='true';}
   assert.equal((await pool.query('SELECT status FROM billing_cycles WHERE id=$1',[cycle.id])).rows[0].status,'pending_review');
   await pool.query(`CREATE FUNCTION reject_prepared_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='finance.invoice_prepared' THEN RAISE EXCEPTION 'preparation audit unavailable'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_prepared_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_prepared_audit();`);
   try{await assert.rejects(service.prepareInvoice(cycle.id,owner.id),/preparation audit unavailable/);}finally{await pool.query('DROP TRIGGER reject_prepared_audit ON audit_events');}
   assert.equal((await pool.query('SELECT status FROM billing_cycles WHERE id=$1',[cycle.id])).rows[0].status,'pending_review');
   const results=await Promise.all([service.prepareInvoice(cycle.id,owner.id),service.prepareInvoice(cycle.id,owner.id),service.prepareInvoice(cycle.id,owner.id)]);
   assert.equal(results.filter(result=>result.created).length,1);assert.ok(results.every(result=>result.cycle.status==='pending_issue_approval'));
   const counts=(await pool.query(`SELECT (SELECT count(*) FROM documents)::int AS documents,(SELECT count(*) FROM document_artifacts)::int AS artifacts,(SELECT count(*) FROM financial_delivery_outbox)::int AS outboxes,(SELECT count(*) FROM document_number_series)::int AS series,(SELECT count(*) FROM audit_events WHERE action='finance.invoice_prepared' AND entity_id=$1)::int AS audits`,[cycle.id])).rows[0];
   assert.deepEqual(counts,{documents:1,artifacts:1,outboxes:1,series:1,audits:1}); // The earlier unrelated contract original remains untouched.
   assert.deepEqual((await pool.query('SELECT * FROM documents ORDER BY id')).rows,originals);
   assert.deepEqual((await pool.query('SELECT * FROM document_number_series ORDER BY prefix')).rows,series);
   const audit=(await pool.query("SELECT actor_id,after_json FROM audit_events WHERE action='finance.invoice_prepared' AND entity_id=$1",[cycle.id])).rows[0];
   assert.equal(audit.actor_id,owner.id);assert.equal(audit.after_json.status,'pending_issue_approval');
  });
  const approvalState=async()=>({
   cycle:(await pool.query('SELECT status,due_date FROM billing_cycles WHERE id=$1',[cycle.id])).rows[0],
   counts:(await pool.query(`SELECT (SELECT count(*) FROM documents)::int AS documents,(SELECT count(*) FROM document_artifacts)::int AS artifacts,(SELECT count(*) FROM financial_delivery_outbox)::int AS outboxes,(SELECT count(*) FROM audit_events)::int AS audits`)).rows[0],
   series:(await pool.query('SELECT * FROM document_number_series ORDER BY prefix')).rows,
  });
  await t.test('invoice approval refuses unprepared cycles before any issuance writes',async()=>{
   for(const status of ['draft','pending_review','rejected','approved','pending_verification','paid','cancelled']){
    await pool.query('UPDATE billing_cycles SET status=$2 WHERE id=$1',[cycle.id,status]);const before=await approvalState();
    await assert.rejects(service.approveInvoice(cycle.id,owner.id),(error:any)=>error.getStatus()===409);assert.deepEqual(await approvalState(),before);
   }
   await pool.query("UPDATE billing_cycles SET status='pending_issue_approval' WHERE id=$1",[cycle.id]);
  });
  await t.test('inactive, absent and positionless approvers leave the invoice pending without consuming a number',async()=>{
   const before=await approvalState();
   await pool.query(`CREATE FUNCTION reject_early_invoice_number() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'number allocation reached before identity validation'; END $$; CREATE TRIGGER reject_early_invoice_number BEFORE INSERT OR UPDATE ON document_number_series FOR EACH ROW EXECUTE FUNCTION reject_early_invoice_number();`);
   try{
   await assert.rejects(service.approveInvoice(cycle.id,randomUUID()),(error:any)=>error.getStatus()===404);assert.deepEqual(await approvalState(),before);
   await pool.query("UPDATE users SET status='disabled' WHERE id=$1",[owner.id]);
   try{await assert.rejects(service.approveInvoice(cycle.id,owner.id),(error:any)=>error.getStatus()===404);assert.deepEqual(await approvalState(),before);}finally{await pool.query("UPDATE users SET status='active' WHERE id=$1",[owner.id]);}
   await pool.query('UPDATE users SET company_position_id=NULL WHERE id=$1',[owner.id]);
   try{await assert.rejects(service.approveInvoice(cycle.id,owner.id),(error:any)=>error.getStatus()===409);assert.deepEqual(await approvalState(),before);}finally{await pool.query('UPDATE users SET company_position_id=$2 WHERE id=$1',[owner.id,positionId]);}
   }finally{await pool.query('DROP TRIGGER reject_early_invoice_number ON document_number_series');}
  });
  await t.test('render, audit and outbox failures roll back approval, allocated number and all artifacts',async()=>{
   const before=await approvalState();
   const failedRender=new FinancialApplicationService(db,readiness,new DocumentIdentityService(),async()=>{throw new Error('invoice render unavailable');});
   await assert.rejects(failedRender.approveInvoice(cycle.id,owner.id),/invoice render unavailable/);assert.deepEqual(await approvalState(),before);
   for(const table of ['audit_events','financial_delivery_outbox']){
    await pool.query(`CREATE FUNCTION reject_invoice_${table}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'invoice ${table} unavailable'; END $$; CREATE TRIGGER reject_invoice_${table} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION reject_invoice_${table}();`);
    try{await assert.rejects(service.approveInvoice(cycle.id,owner.id),new RegExp(`invoice ${table} unavailable`));assert.deepEqual(await approvalState(),before);}finally{await pool.query(`DROP TRIGGER reject_invoice_${table} ON ${table}`);}
   }
  });
  await t.test('concurrent approvals freeze one approver, number, original PDF, audit and delivery outbox',async()=>{
   const before=await approvalState();
   const results=await Promise.all([service.approveInvoice(cycle.id,owner.id),service.approveInvoice(cycle.id,owner.id),service.approveInvoice(cycle.id,owner.id)]);
   assert.equal(results.filter(result=>result.created).length,1);invoice=results[0]!.document;assert.ok(results.every(result=>result.document.id===invoice.id));
   approvedInvoice=invoice;
   assert.equal(invoice.snapshot.approver.userId,owner.id);assert.equal(invoice.snapshot.approver.displayName,'สมชาย ใจดี');assert.equal(invoice.snapshot.approver.position,'กรรมการบริษัท');assert.equal(invoice.snapshot.approver.signatureDataUri,signature);assert.ok(Number.isFinite(Date.parse(invoice.snapshot.approver.approvedAt)));
   const after=await approvalState();assert.equal(after.cycle.status,'approved');
   for(const key of ['documents','artifacts','outboxes','audits'])assert.equal(after.counts[key],before.counts[key]+1);
   assert.equal(after.series.find((s:any)=>s.prefix.startsWith('INV'))?.last_value,'1');
   const audit=(await pool.query("SELECT actor_id,after_json FROM audit_events WHERE action='finance.issue_invoice' AND entity_id=$1",[cycle.id])).rows[0];assert.equal(audit.actor_id,owner.id);assert.equal(audit.after_json.documentId,invoice.id);
   const original=JSON.stringify(invoice.snapshot);const hash=invoice.content_hash;
   await pool.query("UPDATE users SET display_name='Later name',signature_data=NULL,company_position_id=NULL WHERE id=$1",[owner.id]);
   try{const replay=await service.approveInvoice(cycle.id,owner.id);assert.equal(replay.created,false);assert.equal(replay.document.id,invoice.id);assert.equal(JSON.stringify(replay.document.snapshot),original);assert.equal(replay.document.content_hash,hash);assert.deepEqual(await approvalState(),after);}finally{await pool.query("UPDATE users SET display_name='สมชาย ใจดี',signature_data=$2,company_position_id=$3 WHERE id=$1",[owner.id,signature,positionId]);}
  });
  await t.test('approval controllers project PostgreSQL scoped labels and replay numbers without exposing resource existence',async()=>{
   const controller=new BillingController(db,readiness,service,new ContractPdfService(db),siteBilling);
   const ownerActor={id:owner.id,role:'owner'};
   const names=(await pool.query('SELECT s.name AS site,c.name AS customer FROM sites s JOIN customers c ON c.id=s.customer_id WHERE s.id=$1',[siteId])).rows[0];
   const before=await approvalState();const absent=randomUUID();
   const expected={label:{period:'2026-09',customer:names.customer,site:names.site},status:'already_issued',documentNumber:invoice.document_number,message:'ออกใบวางบิลแล้วก่อนหน้านี้'};
   assert.deepEqual(await controller.approveIssuance(cycle.id,{}, {user:ownerActor}),expected);
   const batch=await controller.approveMany({billingCycleIds:[cycle.id,absent,cycle.id]},{user:ownerActor});
   const unavailable={label:{period:'—',customer:'รายการที่ไม่สามารถเข้าถึงได้',site:'—'},status:'failed',message:'ไม่สามารถออกเอกสารได้'};
   assert.deepEqual(batch,{results:[expected,unavailable]});
   const employee=(await pool.query("SELECT id FROM users WHERE role='accountant' AND status='active' LIMIT 1")).rows[0];
   await pool.query("UPDATE employee_domain_grants SET scope_mode='selected',site_ids='{}' WHERE user_id=$1 AND domain='business'",[employee.id]);
   const scopedActor={id:employee.id,role:'accountant',authorization:effectiveAuthorization('accountant',1,[{domain:'business',preset:{'business.billing.approve':true},overrides:{},scope:{mode:'selected',siteIds:[]}}])};
   assert.deepEqual(await controller.approveIssuance(cycle.id,{}, {user:scopedActor}),unavailable);
   assert.deepEqual(await controller.approveIssuance(absent,{}, {user:scopedActor}),unavailable);
   const serialized=JSON.stringify(batch);
   for(const internalId of [cycle.id,siteId,owner.id,invoice.id,absent])assert.equal(serialized.includes(internalId),false);
   assert.deepEqual(await approvalState(),{...before,counts:{...before.counts,audits:before.counts.audits+1}});
   await pool.query("UPDATE employee_domain_grants SET scope_mode='all' WHERE user_id=$1 AND domain='business'",[employee.id]);
  });
  await t.test('issue freezes company, recipients, bank, logo and original PDF with one outbox',async()=>{
   assert.equal(invoice.snapshot.policy.scope,'PRODUCTION');assert.equal(invoice.snapshot.company.company_name,'Production issuer');assert.equal(invoice.snapshot.company.signatory_name,'Authorized signer');assert.equal(invoice.snapshot.logoDataUri,logo);assert.ok(invoice.snapshot.banks.length);assert.ok(invoice.snapshot.recipients.length);
   assert.equal(financialDocumentSnapshot(invoice).syntheticTest,false);
   const replay=await service.issueInvoice(cycle.id,owner.id);assert.equal(replay.document.id,invoice.id);assert.equal(replay.created,false);
   const artifact=(await pool.query('SELECT * FROM document_artifacts WHERE document_id=$1',[invoice.id])).rows[0];assert.equal(createHash('sha256').update(artifact.pdf_bytes).digest('hex'),invoice.content_hash);
  });
  await t.test('a positioned approver without signature issues and renders an invoice',async()=>{
   const rollback=new Error('unsigned approval fixture rollback');
   await assert.rejects(db.transaction(async client=>{
    await client.query("DELETE FROM financial_delivery_outbox WHERE document_id=$1",[invoice.id]);await client.query('DELETE FROM document_artifacts WHERE document_id=$1',[invoice.id]);await client.query('DELETE FROM documents WHERE id=$1',[invoice.id]);
    await client.query("UPDATE billing_cycles SET status='pending_issue_approval' WHERE id=$1",[cycle.id]);await client.query('UPDATE users SET signature_data=NULL WHERE id=$1',[owner.id]);
    const transactionDb={transaction:async(run:any)=>run(client)} as DatabaseService;
    const unsigned=(await new FinancialApplicationService(transactionDb,readiness).approveInvoice(cycle.id,owner.id)).document;
    assert.equal(unsigned.snapshot.approver.signatureDataUri,undefined);assert.deepEqual(financialDocumentSnapshot(unsigned).signatories.issuer,{name:'สมชาย ใจดี',title:'กรรมการบริษัท'});assert.equal((await renderFinancialDocumentPdf(unsigned)).subarray(0,5).toString(),'%PDF-');
    throw rollback;
   }),error=>error===rollback);
  });
  await t.test('replacement draft migration retains current originals, permits one pending draft and enforces references and statuses',async()=>{
   const draftId=randomUUID();
   const insert=(id:string,cycleId=cycle.id,documentId=invoice.id,status='pending_issue_approval',actor=owner.id)=>pool.query('INSERT INTO billing_replacement_drafts(id,billing_cycle_id,supersedes_document_id,rate,amount,snapshot,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,cycleId,documentId,'5.12345678','123.12345678',JSON.stringify({reason:'Reviewed replacement'}),status,actor]);
   await insert(draftId);
   await assert.rejects(insert(randomUUID()),(error:any)=>error.code==='23505');
   await assert.rejects(insert(randomUUID(),randomUUID()),(error:any)=>error.code==='23503');
   await assert.rejects(insert(randomUUID(),cycle.id,randomUUID(),'cancelled'),(error:any)=>error.code==='23503');
   await assert.rejects(insert(randomUUID(),cycle.id,invoice.id,'invalid'),(error:any)=>error.code==='23514');
   await assert.rejects(insert(randomUUID(),cycle.id,invoice.id,'cancelled',randomUUID()),(error:any)=>error.code==='23503');
   const draft=(await pool.query('SELECT * FROM billing_replacement_drafts WHERE id=$1',[draftId])).rows[0];
   assert.equal(draft.rate,'5.12345678');assert.equal(draft.amount,'123.12345678');assert.equal(draft.created_by,owner.id);assert.ok(draft.created_at);assert.deepEqual(draft.snapshot,{reason:'Reviewed replacement'});
   assert.equal((await pool.query('SELECT status,is_current FROM documents WHERE id=$1',[invoice.id])).rows[0].is_current,true);
   await pool.query("UPDATE billing_replacement_drafts SET status='cancelled' WHERE id=$1",[draftId]);await insert(randomUUID());
   await pool.query("UPDATE billing_replacement_drafts SET status='issued' WHERE status='pending_issue_approval'");await insert(randomUUID());
  });
  await t.test('delivery intent audit failure rolls back sending state before SMTP acceptance',async()=>{
   await pool.query(`CREATE FUNCTION reject_send_intent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='finance.send_started' THEN RAISE EXCEPTION 'intent audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER task7_reject_intent BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_send_intent();`);
   const before=messages.length;try{await assert.rejects(service.send(cycle.id,owner.id),/intent audit failure/);assert.equal(messages.length,before);assert.equal((await pool.query('SELECT state FROM financial_delivery_outbox WHERE document_id=$1',[invoice.id])).rows[0].state,'pending');}finally{await pool.query('DROP TRIGGER task7_reject_intent ON audit_events');}
  });
  await t.test('delivery completion audit failure rolls back sent state and replay completes without resending',async()=>{
   await pool.query(`CREATE FUNCTION reject_send_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='finance.send' THEN RAISE EXCEPTION 'completion audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER task7_reject_send BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_send_audit();`);
   const before=messages.length;await assert.rejects(service.send(cycle.id,owner.id),/completion audit failure/);
   const row=(await pool.query('SELECT state,delivered_user_ids FROM financial_delivery_outbox WHERE document_id=$1',[invoice.id])).rows[0];assert.equal(row.state,'sending');assert.equal(row.delivered_user_ids.length,invoice.snapshot.recipients.length);
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='finance.send_started' AND entity_id=(SELECT id FROM financial_delivery_outbox WHERE document_id=$1)",[invoice.id])).rows[0].n,1);
   await pool.query('DROP TRIGGER task7_reject_send ON audit_events');await service.send(cycle.id,owner.id);assert.equal(messages.length,before+invoice.snapshot.recipients.length);
   assert.equal((await pool.query('SELECT state FROM financial_delivery_outbox WHERE document_id=$1',[invoice.id])).rows[0].state,'sent');
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='finance.send' AND entity_id=(SELECT id FROM financial_delivery_outbox WHERE document_id=$1) AND actor_id=$2",[invoice.id,owner.id])).rows[0].n,1);
  });
  await t.test('send uses frozen production scope even under TEST environment and replays without new messages',async()=>{
   process.env.NODE_ENV='test';await service.send(cycle.id,owner.id);await service.send(cycle.id,owner.id);process.env.NODE_ENV='production';
   assert.equal(messages.length,invoice.snapshot.recipients.length);assert.ok(messages.every(m=>!m.subject.includes('TEST')&&!m.text.includes('Synthetic')));
   assert.equal(createHash('sha256').update(messages[0].attachments[0].content).digest('hex'),invoice.content_hash);
  });
  await t.test('replay repairs a historical sent row with missing outcome audit without resending or changing its initiating actor',async()=>{
   const outbox=(await pool.query('SELECT id FROM financial_delivery_outbox WHERE document_id=$1',[invoice.id])).rows[0];
   await pool.query("DELETE FROM audit_events WHERE action='finance.send' AND entity_id=$1",[outbox.id]);
   const before=messages.length;const other=(await pool.query("SELECT id FROM users WHERE role='accountant' AND status='active' LIMIT 1")).rows[0];assert.ok(other);
   await service.send(cycle.id,other.id);await service.send(cycle.id,other.id);assert.equal(messages.length,before);
   const audits=(await pool.query("SELECT actor_id FROM audit_events WHERE action='finance.send' AND entity_id=$1",[outbox.id])).rows;
   assert.equal(audits.length,1);assert.equal(audits[0].actor_id,owner.id);
  });
  await t.test('correction totals sum the individually rounded frozen meter lines exactly',async()=>{
   const rollback=new Error('intentional rounding fixture rollback');
   await assert.rejects(db.transaction(async client=>{
    const original=(await client.query('SELECT * FROM billing_cycles WHERE id=$1 FOR UPDATE',[cycle.id])).rows[0];
    const lines=[{...original.meter_snapshot[0],consumedKwh:'1.000'},{...original.meter_snapshot[0],consumedKwh:'1.000'}];
    const changed=(await client.query('UPDATE billing_cycles SET consumed_kwh=2,meter_snapshot=$2 WHERE id=$1 RETURNING *',[cycle.id,JSON.stringify(lines)])).rows[0];
    const corrected=await service.reviseInvoiceInTransaction(client,changed,'0.0050',owner.id);
    assert.deepEqual(corrected.snapshot.cycle.meter_snapshot.map((line:any)=>line.subtotal),['0.01','0.01']);
    assert.equal(Number(corrected.snapshot.cycle.subtotal),0.02);assert.equal(Number(corrected.snapshot.cycle.simulated_tax),0);assert.equal(Number(corrected.amount),0.02);
    throw rollback;
   }),error=>error===rollback);
  });
  await t.test('revision supersedes original and freezes policy with a new artifact',async()=>{
   invoice=await db.transaction(async client=>service.reviseInvoiceInTransaction(client,(await client.query('SELECT * FROM billing_cycles WHERE id=$1 FOR UPDATE',[cycle.id])).rows[0],'5.0000',owner.id));
   assert.equal(invoice.revision,2);assert.equal(Number(invoice.amount),5500);assert.equal(invoice.snapshot.policy.taxRate,'10.0000');
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM documents WHERE billing_cycle_id=$1 AND document_type='invoice' AND is_current",[cycle.id])).rows[0].n,1);
   const replay=await db.transaction(async client=>service.reviseInvoiceInTransaction(client,(await client.query('SELECT * FROM billing_cycles WHERE id=$1 FOR UPDATE',[cycle.id])).rows[0],'5.0000',owner.id));assert.equal(replay.id,invoice.id);
  });
  await t.test('public rate correction replay retains the existing tariff and document rows',async()=>{
   await siteBilling.reprice(cycle.id,{rate:'5.0000',reason:'Reviewed correction'},{id:owner.id,role:'owner'});
   const before=(await pool.query('SELECT count(*)::int AS n FROM rate_versions WHERE site_id=$1',[siteId])).rows[0].n;
   await siteBilling.reprice(cycle.id,{rate:'5.0000',reason:'Reviewed correction'},{id:owner.id,role:'owner'});
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM rate_versions WHERE site_id=$1',[siteId])).rows[0].n,before);
  });
  await t.test('settlement snapshots its own reviewer atomically and preserves originals through concurrent replay',async t=>{
   const original=JSON.stringify(invoice.snapshot),originalHash=invoice.content_hash;
   await pool.query("UPDATE company_profile SET company_name='Replacement issuer',signatory_name='Replacement signer'");await readiness.confirm({id:owner.id,role:'owner'});
   const recipient=invoice.snapshot.recipients[0];
   process.env.FINANCIAL_WRITES_ENABLED='false';try{await assert.rejects(service.submitPayment(cycle.id,{amount:'5500.00',evidenceKey:'task7-blocked-'+schema},recipient.id),error=>(error as any).getStatus()===503);}finally{process.env.FINANCIAL_WRITES_ENABLED='true';}
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM payments')).rows[0].n,0);assert.equal((await pool.query('SELECT status FROM billing_cycles WHERE id=$1',[cycle.id])).rows[0].status,'approved');
   await pool.query("UPDATE company_profile SET company_name='Unconfirmed issuer'");try{await assert.rejects(service.submitPayment(cycle.id,{amount:'5500.00',evidenceKey:'task7-stale-'+schema},recipient.id),error=>(error as any).getStatus()===503);}finally{await pool.query("UPDATE company_profile SET company_name='Replacement issuer'");}
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM payments')).rows[0].n,0);
   const payment=await service.submitPayment(cycle.id,{amount:'5500.00',evidenceKey:'task7-full-'+schema},recipient.id);
   const reviewer=(await pool.query("SELECT id FROM users WHERE role='accountant' AND status='active' ORDER BY id LIMIT 1")).rows[0];assert.ok(reviewer);
   await pool.query("UPDATE users SET display_name='ผู้ตรวจหลักฐาน',company_position_id=$2,signature_data=$3 WHERE id=$1",[reviewer.id,positionId,signature]);
   const review={paymentId:payment.paymentId,verifiedAmount:'5500.00',verifiedTransferAt:'2026-10-10T01:00:00Z'};
   const settlementState=async()=>({...await approvalState(),payments:(await pool.query('SELECT * FROM payments ORDER BY id')).rows,documents:(await pool.query('SELECT * FROM documents ORDER BY id')).rows,artifacts:(await pool.query('SELECT * FROM document_artifacts ORDER BY document_id')).rows,outboxes:(await pool.query('SELECT * FROM financial_delivery_outbox ORDER BY id')).rows,audits:(await pool.query('SELECT * FROM audit_events ORDER BY id')).rows});
   await t.test('absent, inactive and positionless reviewers block all settlement effects',async()=>{
    const before=await settlementState();
    await assert.rejects(service.verifyPayment(cycle.id,'approved',undefined,randomUUID(),review),(error:any)=>error.getStatus()===403);assert.deepEqual(await settlementState(),before);
    await pool.query("UPDATE users SET status='disabled' WHERE id=$1",[reviewer.id]);
    try{await assert.rejects(service.verifyPayment(cycle.id,'approved',undefined,reviewer.id,review),(error:any)=>error.getStatus()===403);assert.deepEqual(await settlementState(),before);}finally{await pool.query("UPDATE users SET status='active' WHERE id=$1",[reviewer.id]);}
    const rollback=new Error('positionless reviewer fixture rollback');
    await assert.rejects(db.transaction(async client=>{
     await client.query('UPDATE users SET company_position_id=NULL WHERE id=$1',[reviewer.id]);
     const application=new FinancialApplicationService({transaction:async(run:any)=>run(client)} as DatabaseService,readiness);
     await assert.rejects(application.verifyPayment(cycle.id,'approved',undefined,reviewer.id,review),(error:any)=>error.getResponse().code==='DOCUMENT_APPROVER_POSITION_REQUIRED');
     throw rollback;
    }),error=>error===rollback);assert.deepEqual(await settlementState(),before);
   });
   await t.test('render, document, artifact, outbox and audit failures roll back payment and receipt together',async()=>{
    const before=await settlementState();
    const failedRender=new FinancialApplicationService(db,readiness,new DocumentIdentityService(),async()=>{throw new Error('receipt render unavailable');});
    await assert.rejects(failedRender.verifyPayment(cycle.id,'approved',undefined,reviewer.id,review),/receipt render unavailable/);assert.deepEqual(await settlementState(),before);
    for(const table of ['documents','document_artifacts','financial_delivery_outbox','audit_events']){
     await pool.query(`CREATE FUNCTION reject_receipt_${table}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'receipt ${table} unavailable'; END $$; CREATE TRIGGER reject_receipt_${table} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION reject_receipt_${table}();`);
     try{await assert.rejects(service.verifyPayment(cycle.id,'approved',undefined,reviewer.id,review),new RegExp(`receipt ${table} unavailable`));assert.deepEqual(await settlementState(),before);}finally{await pool.query(`DROP TRIGGER reject_receipt_${table} ON ${table}`);}
    }
   });
   await t.test('unsigned positioned reviewer uses transaction time and renders a receipt',async()=>{
    const before=await settlementState(),rollback=new Error('unsigned receipt fixture rollback');
    await assert.rejects(db.transaction(async client=>{
     await client.query('UPDATE users SET signature_data=NULL WHERE id=$1',[reviewer.id]);
     const approvedAt=(await client.query('SELECT now() AS value')).rows[0].value.toISOString();
     const application=new FinancialApplicationService({transaction:async(run:any)=>run(client)} as DatabaseService,readiness);
     const unsigned=await application.verifyPayment(cycle.id,'approved',undefined,reviewer.id,review);
     assert.deepEqual(unsigned.receipt.snapshot.approver,{userId:reviewer.id,displayName:'ผู้ตรวจหลักฐาน',position:'กรรมการบริษัท',approvedAt});
     assert.deepEqual(financialDocumentSnapshot(unsigned.receipt).signatories.issuer,{name:'ผู้ตรวจหลักฐาน',title:'กรรมการบริษัท'});
     assert.equal((await client.query('SELECT pdf_bytes FROM document_artifacts WHERE document_id=$1',[unsigned.receipt.id])).rows[0].pdf_bytes.subarray(0,5).toString(),'%PDF-');
     throw rollback;
    }),error=>error===rollback);assert.deepEqual(await settlementState(),before);
   });
   const before=await settlementState();
   const results=await Promise.all([service.verifyPayment(cycle.id,'approved',undefined,reviewer.id,review),service.verifyPayment(cycle.id,'approved',undefined,reviewer.id,review),service.verifyPayment(cycle.id,'approved',undefined,reviewer.id,review)]);
   const result=results[0]!;assert.ok(results.every(value=>value.receipt.id===result.receipt.id));
   // The settling payment reviewer owns the immutable receipt, independently from the invoice approver.
   const winningPayment=(await pool.query('SELECT verified_by,verified_at FROM payments WHERE id=$1',[payment.paymentId])).rows[0];
   assert.equal(result.receipt.snapshot.approver.userId,winningPayment.verified_by);assert.equal(result.receipt.snapshot.approver.approvedAt,winningPayment.verified_at.toISOString());
   assert.equal(approvedInvoice.snapshot.approver.displayName,'สมชาย ใจดี');assert.equal(result.receipt.snapshot.approver.displayName,'ผู้ตรวจหลักฐาน');assert.notEqual(result.receipt.snapshot.approver.userId,approvedInvoice.snapshot.approver.userId);
   assert.equal(result.receipt.snapshot.approver.signatureDataUri,signature);
   assert.deepEqual(financialDocumentSnapshot(result.receipt).signatories.issuer,{name:result.receipt.snapshot.approver.displayName,title:'กรรมการบริษัท',signatureDataUri:signature});
   const after=await settlementState();for(const key of ['documents','artifacts','outboxes'])assert.equal(after.counts[key],before.counts[key]+1);assert.equal(after.counts.audits,before.counts.audits+2);
   assert.equal(result.billingCycleStatus,'paid');assert.equal(result.receipt.snapshot.policy.scope,'PRODUCTION');assert.equal(result.receipt.snapshot.logoDataUri,logo);assert.equal(result.receipt.snapshot.invoiceNumber,invoice.document_number);
   assert.equal(result.receipt.snapshot.company.company_name,'Production issuer');assert.equal(result.receipt.snapshot.company.signatory_name,'Authorized signer');
   assert.equal(JSON.stringify((await pool.query('SELECT snapshot FROM documents WHERE id=$1',[invoice.id])).rows[0].snapshot),original);assert.equal((await pool.query('SELECT sha256 FROM document_artifacts WHERE document_id=$1',[invoice.id])).rows[0].sha256,originalHash);
   const receiptSnapshot=JSON.stringify(result.receipt.snapshot),receiptBytes=after.artifacts.find(a=>a.document_id===result.receipt.id).pdf_bytes;
   await pool.query("UPDATE users SET display_name='Changed reviewer',company_position_id=NULL,signature_data=NULL WHERE id=$1",[reviewer.id]);
   try{const replay=await service.verifyPayment(cycle.id,'approved',undefined,reviewer.id,review);assert.equal(replay.receipt.id,result.receipt.id);assert.equal(JSON.stringify(replay.receipt.snapshot),receiptSnapshot);assert.deepEqual(await settlementState(),after);assert.deepEqual((await pool.query('SELECT pdf_bytes FROM document_artifacts WHERE document_id=$1',[replay.receipt.id])).rows[0].pdf_bytes,receiptBytes);}finally{await pool.query("UPDATE users SET display_name='ผู้ตรวจหลักฐาน',company_position_id=$2,signature_data=$3 WHERE id=$1",[reviewer.id,positionId,signature]);}
  });
  await t.test('manual production invoice validates its authoritative cycle atomically and idempotently',async()=>{
   await pool.query('UPDATE site_billing_settings SET tax_rate=5.5,prices_include_tax=true,version=version+1 WHERE site_id=$1',[siteId]);
   const input={siteId,lines:[{description:'Maintenance',quantity:'1',unitPrice:'105.5000'}],idempotencyKey:'task7-manual-'+schema};
   const {idempotencyKey,...unkeyed}=input;await assert.rejects(manualController.manual(unkeyed,{user:{id:owner.id,role:'owner'}}),/idempotency key/i);
   const first=await manualController.manual(input,{user:{id:owner.id,role:'owner'}}),replay=await manualController.manual(input,{user:{id:owner.id,role:'owner'}});
   assert.equal(first.cycle.status,'approved');
   assert.equal(Number(first.cycle.subtotal),100);assert.equal(Number(first.cycle.simulated_tax),5.5);assert.equal(Number(first.cycle.amount),105.5);assert.equal(first.document.snapshot.policy.pricesIncludeTax,true);assert.equal(first.document.id,replay.document.id);
   const second=await manualController.manual({...input,idempotencyKey:'second-identical-'+schema},{user:{id:owner.id,role:'owner'}});assert.notEqual(second.cycle.id,first.cycle.id);assert.notEqual(second.document.id,first.document.id);
   await assert.rejects(manualController.manual({...input,lines:[{description:'Different work',quantity:'1',unitPrice:'105.5000'}]},{user:{id:owner.id,role:'owner'}}),/already used/);
   await pool.query('UPDATE site_billing_settings SET tax_confirmed=false WHERE site_id=$1',[siteId]);
   const before=(await pool.query('SELECT count(*)::int AS n FROM billing_cycles')).rows[0].n;
   await assert.rejects(service.manualInvoice({...input,idempotencyKey:'blocked-'+schema},owner.id),/tax|ready/i);
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM billing_cycles')).rows[0].n,before);
   await pool.query('UPDATE site_billing_settings SET tax_confirmed=true,recipient_user_ids=\'{}\' WHERE site_id=$1',[siteId]);
   await assert.rejects(service.manualInvoice({...input,idempotencyKey:'gate-blocked-'+schema},owner.id),error=>(error as any).getStatus()===503);
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM billing_cycles')).rows[0].n,before,'The new draft cycle rolls back with its failed transaction-aware readiness gate');
  });
  const count=(await pool.query('SELECT (SELECT count(*) FROM billing_cycles)::int AS cycles,(SELECT count(*) FROM documents)::int AS documents,(SELECT count(*) FROM document_artifacts)::int AS artifacts,(SELECT count(*) FROM financial_delivery_outbox)::int AS outboxes,(SELECT count(*) FROM audit_events WHERE actor_id=$1)::int AS audits',[owner.id])).rows[0];
  assert.equal(count.cycles,3);assert.equal(count.documents,6);assert.equal(count.artifacts,6);assert.equal(count.outboxes,6);assert.ok(count.audits>=7);t.diagnostic(JSON.stringify({schema,...count}));
  assert.ok(gates.filter(g=>g.action==='calculate').every(g=>g.context.siteId===siteId&&g.context.periodStart==='2026-09-01'&&g.context.periodEnd==='2026-09-30'&&g.transaction));
  for(const action of ['issue','approve_payment','adjust','send'])assert.ok(gates.filter(g=>g.action===action).every(g=>typeof g.context.billingCycleId==='string'));
  assert.ok(gates.some(g=>g.action==='approve_payment'&&g.transaction),'Payment mutation must gate the same transaction to prevent approval revocation races');
  assert.ok(gates.filter(g=>g.action==='submit_payment').every(g=>g.transaction&&g.context.billingCycleId===cycle.id&&g.context.siteId===siteId));
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='finance.issue_invoice' AND actor_id=$1",[owner.id])).rows[0].n,4);

  // Review regressions run after the legacy fixture assertions and use additional
  // manual drafts only within this same disposable schema.
  const team=new TeamService(db),ownerActor={id:owner.id,role:'owner'};
  const employee=(await pool.query("SELECT id FROM users WHERE role='accountant' AND status='active' ORDER BY id LIMIT 1")).rows[0];assert.ok(employee);
  await pool.query('UPDATE site_billing_settings SET recipient_user_ids=$2,tax_confirmed=true WHERE site_id=$1',[siteId,invoice.snapshot.recipients.map((recipient:any)=>recipient.id)]);
  await readiness.confirm(ownerActor);
  const authorizeEmployee=async()=>team.updateGrant(ownerActor,employee.id,'business',{
   revision:(await pool.query('SELECT permission_revision FROM users WHERE id=$1',[employee.id])).rows[0].permission_revision,
   position:{name:'Review approval '+schema,rules:{'business.billing.approve':true}},overrides:{},scope:{mode:'selected',siteIds:[siteId]},
  });
  // Reuse the created preset on subsequent grants, just as the public team editor does.
  const grant=await authorizeEmployee();
  const restoreGrant=async()=>{await pool.query("UPDATE users SET role='accountant',status='active' WHERE id=$1",[employee.id]);return team.updateGrant(ownerActor,employee.id,'business',{
   revision:(await pool.query('SELECT permission_revision FROM users WHERE id=$1',[employee.id])).rows[0].permission_revision,
   position:{id:grant.position.id},overrides:{},scope:{mode:'selected',siteIds:[siteId]},
  });};
  const requestActor={id:employee.id,role:'accountant',authorization:effectiveAuthorization('accountant',1,[{domain:'business',preset:{'business.billing.approve':true},overrides:{},scope:{mode:'selected',siteIds:[siteId]}}])};
  const controllerFor=(application=service)=>new BillingController(db,readiness,application,new ContractPdfService(db),siteBilling);
  const draft=async(status='pending_issue_approval')=>{
   const config=(await pool.query('SELECT * FROM site_billing_settings WHERE site_id=$1',[siteId])).rows[0];
   const totals=manualTotals([{description:'Review fixture',quantity:'1',unitPrice:'105.5000'}],config.tax_rate,config.prices_include_tax);
   const policy=financialPolicySnapshot(config,'PRODUCTION');const id=randomUUID();
   await pool.query(`INSERT INTO billing_cycles(id,site_id,period_start,period_end,cutoff_time,status,quality,billing_settings_version,billing_kind,manual_lines,meter_snapshot,amount,subtotal,simulated_tax,policy_snapshot,policy_hash,financial_scope,opening_energy,closing_energy,consumed_kwh,rate)
    VALUES($1,$2,'2026-09-15','2026-09-15',now(),$3,'complete',$4,'manual',$5,'[]',$6,$7,$8,$9,$10,'PRODUCTION',0,0,0,0)`,[id,siteId,status,config.version,JSON.stringify(totals.lines),totals.total,totals.subtotal,totals.tax,JSON.stringify(policy),financialPolicyHash(policy)]);
   return id;
  };
  const numberState=async()=>(await pool.query('SELECT * FROM document_number_series ORDER BY prefix')).rows;
  const assertUnissued=async(id:string)=>{
   assert.equal((await pool.query('SELECT status FROM billing_cycles WHERE id=$1',[id])).rows[0].status,'pending_issue_approval');
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM documents WHERE billing_cycle_id=$1',[id])).rows[0].n,0);
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE entity_id=$1 AND action='finance.issue_invoice'",[id])).rows[0].n,0);
  };
  const unavailable={label:{period:'—',customer:'รายการที่ไม่สามารถเข้าถึงได้',site:'—'},status:'failed',message:'ไม่สามารถออกเอกสารได้'};

  for(const change of ['grant','scope','preset','role','account'])await t.test(`live ${change} revocation between batch items blocks later issuance and hides labels`,async()=>{
   await restoreGrant();await pool.query(`UPDATE employee_position_domains SET rules='{"business.billing.approve":true}' WHERE position_id=$1 AND domain='business'`,[grant.position.id]);
   const first=await draft(),later=await draft();let afterFirst:any;
   const application=Object.create(service) as FinancialApplicationService;
   application.approveInvoice=async(id,actorId)=>{
    const result=await service.approveInvoice(id,actorId);
    if(id===first){
     afterFirst=await numberState();
     const revision=(await pool.query('SELECT permission_revision FROM users WHERE id=$1',[employee.id])).rows[0].permission_revision;
     if(change==='grant')await team.revokeGrant(ownerActor,employee.id,'business',{revision});
     else if(change==='scope')await team.updateGrant(ownerActor,employee.id,'business',{revision,position:{id:grant.position.id},overrides:{},scope:{mode:'selected',siteIds:[]}});
     else if(change==='preset')await team.savePosition(ownerActor,'business',{name:grant.position.name,revision:(await pool.query("SELECT revision FROM employee_position_domains WHERE position_id=$1 AND domain='business'",[grant.position.id])).rows[0].revision,rules:{'business.billing.approve':false}},grant.position.id);
     else if(change==='role')await pool.query("UPDATE users SET role='admin' WHERE id=$1",[employee.id]);
     else await pool.query("UPDATE users SET status='disabled' WHERE id=$1",[employee.id]);
    }
    return result;
   };
   const batch=await controllerFor(application).approveMany({billingCycleIds:[first,later]},{user:requestActor});
   assert.equal(batch.results[0]!.status,'issued');assert.deepEqual(batch.results[1],unavailable);
   await assertUnissued(later);assert.deepEqual(await numberState(),afterFirst);
   const failure=(await pool.query("SELECT actor_id,after_json FROM audit_events WHERE entity_id=$1 AND action='finance.invoice_approval_failed'",[later])).rows;
   assert.equal(failure.length,1);assert.equal(failure[0].actor_id,employee.id);assert.equal(failure[0].after_json.reasonCode,'unavailable');assert.equal(failure[0].after_json.billingCycleId,later);
   assert.equal(JSON.stringify(batch).includes(later),false);
  });

  await t.test('single approval waiting for configuration lock observes committed grant revocation',async()=>{
   await pool.query(`UPDATE employee_position_domains SET rules='{"business.billing.approve":true}' WHERE position_id=$1 AND domain='business'`,[grant.position.id]);await restoreGrant();
   const id=await draft(),before=await numberState();const lock=await pool.connect();let pending:ReturnType<BillingController['approveIssuance']>|undefined;
   try{
    await lock.query('BEGIN');await lock.query("SELECT pg_advisory_xact_lock(hashtext('production-financial-configuration'))");
    pending=controllerFor().approveIssuance(id,{}, {user:requestActor});
    let waiting=false;for(let attempt=0;attempt<100;attempt++){
     waiting=(await pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event='advisory') AS waiting",[schema])).rows[0].waiting;if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.ok(waiting);await team.revokeGrant(ownerActor,employee.id,'business',{revision:(await pool.query('SELECT permission_revision FROM users WHERE id=$1',[employee.id])).rows[0].permission_revision});
   }finally{await lock.query('ROLLBACK');lock.release();}
   assert.deepEqual(await pending,unavailable);await assertUnissued(id);assert.deepEqual(await numberState(),before);
  });

  await t.test('authorized corrective failures remain safe while each rolled-back batch item gets an independent audit',async()=>{
   await restoreGrant();const controller=controllerFor();
   const first=await draft(),bad=await draft('pending_review'),last=await draft();
   const batch=await controller.approveMany({billingCycleIds:[first,bad,last]},{user:requestActor});
   assert.deepEqual(batch.results.map(result=>result.status),['issued','failed','issued']);
   assert.equal(batch.results[1]!.message,'กรุณาเตรียมใบวางบิลให้พร้อมตรวจอนุมัติก่อนออกเอกสาร');assert.notEqual(batch.results[1]!.label.customer,unavailable.label.customer);
   const audit=(await pool.query("SELECT actor_id,after_json FROM audit_events WHERE entity_id=$1 AND action='finance.invoice_approval_failed'",[bad])).rows[0];
   assert.equal(audit.actor_id,employee.id);assert.equal(audit.after_json.reasonCode,'draft_state');assert.equal(audit.after_json.billingCycleId,bad);
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM documents WHERE billing_cycle_id=ANY($1::uuid[])',[[first,last]])).rows[0].n,2);
   const positionless=await draft();await pool.query('UPDATE users SET company_position_id=NULL WHERE id=$1',[employee.id]);
   try{assert.equal((await controller.approveIssuance(positionless,{}, {user:requestActor})).message,'กรุณากำหนดตำแหน่งผู้อนุมัติในหน้าพนักงานและสิทธิ์');await assertUnissued(positionless);}finally{await pool.query('UPDATE users SET company_position_id=$2 WHERE id=$1',[employee.id,grant.position.id]);}
   const stale=await draft();await pool.query('UPDATE billing_cycles SET billing_settings_version=billing_settings_version-1 WHERE id=$1',[stale]);
   assert.equal((await controller.approveIssuance(stale,{}, {user:requestActor})).message,'กรุณาคำนวณใบวางบิลใหม่ตามการตั้งค่าปัจจุบันก่อนอนุมัติ');await assertUnissued(stale);
   const notReady=await draft();await pool.query("UPDATE financial_readiness_approvals SET revoked_at=now(),revoked_by=$1,revoke_reason='Review fixture confirmation revoked' WHERE revoked_at IS NULL",[owner.id]);
   try{assert.equal((await controller.approveIssuance(notReady,{}, {user:requestActor})).message,'กรุณาให้เจ้าของยืนยันความพร้อมด้านบัญชีก่อนอนุมัติออกเอกสาร');await assertUnissued(notReady);}finally{await readiness.confirm(ownerActor);}
  });

  await t.test('failure audit write errors cannot leak internals or undo independent batch successes',async()=>{
   await restoreGrant();const first=await draft(),bad=await draft('pending_review'),last=await draft();
   await pool.query(`CREATE FUNCTION reject_bulk_failure_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='finance.invoice_approval_failed' THEN RAISE EXCEPTION 'internal bulk failure %',NEW.entity_id; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_bulk_failure_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_bulk_failure_audit();`);
   try{
    const batch=await controllerFor().approveMany({billingCycleIds:[first,bad,last]},{user:requestActor});
    assert.deepEqual(batch.results.map(result=>result.status),['issued','failed','issued']);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM documents WHERE billing_cycle_id=ANY($1::uuid[])',[[first,last]])).rows[0].n,2);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE entity_id=$1 AND action='finance.invoice_approval_failed'",[bad])).rows[0].n,0);
    for(const secret of [first,bad,last,'internal bulk failure'])assert.equal(JSON.stringify(batch).includes(secret),false);
   }finally{await pool.query('DROP TRIGGER reject_bulk_failure_audit ON audit_events');}
  });

  await t.test('unexpected render failure retains only currently authorized labels and a generic message',async()=>{
   await restoreGrant();const id=await draft(),before=await numberState();
   const application=new FinancialApplicationService(db,readiness,new DocumentIdentityService(),async()=>{throw new Error('private rendering detail '+id);});
   const batch=await controllerFor(application).approveMany({billingCycleIds:[id]},{user:requestActor});
   assert.equal(batch.results[0]!.status,'failed');assert.equal(batch.results[0]!.message,'ไม่สามารถออกเอกสารได้');assert.notEqual(batch.results[0]!.label.customer,unavailable.label.customer);
   for(const secret of [id,'private rendering detail'])assert.equal(JSON.stringify(batch).includes(secret),false);
   await assertUnissued(id);assert.deepEqual(await numberState(),before);
   assert.equal((await pool.query("SELECT after_json->>'reasonCode' AS reason FROM audit_events WHERE action='finance.invoice_approval_failed' AND entity_id=$1",[id])).rows[0].reason,'unexpected');
  });

  await t.test('team revocation waits at the business gate during issuance and completes without a lock-order deadlock',async()=>{
   await restoreGrant();const id=await draft();let entered!:()=>void,release!:()=>void;
   const started=new Promise<void>(resolve=>entered=resolve),held=new Promise<void>(resolve=>release=resolve);
   const application=new FinancialApplicationService(db,readiness,new DocumentIdentityService(),async document=>{entered();await held;return renderFinancialDocumentPdf(document);});
   const issuance=controllerFor(application).approveIssuance(id,{}, {user:requestActor});await started;
   const revoke=team.revokeGrant(ownerActor,employee.id,'business',{revision:(await pool.query('SELECT permission_revision FROM users WHERE id=$1',[employee.id])).rows[0].permission_revision});
   try{
    let waiting=false;for(let attempt=0;attempt<100;attempt++){
     waiting=(await pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event='advisory') AS waiting",[schema])).rows[0].waiting;if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.ok(waiting,'Team mutation must wait at the permission gate before user locks');
   }finally{release();}
   assert.equal((await issuance).status,'issued');await revoke;
   const later=await draft(),before=await numberState();assert.deepEqual(await controllerFor().approveIssuance(later,{}, {user:requestActor}),unavailable);await assertUnissued(later);assert.deepEqual(await numberState(),before);
  });
 }finally{nodemailer.createTransport=originalTransport;for(const k of Object.keys(process.env))if(!(k in savedEnv))delete process.env[k];Object.assign(process.env,savedEnv);await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
