import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import {migrationChecksum,matchesMigrationChecksum} from './migration-checksum.js';

config({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });
if(!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("SELECT pg_advisory_lock(73501930)");
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())");
  const migrationFiles = [
    "infra/migrations/001_core.sql",
    "infra/migrations/002_platform_data.sql",
    "infra/migrations/003_auth_preferences.sql",
    "infra/migrations/004_system_settings_and_meter_presets.sql",
    "infra/migrations/005_contracts_remove_school_id.sql",
    "infra/migrations/006_missing_indexes_and_constraints.sql",
    "infra/migrations/007_payment_slip_and_verification.sql",
    "infra/migrations/008_gateway_telemetry_and_register_mapping.sql",
    "infra/migrations/009_company_banking_and_contract_rates.sql",
    "infra/migrations/010_telemetry_integrity.sql",
    // Financial migration 011 is a proposal pending the user's diff review.
    "infra/migrations/012_reports_and_notifications.sql",
    "infra/migrations/018_auth_sessions.sql",
    "infra/migrations/019_user_invitations.sql",
    "infra/migrations/020_energy_read_models.sql",
    "infra/migrations/021_platform_jobs.sql",
    "infra/migrations/022_archive_catalog.sql",
    "infra/migrations/023_platform_monitoring.sql",
    "infra/migrations/024_payload_profiles.sql",
    "infra/migrations/025_mqtt_brokers.sql",
    "infra/migrations/026_payload_receive.sql",
    "infra/migrations/027_payload_subscription.sql",
    "infra/migrations/028_preset_catalog.sql",
    "infra/migrations/029_local_financial_workflow.sql",
  ];
  for (const file of migrationFiles) {
    const sql = await readFile(new URL(`../../../../${file}`, import.meta.url), "utf8");
    const checksum=migrationChecksum(sql);
    const applied=await client.query("SELECT checksum FROM schema_migrations WHERE name=$1",[file]);
    if(applied.rows[0]) {
      if(!matchesMigrationChecksum(applied.rows[0].checksum,sql))throw new Error(`Applied migration changed: ${file}`);
      console.log(`Already applied ${file}`); continue;
    }
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",[file,checksum]);
      await client.query("COMMIT");
    } catch(error) { await client.query("ROLLBACK"); throw error; }
    console.log(`Applied ${file}`);
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(73501930)");
  client.release();
  await pool.end();
}

