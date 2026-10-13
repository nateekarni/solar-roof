import {assertLocalDockerTarget as assertDocker} from '../local-review/guard.mjs';
import {assertTarget} from '../local-financial-review/guard.mjs';
export function assertLocalDockerTarget(scope){
 if(scope!=='financial')throw Error('Only financial test scope is supported');
 assertTarget(process.env.DATABASE_URL,'solar_financial_flow_review');
 if(process.env.SMTP_HOST!=='127.0.0.1'||process.env.SMTP_PORT!=='11049')throw Error('Local Mailpit binding required');
 assertDocker(scope);
}
