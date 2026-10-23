import assert from 'node:assert/strict';
import test from 'node:test';
import {createDemoEnergyManualBill,type DemoEnergyBillRepository,type DemoEnergyContext,type DemoEnergyCheckpoint} from './demo-energy-manual-bill.js';

const context=(valueKwh='9.500'):DemoEnergyContext=>({
 siteId:'site-a',siteCode:'SITE-001',billingSettingsVersion:'3',rateId:'rate-a',rate:'4.2500',dueDate:'2026-11-22',
 reading:{id:'reading-1',valueKwh,sourceTime:'2026-10-23T04:08:01.035Z',meterId:'meter-a',deviceId:'device-a',bindingId:'binding-a',profileRevisionId:'profile-a'},
});

function repository(options:{context?:DemoEnergyContext;prior?:DemoEnergyCheckpoint|null;existing?:DemoEnergyCheckpoint|null;continuityError?:Error}={}){
 const created:Array<{input:any;actorId:string}>=[];
 const repo:DemoEnergyBillRepository={
  withSiteLock:async(_siteCode,work)=>work(),
  loadContext:async()=>options.context??context(),
  findByClosingReading:async()=>options.existing??null,
  latestCheckpoint:async()=>options.prior??null,
  assertContinuous:async()=>{if(options.continuityError)throw options.continuityError;},
  createManualInvoice:async(input,actorId)=>{created.push({input,actorId});return {cycle:{id:'cycle-new',status:'pending_issue_approval'}};},
 };
 return {repo,created};
}

test('first demo bill explicitly starts at zero and stores a complete checkpoint',async()=>{
 const f=repository();
 const result=await createDemoEnergyManualBill({enabled:true,siteCode:'SITE-001',firstBaseline:'0',actorId:'owner-a'},f.repo);
 assert.equal(result.created,true);
 assert.equal(result.openingKwh,'0.000');
 assert.equal(result.closingKwh,'9.500');
 assert.equal(result.consumedKwh,'9.500');
 assert.equal(f.created.length,1);
 const invoice=f.created[0]!;
 assert.equal(invoice.actorId,'owner-a');
 assert.equal(invoice.input.idempotencyKey,'demo-energy-v1:site-a:reading-1');
 assert.equal(invoice.input.lines[0].quantity,'9.500');
 assert.equal(invoice.input.lines[0].unitPrice,'4.2500');
 assert.deepEqual(invoice.input.demoEnergyPrecondition,{billingSettingsVersion:'3',rateId:'rate-a',rate:'4.2500',meterId:'meter-a',deviceId:'device-a',bindingId:'binding-a',profileRevisionId:'profile-a',closingReadingId:'reading-1',closingSourceTime:'2026-10-23T04:08:01.035Z',prior:null});
 assert.deepEqual(invoice.input.lines[0].demoEnergy,{
  version:1,siteCode:'SITE-001',meterId:'meter-a',deviceId:'device-a',bindingId:'binding-a',
  openingKwh:'0.000',closingKwh:'9.500',closingReadingId:'reading-1',
  closingSourceTime:'2026-10-23T04:08:01.035Z',openingReadingId:null,openingSourceTime:null,
 });
});

test('next bill subtracts the closing checkpoint of the previously issued demo bill',async()=>{
 const prior:DemoEnergyCheckpoint={cycleId:'cycle-old',status:'approved',documentNumber:'INV-1',meterId:'meter-a',deviceId:'device-a',bindingId:'binding-a',openingKwh:'0.000',closingKwh:'9.500',closingReadingId:'reading-1',closingSourceTime:'2026-10-23T04:08:01.035Z'};
 const f=repository({context:{...context('9.800'),reading:{...context('9.800').reading,id:'reading-2',valueKwh:'9.800',sourceTime:'2026-10-23T04:18:01.035Z'}},prior});
 const result=await createDemoEnergyManualBill({enabled:true,siteCode:'SITE-001',actorId:'owner-a'},f.repo);
 assert.equal(result.consumedKwh,'0.300');
 assert.equal(f.created[0]!.input.lines[0].quantity,'0.300');
 assert.equal(f.created[0]!.input.lines[0].demoEnergy.openingReadingId,'reading-1');
});

test('replaying the same closing telemetry row returns the existing bill without creating another',async()=>{
 const existing:DemoEnergyCheckpoint={cycleId:'cycle-existing',status:'pending_issue_approval',documentNumber:null,meterId:'meter-a',deviceId:'device-a',bindingId:'binding-a',openingKwh:'0.000',closingKwh:'9.500',closingReadingId:'reading-1',closingSourceTime:'2026-10-23T04:08:01.035Z'};
 const f=repository({existing});
 const result=await createDemoEnergyManualBill({enabled:true,siteCode:'SITE-001',firstBaseline:'0',actorId:'owner-a'},f.repo);
 assert.equal(result.created,false);
 assert.equal(result.cycleId,'cycle-existing');
 assert.equal(f.created.length,0);
});

test('unsafe starts, unissued prior bills, unchanged readings and source changes are rejected',async()=>{
 await assert.rejects(createDemoEnergyManualBill({enabled:false,siteCode:'SITE-001',firstBaseline:'0',actorId:'owner-a'},repository().repo),/disabled/i);
 await assert.rejects(createDemoEnergyManualBill({enabled:true,siteCode:'SITE-001',actorId:'owner-a'},repository().repo),/first-baseline=0/i);
 await assert.rejects(createDemoEnergyManualBill({enabled:true,siteCode:'SITE-001',firstBaseline:'2',actorId:'owner-a'},repository().repo),/exactly zero/i);
 const draft:DemoEnergyCheckpoint={cycleId:'old',status:'pending_issue_approval',documentNumber:null,meterId:'meter-a',deviceId:'device-a',bindingId:'binding-a',openingKwh:'0.000',closingKwh:'9.500',closingReadingId:'r0',closingSourceTime:'2026-10-23T04:00:00Z'};
 await assert.rejects(createDemoEnergyManualBill({enabled:true,siteCode:'SITE-001',actorId:'owner-a'},repository({prior:draft}).repo),/approved and issued/i);
 const issued={...draft,status:'approved',documentNumber:'INV-1'};
 await assert.rejects(createDemoEnergyManualBill({enabled:true,siteCode:'SITE-001',actorId:'owner-a'},repository({prior:issued}).repo),/No new billable energy/i);
 const changed={...context('10.000'),reading:{...context('10.000').reading,bindingId:'binding-b'}};
 await assert.rejects(createDemoEnergyManualBill({enabled:true,siteCode:'SITE-001',actorId:'owner-a'},repository({context:changed,prior:issued}).repo),/source changed/i);
 const stale={...context('10.000'),reading:{...context('10.000').reading,id:'reading-2',valueKwh:'10.000',sourceTime:'2026-10-23T03:59:59.000Z'}};
 await assert.rejects(createDemoEnergyManualBill({enabled:true,siteCode:'SITE-001',actorId:'owner-a'},repository({context:stale,prior:issued}).repo),/not newer/i);
 const reset=repository({context:{...context('10.000'),reading:{...context('10.000').reading,id:'reading-2',valueKwh:'10.000'}},prior:issued,continuityError:new Error('Meter reset inside demo interval')});
 await assert.rejects(createDemoEnergyManualBill({enabled:true,siteCode:'SITE-001',actorId:'owner-a'},reset.repo),/reset inside/i);
 assert.equal(reset.created.length,0);
});
