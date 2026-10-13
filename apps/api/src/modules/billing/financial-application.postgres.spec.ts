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
import {financialDocumentSnapshot} from '../documents/financial-document-pdf.js';
import nodemailer from 'nodemailer';

// Real database SQL, transactions, readiness and PDF rendering; SMTP is the only external double.
test('production finance freezes configured policy and artifacts across calculation, revision, settlement, manual issuance and replay',
 {skip:!process.env.FINANCIAL_READINESS_TEST_DATABASE_URL},async t=>{
 const url=new URL(process.env.FINANCIAL_READINESS_TEST_DATABASE_URL!);
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15449');assert.equal(url.pathname,'/solar_financial_flow_review');
 const schema='task7_'+randomUUID().replaceAll('-','');
 const admin=new Pool({connectionString:url.toString()});await admin.query(`CREATE SCHEMA ${schema}`);
 const pool=new Pool({connectionString:url.toString(),options:`-c search_path=${schema},public`,max:8});
 const savedEnv={...process.env};const originalTransport=nodemailer.createTransport;const messages:any[]=[];
 Object.assign(process.env,{NODE_ENV:'production',FINANCIAL_WRITES_ENABLED:'true',SMTP_HOST:'127.0.0.1',SMTP_PORT:'11049',SMTP_FROM:'finance@example.invalid',SMTP_SECURE:'false'});delete process.env.LOCAL_FINANCIAL_FIXTURE_MARKER;
 try{
  const copy=['users','customers','sites','site_account_assignments','site_billing_settings','devices','payload_profile_revisions','billing_source_bindings','billing_meters','register_mapping_versions','rate_versions','company_profile','company_bank_accounts'];
  for(const table of [...copy,'billing_cycles','documents','document_artifacts','financial_delivery_outbox','document_number_series','payments','audit_events','financial_readiness_approvals','telemetry_raw']){
   await pool.query(`CREATE TABLE ${schema}.${table} (LIKE public.${table} INCLUDING ALL)`);
   if(copy.includes(table))await pool.query(`INSERT INTO ${schema}.${table} SELECT * FROM public.${table}`);
  }
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
  nodemailer.createTransport=(()=>({sendMail:async(message:any)=>{messages.push(message);return {accepted:[message.to]};},close:()=>{}})) as any;
  let cycle:any,invoice:any;
  await t.test('calculate persists production policy and literal configured tax rather than TEST tax',async()=>{
   cycle=(await service.calculate(siteId,'2026-09-01','2026-09-30',owner.id)).cycles[0];
   assert.equal(cycle.financial_scope,'PRODUCTION');assert.equal(cycle.policy_snapshot.taxRate,'10.0000');
   // Literal seed energy 1000 kWh at 4.3210 = 4321.00; configured ten percent = 432.10.
   assert.equal(Number(cycle.subtotal),4321);assert.equal(Number(cycle.simulated_tax),432.1);assert.equal(Number(cycle.amount),4753.1);
   assert.equal((await service.calculate(siteId,'2026-09-01','2026-09-30',owner.id)).cycles[0].id,cycle.id);
  });
  await t.test('issue freezes signatory, company, recipients, bank, logo and original PDF with one outbox',async()=>{
   invoice=(await service.issueInvoice(cycle.id,owner.id)).document;
   assert.equal(invoice.snapshot.policy.scope,'PRODUCTION');assert.equal(invoice.snapshot.company.company_name,'Production issuer');assert.equal(invoice.snapshot.company.signatory_name,'Authorized signer');assert.equal(invoice.snapshot.logoDataUri,logo);assert.ok(invoice.snapshot.banks.length);assert.ok(invoice.snapshot.recipients.length);
   assert.equal(financialDocumentSnapshot(invoice).syntheticTest,false);
   const replay=await service.issueInvoice(cycle.id,owner.id);assert.equal(replay.document.id,invoice.id);assert.equal(replay.created,false);
   const artifact=(await pool.query('SELECT * FROM document_artifacts WHERE document_id=$1',[invoice.id])).rows[0];assert.equal(createHash('sha256').update(artifact.pdf_bytes).digest('hex'),invoice.content_hash);
  });
  await t.test('send uses frozen production scope even under TEST environment and replays without new messages',async()=>{
   process.env.NODE_ENV='test';await service.send(cycle.id,owner.id);await service.send(cycle.id,owner.id);process.env.NODE_ENV='production';
   assert.equal(messages.length,invoice.snapshot.recipients.length);assert.ok(messages.every(m=>!m.subject.includes('TEST')&&!m.text.includes('Synthetic')));
   assert.equal(createHash('sha256').update(messages[0].attachments[0].content).digest('hex'),invoice.content_hash);
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
  await t.test('approved full transfer creates one receipt from frozen invoice identity and survives replay',async()=>{
   const original=JSON.stringify(invoice.snapshot),originalHash=invoice.content_hash;
   await pool.query("UPDATE company_profile SET company_name='Replacement issuer',signatory_name='Replacement signer'");await readiness.confirm({id:owner.id,role:'owner'});
   const recipient=invoice.snapshot.recipients[0];const payment=await service.submitPayment(cycle.id,{amount:'5500.00',evidenceKey:'task7-full-'+schema},recipient.id);
   const result=await service.verifyPayment(cycle.id,'approved',undefined,owner.id,{paymentId:payment.paymentId,verifiedAmount:'5500.00',verifiedTransferAt:'2026-10-10T01:00:00Z'});
   assert.equal(result.billingCycleStatus,'paid');assert.equal(result.receipt.snapshot.policy.scope,'PRODUCTION');assert.equal(result.receipt.snapshot.logoDataUri,logo);assert.equal(result.receipt.snapshot.invoiceNumber,invoice.document_number);
   assert.equal(result.receipt.snapshot.company.company_name,'Production issuer');assert.equal(result.receipt.snapshot.company.signatory_name,'Authorized signer');
   assert.equal(JSON.stringify((await pool.query('SELECT snapshot FROM documents WHERE id=$1',[invoice.id])).rows[0].snapshot),original);assert.equal((await pool.query('SELECT sha256 FROM document_artifacts WHERE document_id=$1',[invoice.id])).rows[0].sha256,originalHash);
   const replay=await service.verifyPayment(cycle.id,'approved',undefined,owner.id,{paymentId:payment.paymentId,verifiedAmount:'5500.00',verifiedTransferAt:'2026-10-10T01:00:00Z'});assert.equal(replay.receipt.id,result.receipt.id);
  });
  await t.test('manual production invoice validates its authoritative cycle atomically and idempotently',async()=>{
   await pool.query('UPDATE site_billing_settings SET tax_rate=5.5,prices_include_tax=true,version=version+1 WHERE site_id=$1',[siteId]);
   const input={siteId,lines:[{description:'Maintenance',quantity:'1',unitPrice:'105.5000'}],idempotencyKey:'task7-manual-'+schema};
   const first=await siteBilling.manual(input,{id:owner.id,role:'owner'}),replay=await siteBilling.manual(input,{id:owner.id,role:'owner'});
   assert.equal(first.cycle.status,'approved');
   assert.equal(Number(first.cycle.subtotal),100);assert.equal(Number(first.cycle.simulated_tax),5.5);assert.equal(Number(first.cycle.amount),105.5);assert.equal(first.document.snapshot.policy.pricesIncludeTax,true);assert.equal(first.document.id,replay.document.id);
   await pool.query('UPDATE site_billing_settings SET tax_confirmed=false WHERE site_id=$1',[siteId]);
   const before=(await pool.query('SELECT count(*)::int AS n FROM billing_cycles')).rows[0].n;
   await assert.rejects(service.manualInvoice({...input,idempotencyKey:'blocked-'+schema},owner.id),/tax|ready/i);
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM billing_cycles')).rows[0].n,before);
   await pool.query('UPDATE site_billing_settings SET tax_confirmed=true,recipient_user_ids=\'{}\' WHERE site_id=$1',[siteId]);
   await assert.rejects(service.manualInvoice({...input,idempotencyKey:'gate-blocked-'+schema},owner.id),error=>(error as any).getStatus()===503);
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM billing_cycles')).rows[0].n,before,'The new draft cycle rolls back with its failed transaction-aware readiness gate');
  });
  const count=(await pool.query('SELECT (SELECT count(*) FROM billing_cycles)::int AS cycles,(SELECT count(*) FROM documents)::int AS documents,(SELECT count(*) FROM document_artifacts)::int AS artifacts,(SELECT count(*) FROM financial_delivery_outbox)::int AS outboxes,(SELECT count(*) FROM audit_events WHERE actor_id=$1)::int AS audits',[owner.id])).rows[0];
  assert.equal(count.cycles,2);assert.equal(count.documents,4);assert.equal(count.artifacts,4);assert.equal(count.outboxes,4);assert.ok(count.audits>=7);t.diagnostic(JSON.stringify({schema,...count}));
  assert.ok(gates.filter(g=>g.action==='calculate').every(g=>g.context.siteId===siteId&&g.context.periodStart==='2026-09-01'&&g.context.periodEnd==='2026-09-30'&&g.transaction));
  for(const action of ['issue','approve_payment','adjust','send'])assert.ok(gates.filter(g=>g.action===action).every(g=>typeof g.context.billingCycleId==='string'));
  assert.ok(gates.some(g=>g.action==='approve_payment'&&g.transaction),'Payment mutation must gate the same transaction to prevent approval revocation races');
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='finance.issue_invoice' AND actor_id=$1",[owner.id])).rows[0].n,3);
 }finally{nodemailer.createTransport=originalTransport;for(const k of Object.keys(process.env))if(!(k in savedEnv))delete process.env[k];Object.assign(process.env,savedEnv);await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
