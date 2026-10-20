import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseService } from '../../database/database.service.js';
import type { MqttIngestionService } from '../telemetry/mqtt-ingestion.service.js';
import { AssetsController } from './assets.controller.js';
import { MeasurementComparisons } from './measurement-comparisons.js';

function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
function fixture(twoPairs=false){
 const firstLocked=deferred(),secondWaiting=deferred(),continueFirst=deferred();let gated=false,sequence=0;
 const dirty=new Set(twoPairs?['A','B']:['A']),completed:string[]=[],owners=new Map<string,Map<number,'share'|'update'>>();
 const waiting=new Map<number,number[]>(),wakeups:(()=>void)[]=[];
 const reaches=(from:number,target:number,seen=new Set<number>()):boolean=>from===target||!seen.has(from)&&
  (seen.add(from),Boolean(waiting.get(from)?.some(id=>reaches(id,target,seen))));
 const lock=async(tx:number,key:string,mode:'share'|'update',nowait=false)=>{
  while(true){const holders=owners.get(key)??new Map<number,'share'|'update'>();
   const blockers=[...holders].filter(([id,held])=>id!==tx&&(mode==='update'||held==='update')).map(([id])=>id);
   if(!blockers.length){waiting.delete(tx);holders.set(tx,mode);owners.set(key,holders);break;}
   secondWaiting.resolve();
   if(nowait)throw Object.assign(Error('parent busy'),{code:'55P03'});
   waiting.set(tx,blockers);
   if(blockers.some(id=>reaches(id,tx)))throw Object.assign(Error('simulated comparison queue/gateway deadlock'),{code:'40P01'});
   await new Promise<void>(done=>wakeups.push(done));
  }
  if(!gated){gated=true;firstLocked.resolve();await continueFirst.promise;}
 };
 const release=(tx:number)=>{waiting.delete(tx);for(const held of owners.values())held.delete(tx);wakeups.splice(0).forEach(wake=>wake());};
 const job=(pair:string)=>({id:pair,pair_id:pair,gateway_id:'gateway-'+pair,site_id:'site-'+pair,from_time:'2026-10-18T00:00:00Z',
  left_device_id:'left-'+pair,right_device_id:'right-'+pair,left_tag:'energy',right_tag:'energy',left_cadence:60,right_cadence:60,
  left_groups:{},right_groups:{},window_seconds:900,kind:'energy',relative_tolerance:0.05,absolute_floor:0.1,alert_enabled:true});
 const connect=async()=>{
  const tx=++sequence,actions:(()=>void)[]=[];let selected='A';
  const query=async(sql:string,values:unknown[]=[])=>{
   if(sql==='BEGIN'||sql.startsWith('SAVEPOINT')||sql.startsWith('RELEASE SAVEPOINT'))return {rows:[]};
   if(sql.startsWith('ROLLBACK TO SAVEPOINT')){release(tx);return {rows:[]};}
   if(sql==='ROLLBACK'){release(tx);return {rows:[]};}
   if(sql==='COMMIT'){actions.forEach(action=>action());release(tx);return {rows:[]};}
   if(sql.startsWith('SELECT q.pair_id,p.gateway_id'))return {rows:[...dirty].sort().map(pair=>({pair_id:pair,gateway_id:'gateway-'+pair,site_id:'site-'+pair}))};
   if(sql.startsWith('SELECT q.pair_id,q.from_time')){
    const pair=sql.includes('q.pair_id=$1')?String(values[0]):[...dirty].sort().find(id=>![...(owners.get('queue-'+id)?.keys()??[])].some(owner=>owner!==tx));
    if(!pair||!dirty.has(pair)||[...(owners.get('queue-'+pair)?.keys()??[])].some(owner=>owner!==tx))return {rows:[]};
    selected=pair;await lock(tx,'queue-'+pair,'update');return {rows:[job(pair)]};
   }
   if(sql.includes('FROM sites WHERE'))return {rows:[{id:values[0]}]};
   if(sql.includes('FROM gateways WHERE')){
    const id=String(values[0]);if(/FOR (UPDATE|KEY SHARE)/.test(sql))await lock(tx,id,sql.includes('FOR UPDATE')?'update':'share',sql.includes('NOWAIT'));
    return {rows:[{id,site_id:'site-'+id.at(-1),version:0,endpoint:'energy/GW/#'}]};
   }
   if(sql.includes('AS "controlManaged"'))return {rows:[{controlManaged:false}]};
   if(sql.startsWith('SELECT gateway_id,site_id FROM devices'))return {rows:[{gateway_id:'gateway-A',site_id:'site-A'}]};
   if(sql.includes('FROM devices d'))return {rows:[]};
   if(sql.includes('FROM gateway_payload_receive_revisions'))return {rows:[]};
   if(sql.includes('SELECT max('))return {rows:[{time:'2026-10-18T01:00:00Z'}]};
   if(sql.includes('SELECT value FROM system_settings'))return {rows:[{value:'3'}]};
   if(sql.includes('SELECT state,window_start'))return {rows:Array.from({length:3},()=>({state:'mismatch',window_start:'2026-10-18T00:00:00Z'}))};
   if(sql.startsWith('INSERT INTO alerts')){await lock(tx,'gateway-'+selected,'share');return {rows:[]};}
   if(sql.startsWith('INSERT INTO measurement_comparison_dirty')){await lock(tx,'queue-A','update');return {rows:[]};}
   if(sql.startsWith('DELETE FROM measurement_comparison_dirty'))actions.push(()=>{dirty.delete(selected);completed.push(selected);});
   if(sql.startsWith('UPDATE devices'))return {rows:[{id:'device'}]};
   return {rows:[]};
  };
  return {query,release(){}};
 };
 const db={pool:{connect},query:async()=>({rows:[]}),transaction:DatabaseService.prototype.transaction} as unknown as DatabaseService;
 return {worker:()=>new MeasurementComparisons(db).recomputeNext(),cadence:()=>new AssetsController(db,{} as MqttIngestionService)
  .saveDeviceCadence('device',{expectedIntervalSeconds:30,pollGroups:{energy:30}}),firstLocked,secondWaiting,continueFirst,completed};
}
const settle=<T>(work:Promise<T>)=>work.then(value=>({value,error:undefined}),error=>({value:undefined,error}));

for(const order of ['worker','cadence'] as const)test(`comparison worker and real cadence serialize ${order}-first without queue/gateway cycle`,{timeout:5000},async()=>{
 const f=fixture(),first=settle(order==='worker'?f.worker():f.cadence());await f.firstLocked.promise;
 const second=settle(order==='worker'?f.cadence():f.worker());await f.secondWaiting.promise;f.continueFirst.resolve();
 const results=await Promise.all([first,second]);assert.equal(results[0]!.error,undefined);assert.equal(results[1]!.error,undefined);
 if(!f.completed.length)assert.equal(await f.worker(),true);
 assert.deepEqual(f.completed,['A']);
});

test('concurrent workers skip unavailable queue rows and revalidate a peek before processing it',{timeout:5000},async()=>{
 const f=fixture(true),first=f.worker();await f.firstLocked.promise;
 const second=await f.worker();assert.equal(second,true);f.continueFirst.resolve();assert.equal(await first,true);
 assert.deepEqual([...f.completed].sort(),['A','B']);
});

test('a gateway busy with cadence cannot stall an unrelated comparison pair',{timeout:5000},async()=>{
 const f=fixture(true),cadence=f.cadence();await f.firstLocked.promise;
 try{assert.equal(await f.worker(),true);assert.deepEqual(f.completed,['B']);}
 finally{f.continueFirst.resolve();}
 await cadence;
});
