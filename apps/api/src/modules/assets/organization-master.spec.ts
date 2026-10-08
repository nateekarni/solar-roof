import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetsController } from './assets.controller.js';
import type { DatabaseService } from '../../database/database.service.js';
import type { MqttIngestionService } from '../telemetry/mqtt-ingestion.service.js';

function fixture() {
  type Organization={id:string;name:string;code:string;updatedAt?:string;legalName?:string;taxId?:string;taxBranch?:string;taxAddress?:string;contactName?:string;phone?:string;documentEmail?:string};
  type Site={id:string;schoolId:string;name:string};
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
    if(sql.includes('FROM schools WHERE lower'))return {rows:[...orgView.values()].filter(o=>o.name.trim().toLowerCase()===String(values[0]).trim().toLowerCase())};
    if(sql.includes('FROM schools WHERE id'))return {rows:[...orgView.values()].filter(o=>o.id===values[0])};
    if(sql.includes('FROM sites WHERE school_id'))return {rows:[...siteView.values()].filter(s=>s.schoolId===values[0])};
    if(sql.includes('FROM sites WHERE id'))return {rows:[...siteView.values()].filter(s=>s.id===values[0])};
    if(sql.includes('INSERT INTO schools')){
      if([...orgView.values()].some(o=>o.code.toLowerCase()===String(values[2]).toLowerCase()))throw Object.assign(new Error('duplicate code'),{code:'23505',constraint:'schools_code_normalized_unique'});
      const record={id:String(values[0]),name:String(values[1]),code:String(values[2]),updatedAt:'2026-10-08 00:00:00.123456+00'};
      orgView.set(record.id,record);return {rows:[record]};
    }
    if(sql.includes('INSERT INTO sites')){
      if(values[2]==='Fail site')throw new Error('site insert failed');
      const record={id:String(values[0]),schoolId:String(values[1]),name:String(values[2])};siteView.set(record.id,record);return {rows:[record]};
    }
    if(sql.includes('UPDATE schools SET name')){
      if(sql.includes('expected')||sql.includes('updated_at=$11')){
        const record=orgView.get(String(values[0]));
        if(!record||record.updatedAt!==values[10])return {rows:[]};
        Object.assign(record,{name:values[1],code:values[2],legalName:values[3],taxId:values[4],taxBranch:values[5],taxAddress:values[6],contactName:values[7],phone:values[8],documentEmail:values[9],updatedAt:'2026-10-08 00:00:01.654321+00'});
        return {rows:[{...record}]};
      }
      const record=orgView.get(siteView.get(String(values[1]))?.schoolId??String(values[1]));if(record)record.name=String(values[0]);
    }
    return {rows:[]};
  };
  const query=(sql:string,values:unknown[]=[])=>execute(sql,values,organizations,sites);
  const db={query,pool:{connect:async()=>{
    const pendingOrganizations=new Map<string,Organization>(),pendingSites=new Map<string,Site>(),unlocks:Array<()=>void>=[];
    return {query:async(sql:string,values:unknown[]=[])=>{
      if(sql.includes('pg_advisory_xact_lock')){statements.push(sql);unlocks.push(await acquire(String(values[0])));return {rows:[]};}
      if(sql.includes('INSERT INTO schools'))unlocks.push(await acquire('code:'+String(values[2]).toLowerCase()));
      if(sql==='COMMIT'){for(const [id,value]of pendingOrganizations)organizations.set(id,value);for(const [id,value]of pendingSites)sites.set(id,value);while(unlocks.length)unlocks.pop()!();return {rows:[]};}
      if(sql==='ROLLBACK'){pendingOrganizations.clear();pendingSites.clear();while(unlocks.length)unlocks.pop()!();return {rows:[]};}
      const orgView=new Map([...organizations,...pendingOrganizations]),siteView=new Map([...sites,...pendingSites]);
      const result=await execute(sql,values,orgView,siteView);
      if(sql.includes('INSERT INTO schools'))for(const row of result.rows)pendingOrganizations.set(row.id,row as Organization);
      if(sql.includes('INSERT INTO sites'))for(const row of result.rows)pendingSites.set(row.id,row as Site);
      return result;
    },release(){while(unlocks.length)unlocks.pop()!();}};
  }}};
  const controller=new AssetsController(db as unknown as DatabaseService,{refreshSubscriptions:async()=>{},publishHardwareConfig:async()=>false} as unknown as MqttIngestionService);
  return {controller,organizations,sites,statements};
}
const site=(name='First')=>({name,gatewayName:'GW-'+name,deviceSerial:'SN-'+name,schoolName:'Customer'});

