// Read-only preflight; does not connect to PostgreSQL or write fixture data.
import {assertLocalDockerTarget,assertReviewTarget} from './guard.mjs';
import {assertTarget} from '../local-financial-review/guard.mjs';
const scope=process.argv[2];
if(scope==='review')assertReviewTarget(process.env.DATABASE_URL,'solar_dashboard_review');
else if(scope==='financial')assertTarget(process.env.DATABASE_URL,'solar_financial_flow_review');
else throw Error('Usage: node scripts/local-review/verify-target.mjs review|financial');
assertLocalDockerTarget(scope);
console.log(`Verified owned local Docker PostgreSQL target: ${scope}. No data written.`);
