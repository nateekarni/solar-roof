import { Pool } from "pg";
import { assertSampleSeedAllowed } from "../modules/settings/financial-settings-policy.js";

// Opt-in only. Never invoked by db:migrate or normal installation.
assertSampleSeedAllowed(process.env.NODE_ENV, process.env.FINANCIAL_SAMPLE_SEED);
if (!process.env.DATABASE_URL) throw new Error("Explicit development/test DATABASE_URL required");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("LOCK TABLE company_profile, company_bank_accounts IN SHARE ROW EXCLUSIVE MODE");
  const configured = await client.query(`SELECT EXISTS(SELECT 1 FROM company_profile WHERE is_configured) OR EXISTS(SELECT 1 FROM company_bank_accounts WHERE is_configured) AS present`);
  if (configured.rows[0]?.present) throw new Error("Refusing to overwrite configured financial data");
  await client.query(`INSERT INTO company_profile (company_name,tax_id,branch,address,phone,email,is_configured)
    VALUES ('DEVELOPMENT SAMPLE — NOT A LEGAL ISSUER','0000000000000','','Test address','','billing@example.invalid',true)`);
  await client.query(`INSERT INTO company_bank_accounts (bank_name,bank_code,account_name,account_number,branch_name,promptpay_id,is_default,is_configured)
    VALUES ('TEST BANK','test','DEVELOPMENT SAMPLE','0000000000','','',true,true)`);
  await client.query("COMMIT");
  console.log("Development sample configuration inserted. This does not confirm accounting or enable tax issuance.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
