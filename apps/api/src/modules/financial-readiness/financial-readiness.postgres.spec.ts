import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { DatabaseService } from '../../database/database.service.js';
import { SettingsService, canonicalGlobalFinancialConfiguration } from '../settings/settings.service.js';
import { FinancialReadinessService } from './financial-readiness.service.js';
import { financialConfigurationHash } from './financial-configuration.js';

// Explicit opt-in, dedicated loopback test/review DB only. Never reads application DATABASE_URL.
test('PostgreSQL serializes confirmation with company and bank mutations and retains audited approval history', {skip:!process.env.FINANCIAL_READINESS_TEST_DATABASE_URL}, async t=>{
  const connectionString=process.env.FINANCIAL_READINESS_TEST_DATABASE_URL!;
  const target=new URL(connectionString);
  assert.ok(['postgres:','postgresql:'].includes(target.protocol)&&['127.0.0.1','localhost','[::1]'].includes(target.hostname)&&!target.search&&!target.hash,'Dedicated loopback PostgreSQL test URL required');
  assert.match(target.pathname,/^\/[a-z0-9_]*(?:test|review)[a-z0-9_]*$/i,'Dedicated test or review database name required');
  const schema='financial_readiness_test_'+randomUUID().replaceAll('-','');
  const admin=new Pool({connectionString});
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool=new Pool({connectionString,options:`-c search_path=${schema}`,max:8,application_name:schema});
  const previous={...process.env};
  Object.assign(process.env,{NODE_ENV:'production',FINANCIAL_WRITES_ENABLED:'true'});
  delete process.env.LOCAL_FINANCIAL_FIXTURE_MARKER;
  try {
    await pool.query(`
      CREATE TABLE users(id uuid PRIMARY KEY,role text,status text);
      CREATE TABLE company_profile(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_name text,tax_id text,branch text,address text,phone text,email text,logo_url text,signatory_name text,signatory_title text,signature_data_uri text,updated_at timestamptz DEFAULT now());
      CREATE TABLE company_bank_accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bank_name text,bank_code text DEFAULT '',account_name text,account_number text,branch_name text DEFAULT '',promptpay_id text DEFAULT '',is_default boolean DEFAULT false,is_configured boolean DEFAULT true,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE billing_cycles(id uuid PRIMARY KEY,site_id uuid,period_start date,period_end date,status text,quality text,meter_snapshot jsonb,policy_hash text,billing_settings_version integer,billing_kind text,manual_lines jsonb);
      CREATE TABLE documents(id uuid PRIMARY KEY,billing_cycle_id uuid,is_current boolean,status text,created_at timestamptz,document_type text,snapshot jsonb,content_hash text);
      CREATE TABLE document_artifacts(document_id uuid PRIMARY KEY,pdf_bytes bytea,sha256 text);
      CREATE TABLE payments(billing_cycle_id uuid,status text);
      CREATE TABLE audit_events(id uuid PRIMARY KEY,actor_id uuid REFERENCES users(id),action text,entity_type text,entity_id uuid,correlation_id text);
      CREATE TABLE customers(id uuid PRIMARY KEY,status text,legal_name text,tax_id text,tax_address text,document_email text);
      CREATE TABLE sites(id uuid PRIMARY KEY,customer_id uuid,status text,timezone text);
      CREATE TABLE site_billing_settings(site_id uuid,version integer,service_start_date date,payment_term_days integer,tax_rate numeric,prices_include_tax boolean,tax_confirmed boolean,recipient_user_ids uuid[]);
    `);
    await pool.query(await readFile(new URL('../../../../../infra/migrations/056_production_financial_readiness.sql',import.meta.url),'utf8'));
    const db={pool,query:pool.query.bind(pool),transaction:DatabaseService.prototype.transaction} as unknown as DatabaseService;
    const readiness=new FinancialReadinessService(db),settings=new SettingsService(db);
    const owner={id:randomUUID(),role:'owner'},bankId=randomUUID();
    const png='data:image/png;base64,iVBORw0KGgo=';
    await pool.query("INSERT INTO users VALUES($1,'owner','active')",[owner.id]);
    await pool.query(`INSERT INTO company_profile(company_name,tax_id,branch,address,phone,email,logo_url,signatory_name,signatory_title,signature_data_uri) VALUES('Issuer','1234567890123','Head office','Address','123','billing@example.com',$1,'Signer','Director',$1)`,[png]);
    await pool.query("INSERT INTO company_bank_accounts(id,bank_name,account_name,account_number,is_default) VALUES($1,'Bank','Issuer','1234',true)",[bankId]);

    await t.test('concurrent identical confirmations create exactly one approval and one confirmation audit',async()=>{
      const statuses=await Promise.all(Array.from({length:8},()=>readiness.confirm(owner)));
      assert.equal(new Set(statuses.map(s=>s.approval?.id)).size,1);
      assert.ok(statuses.every(s=>s.scope==='PRODUCTION'&&s.approval));
      assert.equal((await pool.query('SELECT count(*)::int AS total FROM financial_readiness_approvals')).rows[0].total,1);
      assert.equal((await pool.query("SELECT count(*)::int AS total FROM audit_events WHERE action='finance.approval.confirmed' AND actor_id=$1",[owner.id])).rows[0].total,1);
    });
    await t.test('logo mutation revokes approval and emits actor audit in its committed transaction',async()=>{
      const id=(await readiness.status(owner)).approval!.id;
      await settings.updateCompanyProfile({logoUrl:'data:image/jpeg;base64,/9j/AA=='},owner.id);
      const row=(await pool.query('SELECT * FROM financial_readiness_approvals WHERE id=$1',[id])).rows[0];
      assert.ok(row.revoked_at);assert.equal(row.revoked_by,owner.id);assert.equal(row.revoke_reason,'financial_configuration_changed');
      assert.equal((await readiness.status(owner)).approval,null);
      assert.equal((await pool.query("SELECT count(*)::int AS total FROM audit_events WHERE action='finance.approval.revoked' AND entity_id=$1 AND actor_id=$2",[id,owner.id])).rows[0].total,1);
    });
    await t.test('failed confirmation audit rolls back inserted approval and repeated unchanged bank save keeps approval',async()=>{
      await pool.query(`CREATE FUNCTION reject_confirmation_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='finance.approval.confirmed' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER reject_confirmation BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_confirmation_audit();`);
      await assert.rejects(readiness.confirm(owner),/test audit failure/);
      assert.equal((await pool.query('SELECT count(*)::int AS total FROM financial_readiness_approvals WHERE revoked_at IS NULL')).rows[0].total,0);
      await pool.query('DROP TRIGGER reject_confirmation ON audit_events');
      const status=await readiness.confirm(owner);
      await settings.saveBankAccount({id:bankId,accountNumber:'1234'},owner.id);
      assert.equal((await readiness.status(owner)).approval?.id,status.approval?.id);
    });
    await t.test('production gates require a persisted cycle and reject caller periods that differ from stored dates',async()=>{
      const siteId=randomUUID(),cycleId=randomUUID();
      await pool.query("INSERT INTO billing_cycles(id,site_id,period_start,period_end,status,quality,meter_snapshot,billing_kind) VALUES($1,$2,'2026-01-01','2026-01-31','pending_review','complete','[{\"meterId\":\"meter-a\"}]','energy')",[cycleId,siteId]);
      for(const action of ['issue','approve_payment'] as const) {
        await assert.rejects(readiness.assertEnabled(action,{siteId}),error=>(error as any).getStatus()===503&&(error as any).getResponse().missing.includes('context.cycle'));
        await assert.rejects(readiness.assertEnabled(action,{billingCycleId:cycleId}),error=>(error as any).getResponse().missing.includes('cycle.snapshot'));
        await assert.rejects(readiness.assertEnabled(action,{billingCycleId:cycleId,periodStart:'2026-03-01',periodEnd:'2026-03-31'}),error=>(error as any).getStatus()===400);
      }
      // PostgreSQL DATE formatting is authoritative, regardless of the client timezone.
      await assert.rejects(readiness.assertEnabled('issue',{billingCycleId:cycleId,periodStart:'2026-01-01',periodEnd:'2026-01-31'}),error=>(error as any).getStatus()===503&&(error as any).getResponse().missing.includes('cycle.snapshot'));
      assert.equal((await pool.query("SELECT to_char(period_start,'YYYY-MM-DD') AS starts,to_char(period_end,'YYYY-MM-DD') AS ends,policy_snapshot,financial_scope FROM billing_cycles WHERE id=$1",[cycleId])).rows[0].starts,'2026-01-01');
    });
    await t.test('confirmation racing a bank mutation cannot leave a stale active approval',async()=>{
      await Promise.all([readiness.confirm(owner),settings.saveBankAccount({id:bankId,accountNumber:'9999'},owner.id)]);
      const status=await readiness.status(owner);
      const active=(await pool.query('SELECT * FROM financial_readiness_approvals WHERE revoked_at IS NULL')).rows;
      assert.ok(active.length<=1);
      if(active.length) {
        const current=financialConfigurationHash(canonicalGlobalFinancialConfiguration(await settings.getCompanyProfile(),await settings.listBankAccounts()));
        assert.equal(active[0].config_hash,current);assert.equal(status.approval?.id,active[0].id);
      }else assert.equal(status.approval,null);
      const confirmed=await readiness.confirm(owner);
      assert.ok(confirmed.approval);
      assert.equal((await pool.query('SELECT count(*)::int AS total FROM financial_readiness_approvals')).rows[0].total,3);
      await pool.query("UPDATE users SET status='disabled' WHERE id=$1",[owner.id]);
      await assert.rejects(readiness.confirm(owner),/Owner/);
    });
  }finally {
    for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);
    await pool.end();
    // Generated identifier and isolated test schema only; application data is retained.
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();
  }
});
