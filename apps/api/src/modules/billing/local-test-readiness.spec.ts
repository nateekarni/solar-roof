import test from 'node:test';
import assert from 'node:assert/strict';
import {localTestReadiness} from './local-test-readiness.js';
test('bill revision is permitted only inside the verified local fixture gate',async()=>{
 const saved={...process.env};Object.assign(process.env,{NODE_ENV:'test',LOCAL_FINANCIAL_FIXTURE_MARKER:'solar-financial-flow-review-v1',DATABASE_URL:'postgresql://test@127.0.0.1:15449/solar_financial_flow_review',SMTP_HOST:'127.0.0.1',SMTP_PORT:'11049'});
 try{const db={query:async()=>({rows:[{id:'policy',selected_by:'reviewer',workflow_state:'verification_in_progress',workflow_evidence:{runId:'run',startedAt:'date',purpose:'real_api_workflow_verification'}}]})};assert.ok((await localTestReadiness(db as any))?.actions.includes('adjust' as any));process.env.NODE_ENV='production';assert.equal(await localTestReadiness(db as any),null);}finally{for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});
