import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {assertTarget,assertOwnership,assertVolume} from './guard.mjs';
const apply=process.argv.includes('--apply');
assertTarget(process.env.DATABASE_URL,'solar_financial_flow_review');
const require=createRequire(new URL('../../apps/api/package.json',import.meta.url));const {Pool}=require('pg');
const pool=new Pool({connectionString:process.env.DATABASE_URL});
try{
assertTarget(process.env.DATABASE_URL,(await pool.query('SELECT current_database() AS name')).rows[0].name);
const count=Number((await pool.query('SELECT (SELECT count(*) FROM schools)+(SELECT count(*) FROM users)+(SELECT count(*) FROM contracts)+(SELECT count(*) FROM billing_cycles)+(SELECT count(*) FROM documents)+(SELECT count(*) FROM payments) AS count')).rows[0].count);
const owned=(await pool.query("SELECT correlation_id FROM audit_events WHERE action='LOCAL_FINANCIAL_PREREQUISITE_SEED' LIMIT 1")).rows[0]?.correlation_id;
assertOwnership(count,owned);
const names=['solar-financial-flow-review_financial-postgres','solar-financial-flow-review_financial-storage'];
const volumes=JSON.parse(execFileSync('docker',['volume','inspect',...names],{encoding:'utf8'}));
for(const v of volumes)assertVolume(v.Name,v.Labels);
console.log(JSON.stringify({verified:true,apply,project:'solar-financial-flow-review',volumes:names}));
await pool.end();
if(apply)execFileSync('docker',['compose','-f','scripts/local-financial-review/compose.yml','-p','solar-financial-flow-review','down','--volumes'],{stdio:'inherit'});
}finally{await pool.end();}