test('an organization selected by ID supports a second site without renaming the master',async()=>{
  const f=fixture(); const first=await f.controller.createSite(site());
  const second=await f.controller.createSite({...site('Second'),schoolId:first.schoolId,schoolName:'Accidental rename'});
  assert.equal(second.schoolId,first.schoolId); assert.equal(f.organizations.size,1); assert.equal([...f.organizations.values()][0]?.name,'Customer');
});
test('new customer stores the edited ORG code only with a successful site save',async()=>{
  const f=fixture();
  const created=await f.controller.createSite({...site(),newOrganization:{name:'New customer',code:'ORG-CUSTOM'}});
  assert.equal(f.organizations.get(created.schoolId)?.code,'ORG-CUSTOM');
  assert.equal(f.organizations.get(created.schoolId)?.name,'New customer');
  await assert.rejects(f.controller.createSite({...site('Fail site'),newOrganization:{name:'Rollback customer',code:'ORG-ROLLBACK'}}),/site insert failed/);
  assert.equal([...f.organizations.values()].filter(o=>o.code==='ORG-ROLLBACK').length,0);
});
test('concurrent name-only creation converges on one organization and different sites',async()=>{
  const f=fixture(); const [a,b]=await Promise.all([f.controller.createSite(site('A')),f.controller.createSite(site('B'))]);
  assert.equal(a.schoolId,b.schoolId); assert.equal(f.organizations.size,1); assert.equal(f.sites.size,2);
  assert.match([...f.organizations.values()][0]!.code,/^ORG-/);
});
test('a case-insensitive duplicate organization code rejects atomically',async()=>{
  const f=fixture();
  await f.controller.createSite({...site(),newOrganization:{name:'First customer',code:'ORG-SAME'}});
  await assert.rejects(f.controller.createSite({...site('Other'),newOrganization:{name:'Second customer',code:'org-same'}}),/organization code/i);
  assert.equal(f.organizations.size,1); assert.equal(f.sites.size,1);
});
test('site edit never writes an organization name through the legacy schoolName field',async()=>{
  const f=fixture(); const created=await f.controller.createSite(site());
  await f.controller.updateSite(created.id,{name:'Updated site',schoolName:'Hidden rename'});
  assert.equal([...f.organizations.values()][0]?.name,'Customer');
});


test('shared organization edits require admin authority and explicit impact confirmation before any writes',async()=>{
 const f=fixture();
 await assert.rejects(f.controller.updateSchool('customer-a',{name:'Changed',code:'ORG-A',impactConfirmed:true},{user:{role:'operator',schoolId:'customer-a'}}),/not permitted/i);
 await assert.rejects(f.controller.updateSchool('customer-a',{name:'Changed',code:'ORG-A'},{user:{role:'admin'}}),/confirm/i);
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
 const f=fixture();const siteRecord=await f.controller.createSite(site());const original=f.organizations.get(siteRecord.schoolId)!;
 const updated=await f.controller.updateSchool(original.id,{name:'Edited display',code:' org-edited ',legalName:'Legal name',taxId:'1234567890123',taxAddress:'Address',taxBranch:'00000',contactName:'Contact',phone:'0200',documentEmail:'bill@example.com',impactConfirmed:true,expectedUpdatedAt:original.updatedAt!},{user:{role:'admin'}});
 assert.equal(updated!.code,'ORG-EDITED');assert.equal(f.organizations.get(original.id)?.legalName,'Legal name');
 await assert.rejects(f.controller.updateSchool(original.id,{name:'Stale display',code:'ORG-STale',impactConfirmed:true,expectedUpdatedAt:'2026-10-08 00:00:00.123456+00'},{user:{role:'admin'}}),/changed.*reload/i);
 assert.equal(f.organizations.get(original.id)?.name,'Edited display');
});

test('site reassignment reports a duplicate new code clearly and preserves the prior organization',async()=>{
 const f=fixture();const first=await f.controller.createSite({...site(),newOrganization:{name:'First customer',code:'ORG-FIRST'}});
 await assert.rejects(f.controller.updateSite(first.id,{newOrganization:{name:'Other customer',code:' org-first '}}),/organization code/i);
 assert.equal(f.organizations.size,1);assert.equal(f.sites.get(first.id)?.schoolId,first.schoolId);
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
