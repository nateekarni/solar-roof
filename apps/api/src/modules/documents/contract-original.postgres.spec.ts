import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { DatabaseService } from '../../database/database.service.js';
import { BillingController } from '../billing/billing.controller.js';
import { ContractPdfService } from './contract-pdf.service.js';
import { layoutDocumentPages, pageLines, lineText } from './document-layout.test-fixtures.js';
import { OperationsService } from '../dashboard/operations.service.js';
import { FinancialReadinessService } from '../financial-readiness/financial-readiness.service.js';

// Explicit opt-in only. Creates/drops one isolated schema, never migrates public or edits existing fixtures.
test('PostgreSQL contract original transactions and concurrent issuance',{skip:!process.env.CONTRACT_ORIGINAL_TEST_DATABASE_URL},async t=>{
 const target=new URL(process.env.CONTRACT_ORIGINAL_TEST_DATABASE_URL!);
 assert.ok(['postgres:','postgresql:'].includes(target.protocol));assert.equal(target.hostname,'127.0.0.1');assert.equal(target.port,'15449');assert.equal(target.pathname,'/solar_financial_flow_review');assert.equal(target.search,'');assert.equal(target.hash,'');
 const schema=`contract_original_test_${randomUUID().replaceAll('-','')}`;
 const admin=new Pool({connectionString:process.env.CONTRACT_ORIGINAL_TEST_DATABASE_URL});
 await admin.query(`CREATE SCHEMA ${schema}`);
 const pool=new Pool({connectionString:process.env.CONTRACT_ORIGINAL_TEST_DATABASE_URL,options:`-c search_path=${schema},public`,max:6});
 const db={pool,query:pool.query.bind(pool),transaction:DatabaseService.prototype.transaction} as unknown as DatabaseService;
 const savedEnv={...process.env};
 Object.assign(process.env,{NODE_ENV:'production',FINANCIAL_WRITES_ENABLED:'true',SMTP_HOST:'127.0.0.1',SMTP_PORT:'11049',SMTP_FROM:'contracts@example.invalid',SMTP_SECURE:'false'});
 delete process.env.LOCAL_FINANCIAL_FIXTURE_MARKER;
 try {
  // Clone the migrated definitions and only prerequisite fixture data. Every
  // contract, approval, original and identity mutation belongs to this schema.
  const copied=new Set(['employee_positions','employee_position_domains','employee_domain_grants','users','customers','sites','site_account_assignments','site_billing_settings','devices','payload_profile_revisions','billing_source_bindings','billing_meters','rate_versions','company_profile','company_bank_accounts']);
  for(const {tablename} of (await admin.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows){
   assert.match(tablename,/^[a-z_0-9]+$/);
   await pool.query(`CREATE TABLE ${schema}.${tablename} (LIKE public.${tablename} INCLUDING ALL)`);
   if(copied.has(tablename))await pool.query(`INSERT INTO ${schema}.${tablename} SELECT * FROM public.${tablename}`);
  }
  if(!(await pool.query("SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name='users' AND column_name='company_position_id'",[schema])).rows.length)
   await pool.query(await readFile(new URL('../../../../../infra/migrations/058_user_document_identity.sql',import.meta.url),'utf8'));
  const foreignKeys=(await admin.query("SELECT c.relname AS tablename,k.conname,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND k.contype='f' AND c.relname IN('sites','contracts','documents','document_artifacts')")).rows;
  for(const key of foreignKeys){assert.match(key.tablename,/^[a-z_0-9]+$/);assert.match(key.conname,/^[a-z_0-9]+$/);await pool.query(`ALTER TABLE ${schema}.${key.tablename} ADD CONSTRAINT ${key.conname} ${key.definition.replaceAll('REFERENCES public.',`REFERENCES ${schema}.`)}`);}
  // LIKE retains real uniqueness/check constraints, but not original guards.
  const triggers=(await admin.query("SELECT pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('documents','document_artifacts') AND NOT t.tgisinternal")).rows;
  assert.ok(triggers.length>0);
  for(const {definition} of triggers)await pool.query(definition.replace(/ ON public\./,` ON ${schema}.`));
  const fixture=(await pool.query(`SELECT s.id,s.customer_id,a.user_id FROM sites s JOIN site_account_assignments a ON a.site_id=s.id AND a.revoked_at IS NULL JOIN users u ON u.id=a.user_id WHERE u.role='customer_user' AND u.status='active' AND u.email_verified_at IS NOT NULL AND u.verified_email=u.email AND EXISTS(SELECT 1 FROM billing_meters b WHERE b.site_id=s.id AND b.active AND b.billing_source_binding_id IS NOT NULL) ORDER BY s.id,u.id LIMIT 1`)).rows[0];
  assert.ok(fixture,'Assigned verified review customer and bound meter required');
  const siteId=fixture.id,customerId=fixture.customer_id;
  await pool.query("UPDATE customers SET name='Test customer',legal_name='Customer Legal',tax_id='9876543210123',tax_branch='00000',tax_address='Customer address',document_email='customer@example.invalid',phone='',status='active' WHERE id=$1",[customerId]);
  await pool.query("UPDATE sites SET name='Test solar site',external_site_id='PROTOCOL-001',capacity_mwp=0.0251,status='active',timezone='Asia/Bangkok' WHERE id=$1",[siteId]);
  await pool.query("UPDATE site_billing_settings SET service_start_date='2025-01-01',payment_term_days=30,recipient_user_ids=$2,tax_rate=7,tax_confirmed=true,prices_include_tax=false WHERE site_id=$1",[siteId,[fixture.user_id]]);
  await pool.query('UPDATE rate_versions SET retired_at=now() WHERE site_id=$1',[siteId]);
  await pool.query("INSERT INTO rate_versions(id,site_id,effective_from,rate_type,rate,currency) VALUES($1,$2,'2025-01-01','fixed_kwh',4.25,'THB')",[randomUUID(),siteId]);
  const logo='data:image/png;base64,'+(await readFile(new URL('../../../../web/public/brand/solar-roof-document-stacked.png',import.meta.url))).toString('base64');
  await pool.query("UPDATE company_profile SET company_name='Issuer Legal',tax_id='1234567890123',branch='00000',address='Issuer address',phone='021234567',email='issuer@example.invalid',logo_url=$1,signature_data_uri=$1,signatory_name='Default provider',signatory_title='Director',is_configured=true",[logo]);
  await pool.query('DELETE FROM company_bank_accounts');
  await pool.query("INSERT INTO company_bank_accounts(id,bank_name,bank_code,account_name,account_number,branch_name,is_default,is_configured) VALUES($1,'Test bank','BBL','Issuer Legal','1234567890','Head office',true,true)",[randomUUID()]);
  const owner=(await pool.query("SELECT id FROM users WHERE role='owner' AND status='active' ORDER BY id LIMIT 1")).rows[0];assert.ok(owner);
  const positionId=randomUUID();await pool.query("INSERT INTO employee_positions(id,name) VALUES($1,'Contract verification approver')",[positionId]);
  await pool.query('UPDATE users SET company_position_id=$2 WHERE id=$1',[owner.id,positionId]);
  const actor={id:owner.id,role:'owner'};const customer={id:fixture.user_id,role:'customer_user',customerId,assignedSiteIds:[siteId]};
  const readiness=new FinancialReadinessService(db);await readiness.confirm(actor);
  const originals=new ContractPdfService(db);const operations=new OperationsService(db);
  const controller=new BillingController(db,readiness,{} as any,originals);
  const input={siteId,effectiveDate:'2026-10-08',ratePerKwh:4.25,paymentTerms:'30 days',signerName:'Edited provider',signerTitle:'Authorized director',customerSignerName:'Customer signer',customerSignerTitle:'Manager'};
  let created:any;
  await t.test('POST creates one PDF and scoped download serves identical bytes',async()=>{
   created=await controller.createContract(input,{user:actor});
   const saved=(await pool.query('SELECT d.snapshot,a.* FROM documents d JOIN document_artifacts a ON a.document_id=d.id WHERE d.contract_id=$1',[created.id])).rows;
   assert.equal(saved.length,1);assert.match(created.documentNumber,/^PPA\d{9}$/);assert.equal(saved[0].snapshot.documentNumber,created.documentNumber);assert.equal(saved[0].snapshot.contractNumber,created.documentNumber);assert.equal(saved[0].pdf_bytes.subarray(0,5).toString(),'%PDF-');
   assert.equal(saved[0].snapshot.signatories.issuer.name,'Edited provider');assert.equal(saved[0].snapshot.signatories.customer.title,'Manager');
   assert.equal(saved[0].snapshot.rates[0].rate,'4.25000000');
   assert.equal(saved[0].snapshot.siteExternalId,'PROTOCOL-001');
   assert.equal(saved[0].snapshot.siteName,'Test solar site');assert.equal(saved[0].snapshot.capacityKwp,'25.1');
   const downloaded=await operations.documentPdf(created.documentId,customer);
   assert.equal(createHash('sha256').update(downloaded.pdf_bytes).digest('hex'),created.contentHash);
  });
  await t.test('company/default and site metadata edits cannot alter issued snapshot or original hash',async()=>{
   await pool.query("UPDATE company_profile SET company_name='Later company',signatory_name='Later provider',signatory_title='Later title'");
   await pool.query("UPDATE sites SET name='Later solar site',external_site_id='PROTOCOL-CHANGED',capacity_mwp=0.0999 WHERE id=$1",[siteId]);
   const again=await originals.getContractOriginal(created.id,customer);assert.equal(again.sha256,created.contentHash);
   const snapshot=(await pool.query('SELECT snapshot FROM documents WHERE id=$1',[again.documentId])).rows[0].snapshot;
   assert.equal(snapshot.issuer.name,'Issuer Legal');assert.equal(snapshot.signatories.issuer.name,'Edited provider');
   assert.equal(snapshot.siteName,'Test solar site');assert.equal(snapshot.siteExternalId,'PROTOCOL-001');assert.equal(snapshot.capacityKwp,'25.1');
   const downloaded=await operations.documentPdf(again.documentId,customer);
   assert.equal(createHash('sha256').update(downloaded.pdf_bytes).digest('hex'),created.contentHash);
   await assert.rejects(pool.query("UPDATE document_artifacts SET pdf_bytes=$2 WHERE document_id=$1",[again.documentId,Buffer.from('replacement')]));
  });
  await t.test('parallel authorized historical issuance creates one immutable artifact and absent protocol ID prints name only',async()=>{
   const id=randomUUID();
   await pool.query('UPDATE sites SET external_site_id=NULL WHERE id=$1',[siteId]);
   await pool.query(`INSERT INTO contracts(id,site_id,version,start_date,status,payment_terms,signer_name,tax_id,company_name,tax_address) VALUES($1,$2,2,'2025-01-01','active','30 days','Historical signer','9876543210123','Historical customer','Historical address')`,[id,siteId]);
   await pool.query(`INSERT INTO rate_versions VALUES($1,$2,'2025-01-01',NULL,'fixed_kwh',4.25,'THB')`,[randomUUID(),id]);
   await assert.rejects(originals.getContractOriginal(id,customer),(error:any)=>error.getStatus()===404);
   await assert.rejects(originals.ensureContractOriginal(id,customer),(error:any)=>error.getStatus()===403);
   assert.equal((await pool.query('SELECT count(*)::int AS count FROM documents WHERE contract_id=$1',[id])).rows[0].count,0);
   await readiness.confirm(actor);
   const results=await Promise.all(Array.from({length:5},()=>originals.ensureContractOriginal(id,actor)));
   assert.equal(new Set(results.map(r=>r.documentId)).size,1);assert.equal(new Set(results.map(r=>r.sha256)).size,1);
   assert.equal((await pool.query('SELECT count(*)::int AS count FROM documents WHERE contract_id=$1',[id])).rows[0].count,1);
   const snapshot=(await pool.query('SELECT snapshot FROM documents WHERE contract_id=$1',[id])).rows[0].snapshot;
   assert.equal(snapshot.siteExternalId,undefined);assert.equal(snapshot.siteName,'Later solar site');
   const renderedLines=layoutDocumentPages(snapshot).flatMap(pageLines).map(lineText);
   const siteLine=renderedLines.find(value=>value.startsWith('ไซต์งาน:'));
   assert.equal(siteLine,'ไซต์งาน: Later solar site');
   assert.ok(renderedLines.every(value=>!value.includes(siteId)));
   assert.ok(renderedLines.every(value=>!value.includes('PROTOCOL-CHANGED')));
  });
  await t.test('cross-organization access cannot retrieve bytes or issue an original',async()=>{
   const other={id:randomUUID(),role:'customer_user',customerId:randomUUID(),assignedSiteIds:[]};
   await assert.rejects(originals.ensureContractOriginal(created.id,other));await assert.rejects(operations.documentPdf(created.documentId,other));
   const count=(await pool.query('SELECT count(*)::int AS count FROM documents')).rows[0].count;assert.equal(count,2);
  });
  await t.test('render failure rolls back all new contract/rate/document/artifact records',async()=>{
   const before=(await pool.query('SELECT (SELECT count(*) FROM contracts) AS contracts,(SELECT count(*) FROM rate_versions) AS rates,(SELECT count(*) FROM documents) AS documents,(SELECT count(*) FROM document_artifacts) AS artifacts')).rows[0];
   const failing=new ContractPdfService(db,async()=>{throw new Error('forced render failure');});
   const c=new BillingController(db,readiness,{} as any,failing);
   await assert.rejects(c.createContract(input,{user:actor}),/forced render failure/);
   const after=(await pool.query('SELECT (SELECT count(*) FROM contracts) AS contracts,(SELECT count(*) FROM rate_versions) AS rates,(SELECT count(*) FROM documents) AS documents,(SELECT count(*) FROM document_artifacts) AS artifacts')).rows[0];
   assert.deepEqual(after,before);
  });
  await t.test('incomplete historical identity is blocked without filling current customer defaults',async()=>{
   const id=randomUUID();await pool.query(`INSERT INTO contracts(id,site_id,version,start_date,status,payment_terms,signer_name) VALUES($1,$2,3,'2024-01-01','active','30 days','Historical signer')`,[id,siteId]);
   await assert.rejects(originals.ensureContractOriginal(id,actor));
   assert.equal((await pool.query('SELECT count(*)::int AS count FROM documents WHERE contract_id=$1',[id])).rows[0].count,0);
  });
 } finally {for(const key of Object.keys(process.env))if(!(key in savedEnv))delete process.env[key];Object.assign(process.env,savedEnv);await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
