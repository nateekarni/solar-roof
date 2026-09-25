import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

config({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });
import { loadEnv } from "@solar/domain";

const env = loadEnv(process.env);
const pool = new Pool({ connectionString: env.DATABASE_URL });
try {
  const migrationFiles = [
    "infra/migrations/001_core.sql",
    "infra/migrations/002_platform_data.sql",
    "infra/migrations/003_auth_preferences.sql",
    "infra/migrations/004_system_settings_and_meter_presets.sql",
    "infra/migrations/005_contracts_remove_school_id.sql",
    "infra/migrations/006_missing_indexes_and_constraints.sql",
    "infra/migrations/007_payment_slip_and_verification.sql",
    "infra/migrations/008_gateway_telemetry_and_register_mapping.sql",
  ];
  for (const file of migrationFiles) {
    const sql = await readFile(new URL(`../../../../${file}`, import.meta.url), "utf8");
    await pool.query(sql);
    console.log(`Applied ${file}`);
  }
} finally {
  await pool.end();
}

