import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
// No dotenv, truncation or production defaults. The delegated fixture verifies local Docker ownership.
if(process.argv.includes('--reset'))throw new Error('Reset seed is disabled; local demo seeding preserves existing data.');
if(process.env.NODE_ENV!=='development'||process.env.LOCAL_FINANCIAL_FIXTURE_MARKER!=='solar-financial-flow-review-v1')throw new Error('Seed only runs against the explicitly configured Docker-local demo. Load scripts/local-financial-review/environment.ps1 first.');
execFileSync(process.execPath,[fileURLToPath(new URL('../../../../scripts/local-financial-review/seed.mjs',import.meta.url))],{stdio:'inherit',env:process.env,windowsHide:true});
