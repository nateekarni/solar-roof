import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetsController } from './assets.controller.js';
import type { DatabaseService } from '../../database/database.service.js';
import type { MqttIngestionService } from '../telemetry/mqtt-ingestion.service.js';

function fixture() {
  type Organization={id:string;name:string;code:string;status?:string;updatedAt?:string;legalName?:string;taxId?:string;taxBranch?:string;taxAddress?:string;contactName?:string;phone?:string;documentEmail?:string};
  type Site={id:string;customerId:string;name:string};
  const organizations = new Map<string, Organization>();
  const sites = new Map<string, Site>();
  const statements: string[] = [];
  const lockQueues=new Map<string,Promise<void>>();
  async function acquire(key:string){
    const previous=lockQueues.get(key)??Promise.resolve();
    let unlock!:()=>void;const next=new Promise<void>(resolve=>{unlock=resolve;});
    lockQueues.set(key,next);await previous;return unlock;
  }
  const execute=async(sql:string,values:unknown[],orgView:Map<string,Organization>,siteView:Map<string,Site>)=>{
    statements.push(sql);
    if(sql.includes('FROM customers WHERE lower'))return {rows:[...orgView.values()].filter(o=>o.name.trim().toLowerCase()===String(values[0]).trim().toLowerCase()).map(o=>({...o,status:o.status??'active'}))};
    if(sql.includes('FROM customers WHERE id'))return {rows:[...orgView.values()].filter(o=>o.id===values[0]).map(o=>({...o,status:o.status??'active'}))};
    if(sql.includes('FROM sites WHERE customer_id'))return {rows:[...siteView.values()].filter(s=>s.customerId===values[0]&&s.id!==values[1])};
    if(sql.includes('FROM sites WHERE id'))return {rows:[...siteView.values()].filter(s=>s.id===values[0]).map(s=>({...s,customer_id:s.customerId}))};
    if(sql.includes('INSERT INTO customers')){
      if([...orgView.values()].some(o=>o.code.toLowerCase()===String(values[2]).toLowerCase()))throw Object.assign(new Error('duplicate code'),{code:'23505',constraint:'customers_code_normalized_unique'});
      const record={id:String(values[0]),name:String(values[1]),code:String(values[2]),legalName:String(values[4]),taxId:String(values[5]),taxBranch:String(values[6]),taxAddress:String(values[7]),contactName:String(values[8]),phone:String(values[9]),documentEmail:String(values[10]),updatedAt:'2026-10-08 00:00:00.123456+00'};
      orgView.set(record.id,record);return {rows:[record]};
    }
    if(sql.includes('INSERT INTO sites')){
      if(values[2]==='Fail site')throw new Error('site insert failed');
      const record={id:String(values[0]),customerId:String(values[1]),name:String(values[2])};siteView.set(record.id,record);return {rows:[record]};
    }
    if(sql.includes('UPDATE customers SET name')){
      if(sql.includes('expected')||sql.includes('updated_at=$11')){
        const record=orgView.get(String(values[0]));
        if(!record||record.updatedAt!==values[10])return {rows:[]};
        Object.assign(record,{name:values[1],code:values[2],legalName:values[3],taxId:values[4],taxBranch:values[5],taxAddress:values[6],contactName:values[7],phone:values[8],documentEmail:values[9],updatedAt:'2026-10-08 00:00:01.654321+00'});
        return {rows:[{...record}]};
      }
      const record=orgView.get(siteView.get(String(values[1]))?.customerId??String(values[1]));if(record)record.name=String(values[0]);
    }
    return {rows:[]};
  };
  const query=(sql:string,values:unknown[]=[])=>execute(sql,values,organizations,sites);
  const db={query,pool:{connect:async()=>{
    const pendingOrganizations=new Map<string,Organization>(),pendingSites=new Map<string,Site>(),unlocks:Array<()=>void>=[];
    return {query:async(sql:string,values:unknown[]=[])=>{
      if(sql.includes('pg_advisory_xact_lock')){statements.push(sql);unlocks.push(await acquire(String(values[0])));return {rows:[]};}
      if(sql.includes('FROM customers WHERE id')&&sql.includes('FOR UPDATE'))unlocks.push(await acquire('customer:'+String(values[0])));
      if(sql.includes('INSERT INTO customers'))unlocks.push(await acquire('code:'+String(values[2]).toLowerCase()));
      if(sql==='COMMIT'){for(const [id,value]of pendingOrganizations)organizations.set(id,value);for(const [id,value]of pendingSites)sites.set(id,value);while(unlocks.length)unlocks.pop()!();return {rows:[]};}
      if(sql==='ROLLBACK'){pendingOrganizations.clear();pendingSites.clear();while(unlocks.length)unlocks.pop()!();return {rows:[]};}
      const orgView=new Map([...organizations,...pendingOrganizations]),siteView=new Map([...sites,...pendingSites]);
      const result=await execute(sql,values,orgView,siteView);
      if(sql.includes('INSERT INTO customers'))for(const row of result.rows)pendingOrganizations.set(row.id,row as Organization);
      if(sql.includes('INSERT INTO sites'))for(const row of result.rows)pendingSites.set(row.id,row as Site);
      return result;
    },release(){while(unlocks.length)unlocks.pop()!();}};
  }}};
  Object.assign(db,{transaction:async(work:(client:Awaited<ReturnType<typeof db.pool.connect>>)=>Promise<unknown>)=>{const client=await db.pool.connect();try{await client.query('BEGIN');const result=await work(client);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}});
  const controller=new AssetsController(db as unknown as DatabaseService,{refreshSubscriptions:async()=>{},publishHardwareConfig:async()=>false} as unknown as MqttIngestionService);
  return {controller,organizations,sites,statements};
}
const site=(name='First')=>({name,gatewayName:'GW-'+name,deviceSerial:'SN-'+name,customerName:'Customer'});

test('an organization selected by ID rejects a second site without renaming the master',async()=>{
  const f=fixture(); const first=await f.controller.createSite(site());
  await assert.rejects(f.controller.createSite({...site('Second'),customerId:first.customerId,customerName:'Accidental rename'}),/already.*site/i);
  assert.equal(f.sites.size,1); assert.equal(f.organizations.size,1); assert.equal([...f.organizations.values()][0]?.name,'Customer');
});
test('new customer stores the edited ORG code only with a successful site save',async()=>{
  const f=fixture();
  const created=await f.controller.createSite({...site(),newOrganization:{name:'New customer',code:'ORG-CUSTOM'}});
  assert.equal(f.organizations.get(created.customerId)?.code,'ORG-CUSTOM');
  assert.equal(f.organizations.get(created.customerId)?.name,'New customer');
  await assert.rejects(f.controller.createSite({...site('Fail site'),newOrganization:{name:'Rollback customer',code:'ORG-ROLLBACK'}}),/site insert failed/);
  assert.equal([...f.organizations.values()].filter(o=>o.code==='ORG-ROLLBACK').length,0);
});
test('concurrent name-only creation permits only one site for the organization',async()=>{
  const f=fixture(); const results=await Promise.allSettled([f.controller.createSite(site('A')),f.controller.createSite(site('B'))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1); assert.equal(f.organizations.size,1); assert.equal(f.sites.size,1);
  assert.match([...f.organizations.values()][0]!.code,/^ORG-/);
});

test('business creation inserts new document identity and rolls it back if the site insert fails',async()=>{
 const f=fixture();const result=await f.controller.createSite({name:'Business site',newOrganization:{name:'Business customer',code:'ORG-BUSINESS',legalName:'Legal name',taxId:'1234567890123',taxBranch:'00000',taxAddress:'Address',contactName:'Contact',phone:'0200',documentEmail:'bill@example.com'},capacityMwp:0.2,latitude:13.7,longitude:100.5});
 assert.equal(f.organizations.get(result.customerId)?.code,'ORG-BUSINESS');assert.equal(result.configDelivery,'pending');
 const identity=f.organizations.get(result.customerId)!;assert.equal(identity.legalName,'Legal name');assert.equal(identity.taxId,'1234567890123');assert.equal(identity.taxBranch,'00000');assert.equal(identity.taxAddress,'Address');assert.equal(identity.contactName,'Contact');assert.equal(identity.phone,'0200');assert.equal(identity.documentEmail,'bill@example.com');
 assert.ok(!f.statements.some(sql=>sql.includes('INSERT INTO gateways')));
 await assert.rejects(f.controller.createSite({name:'Fail site',newOrganization:{name:'Rollback business'}}),/site insert failed/);
 assert.equal(f.organizations.size,1);assert.equal(f.sites.size,1);
});

test('inactive customers reject new attachments while historical same-customer edits remain valid',async()=>{
 const f=fixture();f.organizations.set('inactive',{id:'inactive',name:'Inactive',code:'ORG-INACTIVE',status:'inactive'});
 await assert.rejects(f.controller.createSite({name:'Business',customerId:'inactive'}),/active organization/i);
 await assert.rejects(f.controller.createSite({...site('Technical'),customerId:'inactive'}),/active organization/i);
 f.sites.set('legacy',{id:'legacy',name:'Legacy',customerId:'inactive'});
 await f.controller.updateSite('legacy',{name:'Updated legacy',customerId:'inactive'});
 assert.equal(f.sites.size,1);
});

test('concurrent existing customer attachment permits one site across business and technical paths',async()=>{
 const f=fixture();f.organizations.set('unattached',{id:'unattached',name:'Unattached',code:'ORG-UNATTACHED'});
 const results=await Promise.allSettled([f.controller.createSite({name:'Business',customerId:'unattached'}),f.controller.createSite({...site('Technical'),customerId:'unattached'})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.sites.size,1);
 const rejected=results.find(r=>r.status==='rejected');assert.ok(rejected?.status==='rejected');assert.match(rejected.reason.message,/already.*site/i);
});

test('changed customer cannot be reassigned to a second site, but same-customer legacy edits remain valid',async()=>{
 const f=fixture();const first=await f.controller.createSite({...site(),newOrganization:{name:'First customer'}});
 const second=await f.controller.createSite({...site('Second'),newOrganization:{name:'Second customer'}});
 await assert.rejects(f.controller.updateSite(second.id,{customerId:first.customerId}),/already.*site/i);
 f.sites.set('legacy',{id:'legacy',name:'Legacy',customerId:first.customerId});
 await f.controller.updateSite(first.id,{customerId:first.customerId,name:'Renamed'});
 assert.equal(f.sites.size,3);
});

test('invalid or incomplete coordinates fail before creating a customer on either creation path',async()=>{
 for(const technical of [false,true])for(const coordinates of [{latitude:91,longitude:100},{latitude:13,longitude:181},{latitude:13},{latitude:NaN,longitude:100},{latitude:Infinity,longitude:100},{latitude:'',longitude:100}]){
  const f=fixture();await assert.rejects(f.controller.createSite({...technical?site():{name:'Business'},newOrganization:{name:'Invalid coordinates'},...coordinates} as Parameters<AssetsController['createSite']>[0]),/coordinate|พิกัด/i);
  assert.equal(f.organizations.size,0);assert.equal(f.sites.size,0);
 }
});
test('a case-insensitive duplicate organization code rejects atomically',async()=>{
  const f=fixture();
  await f.controller.createSite({...site(),newOrganization:{name:'First customer',code:'ORG-SAME'}});
  await assert.rejects(f.controller.createSite({...site('Other'),newOrganization:{name:'Second customer',code:'org-same'}}),/organization code/i);
  assert.equal(f.organizations.size,1); assert.equal(f.sites.size,1);
});
test('site edit never writes an organization name through the legacy customerName field',async()=>{
  const f=fixture(); const created=await f.controller.createSite(site());
  await f.controller.updateSite(created.id,{name:'Updated site',customerName:'Hidden rename'});
  assert.equal([...f.organizations.values()][0]?.name,'Customer');
});


test('shared organization edits require business edit authority and explicit impact confirmation before any writes',async()=>{
 const f=fixture();
 await assert.rejects(f.controller.updateCustomer('customer-a',{name:'Changed',code:'ORG-A',impactConfirmed:true},{user:{role:'admin'}}),/not permitted/i);
 await assert.rejects(f.controller.updateCustomer('customer-a',{name:'Changed',code:'ORG-A',impactConfirmed:true},{user:{role:'operator',customerId:'customer-a'}}),/not permitted/i);
 await assert.rejects(f.controller.updateCustomer('customer-a',{name:'Changed',code:'ORG-A'},{user:{role:'owner'}}),/confirm/i);
 assert.equal(f.organizations.size,0);
});



test('concurrent conflicting explicit names return a clear conflict without merging customer identity',async()=>{
 const f=fixture();const results=await Promise.allSettled([
 f.controller.createSite({...site('A'),newOrganization:{name:'Concurrent customer',code:'ORG-A'}}),
 f.controller.createSite({...site('B'),newOrganization:{name:' concurrent customer ',code:'ORG-B'}})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const rejected=results.find(r=>r.status==='rejected');assert.ok(rejected?.status==='rejected');
 assert.equal(rejected.reason.getStatus(),409);assert.match(rejected.reason.message,/select.*existing/i);
 assert.equal(f.organizations.size,1);assert.equal(f.sites.size,1);
});
test('confirmed master updates persist document identity and stale updates cannot overwrite it',async()=>{
 const f=fixture();const siteRecord=await f.controller.createSite(site());const original=f.organizations.get(siteRecord.customerId)!;
 const updated=await f.controller.updateCustomer(original.id,{name:'Edited display',code:' org-edited ',legalName:'Legal name',taxId:'1234567890123',taxAddress:'Address',taxBranch:'00000',contactName:'Contact',phone:'0200',documentEmail:'bill@example.com',impactConfirmed:true,expectedUpdatedAt:original.updatedAt!},{user:{role:'owner'}});
 assert.equal(updated!.code,'ORG-EDITED');assert.equal(f.organizations.get(original.id)?.legalName,'Legal name');
 await assert.rejects(f.controller.updateCustomer(original.id,{name:'Stale display',code:'ORG-STale',impactConfirmed:true,expectedUpdatedAt:'2026-10-08 00:00:00.123456+00'},{user:{role:'owner'}}),/changed.*reload/i);
 assert.equal(f.organizations.get(original.id)?.name,'Edited display');
});

test('site reassignment reports a duplicate new code clearly and preserves the prior organization',async()=>{
 const f=fixture();const first=await f.controller.createSite({...site(),newOrganization:{name:'First customer',code:'ORG-FIRST'}});
 await assert.rejects(f.controller.updateSite(first.id,{newOrganization:{name:'Other customer',code:' org-first '}}),/organization code/i);
 assert.equal(f.organizations.size,1);assert.equal(f.sites.get(first.id)?.customerId,first.customerId);
});


test('simultaneous creation with the same code cannot leave two customer records',async()=>{
 const f=fixture();const results=await Promise.allSettled([
 f.controller.createSite({...site('A'),newOrganization:{name:'Customer A',code:'ORG-CONCURRENT'}}),
 f.controller.createSite({...site('B'),newOrganization:{name:'Customer B',code:'org-concurrent'}})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const rejected=results.find(r=>r.status==='rejected');assert.ok(rejected?.status==='rejected');
 assert.equal(rejected.reason.getStatus(),409);assert.match(rejected.reason.message,/organization code/i);
 assert.equal(f.organizations.size,1);assert.equal(f.sites.size,1);
});
