import {assertTarget,assertOwnership,assertVolume} from './guard.mjs';
export async function resetReview({pool,inspect,remove,apply=false,connectionString=process.env.DATABASE_URL}){
const names=['solar-financial-flow-review_financial-postgres','solar-financial-flow-review_financial-storage'];
try{
assertTarget(connectionString,(await pool.query('SELECT current_database() AS name')).rows[0].name);
const count=Number((await pool.query('SELECT (SELECT count(*) FROM schools)+(SELECT count(*) FROM users)+(SELECT count(*) FROM contracts)+(SELECT count(*) FROM billing_cycles)+(SELECT count(*) FROM documents)+(SELECT count(*) FROM payments) AS count')).rows[0].count);
const owned=(await pool.query("SELECT correlation_id FROM audit_events WHERE action='LOCAL_FINANCIAL_PREREQUISITE_SEED' LIMIT 1")).rows[0]?.correlation_id;
assertOwnership(count,owned);
const volumes=await inspect(names);if(volumes.length!==names.length)throw Error('Both owned volumes must be inspected');
for(const volume of volumes)assertVolume(volume.Name,volume.Labels);
}finally{await pool.end();}
const result={verified:true,apply,project:'solar-financial-flow-review',volumes:names};
if(apply)await remove();return result;
}

