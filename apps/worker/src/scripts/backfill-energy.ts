import 'reflect-metadata';
import { parseArgs } from 'node:util';
import { RefreshEnergySummaryJob } from '../jobs/refresh-energy-summary.job.js';
const {values}=parseArgs({options:{name:{type:'string'},from:{type:'string'},to:{type:'string'},pages:{type:'string',default:'32'}}});
const pages=Number(values.pages);
if(!values.name || !values.from || !values.to || !Number.isInteger(pages)||pages<1||pages>64 || !process.env.DATABASE_URL)throw new Error('Requires DATABASE_URL, --name, --from, --to and --pages 1..64');
const job=new RefreshEnergySummaryJob();
try {
 let queued=0,refreshed=0,enqueueComplete=false;
 for(let page=0;page<pages;page++) {
  const result=await job.backfill(values.name,values.from,values.to,32);queued+=result.queued;enqueueComplete=result.complete;
  refreshed+=await job.runBatch(32);if(enqueueComplete)break;
 }
 console.log(JSON.stringify({queued,refreshed,enqueueComplete,coverage:'Verify every requested device/day and reference totals before enabling ENERGY_READ_MODEL_ENABLED. Enqueue completion is not coverage proof.'}));
}finally{await job.onModuleDestroy();}
