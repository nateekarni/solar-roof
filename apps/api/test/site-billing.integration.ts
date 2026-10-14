import 'reflect-metadata';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {DatabaseService} from '../src/database/database.service.js';
import {FinancialReadinessService} from '../src/modules/financial-readiness/financial-readiness.service.js';
import {FinancialApplicationService} from '../src/modules/billing/financial-application.service.js';
import {SiteBillingService} from '../src/modules/billing/site-billing.service.js';
import {localFinancialBinding,TEST_FINANCIAL_POLICY_HASH} from '../src/modules/billing/local-financial-policy.js';
if(!localFinancialBinding())throw new Error('Exact local TEST binding required');
const db=new DatabaseService(),client=await db.pool.connect();
const schema='site_billing_acceptance_'+randomUUID().replaceAll('-','');
try{
 await client.query('BEGIN');
 // Definitions, trigger behavior and required fixture data live in an owned
 // transaction-only schema. No public application/fixture row is changed.
 await client.query(`CREATE SCHEMA ${schema}`);await client.query(`SET LOCAL search_path=${schema},public`);
 const copied=new Set(['employee_positions','employee_position_domains','employee_domain_grants','users','customers','sites','site_account_assignments','site_billing_settings','rate_versions','company_profile','company_bank_accounts','local_financial_test_policy','audit_events']);
 const tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
 for(const {tablename}of tables){assert.match(tablename,/^[a-z_0-9]+$/);await client.query(`CREATE TABLE ${schema}.${tablename} (LIKE public.${tablename} INCLUDING ALL)`);if(copied.has(tablename))await client.query(`INSERT INTO ${schema}.${tablename} SELECT * FROM public.${tablename}`);}
 const positioned=(await client.query("SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name='users' AND column_name='company_position_id'",[schema])).rows.length>0;
 if(!positioned)await client.query(await readFile(new URL('../../../infra/migrations/058_user_document_identity.sql',import.meta.url),'utf8'));
 if(!(await client.query("SELECT 1 FROM information_schema.tables WHERE table_schema=$1 AND table_name='billing_replacement_drafts'",[schema])).rows.length)await client.query(await readFile(new URL('../../../infra/migrations/059_billing_issuance_approval.sql',import.meta.url),'utf8'));
 const triggers=(await client.query("SELECT pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace WHERE n.nspname='public' AND pn.nspname='public' AND NOT t.tgisinternal")).rows;
 for(const {definition}of triggers)await client.query(definition.replace(/ ON public\./,` ON ${schema}.`));
 const owner=(await client.query("SELECT id,role FROM users WHERE role='owner' AND status='active' LIMIT 1")).rows[0];assert.ok(owner);
 const positionId=randomUUID();await client.query("INSERT INTO employee_positions(id,name) VALUES($1,'Site billing acceptance approver')",[positionId]);await client.query('UPDATE users SET company_position_id=$2 WHERE id=$1',[owner.id,positionId]);
 const base=(await client.query(`SELECT s.*,a.user_id FROM sites s JOIN site_account_assignments a ON a.site_id=s.id AND a.revoked_at IS NULL JOIN users u ON u.id=a.user_id JOIN customers c ON c.id=s.customer_id WHERE u.status='active' AND c.status='active' AND u.email_verified_at IS NOT NULL AND u.verified_email=u.email LIMIT 1`)).rows[0];assert.ok(base,'Assigned verified fixture recipient required');
 await client.query("UPDATE customers SET legal_name='Synthetic integration customer',tax_id='0999999999999',tax_address='Synthetic TEST address' WHERE id=$1",[base.customer_id]);
 // All writes use the outer transaction and roll back, including generated original PDFs.
 const transactional={query:client.query.bind(client),transaction:async(run:any)=>run(client),pool:db.pool} as unknown as DatabaseService;
 const readiness=new FinancialReadinessService(transactional),financial=new FinancialApplicationService(transactional,readiness);
 const service=new SiteBillingService(transactional,financial);
 await service.saveSettings(base.id,{serviceStartDate:'2026-01-01',paymentTermDays:30,recipientUserIds:[base.user_id],taxRate:'7',taxConfirmed:true,pricesIncludeTax:false},owner);
 const settings=await service.settings(base.id,owner);assert.equal(settings.taxRate,'7.0000');
 const preview=await service.manualPreview({siteId:base.id,lines:[{description:'Synthetic integration service',quantity:'2.5',unitPrice:'10.01'}]},owner);assert.equal(preview.total,'26.78');
 const manualInput={siteId:base.id,lines:[{description:'Synthetic integration service',quantity:'2.5',unitPrice:'10.01'}],dueDate:'2026-11-01',idempotencyKey:randomUUID()};
 const manual=await service.manual(manualInput,owner);assert.equal(manual.cycle.status,'pending_issue_approval');assert.equal('document' in manual,false);
 assert.equal((await client.query('SELECT count(*)::int n FROM documents WHERE billing_cycle_id=$1',[manual.cycle.id])).rows[0].n,0);
 const manualDocument=(await financial.approveInvoice(manual.cycle.id,owner.id)).document;assert.equal(manualDocument.snapshot.cycle.billing_kind,'manual');assert.equal(manualDocument.snapshot.dueDate,'2026-11-01');assert.equal(manualDocument.snapshot.approver.userId,owner.id);assert.equal(manualDocument.snapshot.approver.position,'Site billing acceptance approver');
 const second=await service.manual({siteId:base.id,lines:[{description:'Second same-day manual bill',quantity:'1',unitPrice:'1'}],idempotencyKey:randomUUID()},owner);
 assert.equal(second.cycle.status,'pending_issue_approval');assert.notEqual(second.cycle.id,manual.cycle.id);
 const secondDocument=(await financial.approveInvoice(second.cycle.id,owner.id)).document;assert.notEqual(secondDocument.id,manualDocument.id);
 const replay=await service.manual(manualInput,owner);assert.equal(replay.cycle.id,manual.cycle.id);assert.equal('document' in replay,false);
 const approvedReplay=(await financial.approveInvoice(replay.cycle.id,owner.id)).document;assert.equal(approvedReplay.id,manualDocument.id);assert.equal(approvedReplay.document_number,manualDocument.document_number);assert.equal(approvedReplay.content_hash,manualDocument.content_hash);
 const originals=(await client.query(`SELECT (SELECT count(*) FROM documents WHERE billing_cycle_id=$1)::int AS documents,(SELECT count(*) FROM document_artifacts WHERE document_id=$2)::int AS artifacts,(SELECT count(*) FROM financial_delivery_outbox WHERE document_id=$2)::int AS outboxes`,[manual.cycle.id,manualDocument.id])).rows[0];assert.deepEqual(originals,{documents:1,artifacts:1,outboxes:1});
 const id=randomUUID();
 const cycle=(await client.query(`INSERT INTO billing_cycles(id,site_id,period_start,period_end,cutoff_time,status,quality,opening_energy,closing_energy,consumed_kwh,rate,amount,subtotal,simulated_tax,meter_snapshot,policy_hash,billing_settings_version) VALUES($1,$2,'2090-10-01','2090-10-31',now(),'pending_review','complete',0,10,10,3.5,37.45,35,2.45,$3,$4,$5) RETURNING *`,[id,base.id,JSON.stringify([{from:'2090-10-01',to:'2090-11-01',consumedKwh:'10.000',rate:'3.5000',subtotal:'35.00'}]),TEST_FINANCIAL_POLICY_HASH,settings.version])).rows[0];
 assert.equal((await financial.prepareInvoice(cycle.id,owner.id)).cycle.status,'pending_issue_approval');
 const original=(await financial.approveInvoice(cycle.id,owner.id)).document;
 const originalBytes=(await client.query('SELECT pdf_bytes FROM document_artifacts WHERE document_id=$1',[original.id])).rows[0].pdf_bytes;
 await service.applyRates({selection:'selected',siteIds:[base.id],effectiveDate:'2090-12-01',rate:'4.1',reason:'Scheduled December integration tariff',replaceFuture:true},owner);
 await assert.rejects(service.reprice(cycle.id,{rate:'3.7',reason:'Synthetic integration correction'},owner),(error:any)=>error.getResponse().code==='FUTURE_RATE_REPLACEMENT_REQUIRED');
 assert.equal((await client.query('SELECT is_current FROM documents WHERE id=$1',[original.id])).rows[0].is_current,true);
 const correction=await service.reprice(cycle.id,{rate:'3.7',reason:'Synthetic integration correction',replaceFuture:true},owner);assert.equal(correction.status,'pending_issue_approval');
 const pending=(await client.query("SELECT * FROM billing_replacement_drafts WHERE billing_cycle_id=$1 AND status='pending_issue_approval'",[cycle.id])).rows;assert.equal(pending.length,1);assert.equal(pending[0].supersedes_document_id,original.id);
 assert.equal((await client.query('SELECT is_current FROM documents WHERE id=$1',[original.id])).rows[0].is_current,true);assert.equal((await client.query('SELECT count(*)::int n FROM documents WHERE billing_cycle_id=$1',[cycle.id])).rows[0].n,1);
 await financial.approveInvoice(cycle.id,owner.id);
 const revisions=(await client.query("SELECT * FROM documents WHERE billing_cycle_id=$1 AND document_type='invoice' ORDER BY revision",[cycle.id])).rows;assert.equal(revisions.length,2);assert.equal(revisions[0].status,'superseded');assert.equal(revisions[0].is_current,false);assert.equal(revisions[1].is_current,true);assert.equal(revisions[1].supersedes_document_id,original.id);assert.equal(revisions[1].snapshot.dueDate,original.snapshot.dueDate);assert.equal(revisions[1].amount,'39.59000000');
 assert.equal(createHash('sha256').update(originalBytes).digest('hex'),revisions[0].content_hash);
 await service.applyRates({selection:'selected',siteIds:[base.id],effectiveDate:'2090-10-01',rate:'3.8',reason:'Synthetic retirement',replaceFuture:true},owner);
 const retired=(await client.query('SELECT rate FROM rate_versions WHERE site_id=$1 AND retired_at IS NOT NULL',[base.id])).rows;assert.ok(retired.some(r=>r.rate==='3.70000000'));
 const paymentId=randomUUID();await client.query("INSERT INTO payments(id,billing_cycle_id,amount,status,paid_at) VALUES($1,$2,1,'pending_verification',now())",[paymentId,cycle.id]);
 await assert.rejects(service.reprice(cycle.id,{rate:'3.9',reason:'Blocked pending'},owner),/locked/);
 await client.query("UPDATE payments SET status='paid',verified_amount=1,verified_transfer_at=now(),verified_by=$2 WHERE id=$1",[paymentId,owner.id]);
 await assert.rejects(service.reprice(cycle.id,{rate:'3.9',reason:'Blocked partial approval'},owner),/locked/);
 await client.query('SAVEPOINT immutable_check');await assert.rejects(client.query('UPDATE documents SET amount=999 WHERE id=$1',[original.id]),/immutable/);await client.query('ROLLBACK TO SAVEPOINT immutable_check');
 console.log('PASS isolated real database: pending manual/correction drafts, positioned explicit approval, configured tax, distinct keyed same-day bills, replay without duplicate originals, immutable revisions, preserved due dates, tariff retirement, pending/partial transfer locks');
}finally{await client.query('ROLLBACK');client.release();await db.pool.end();}
