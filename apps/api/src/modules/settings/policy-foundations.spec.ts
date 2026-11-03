import assert from 'node:assert/strict';
import test from 'node:test';
import {calculateLateFee,normalizeHuaweiAlarmSeed,validateLateFeePolicy} from './policy-foundations.js';
import {PolicyFoundationsController} from './policy-foundations.controller.js';

test('Huawei seed import is deterministic and requires explicit thresholds and provenance',()=>{
 const a=normalizeHuaweiAlarmSeed({provider:'huawei',provenance:{source:'Huawei supplied sheet',reference:'rev-1'},rules:[
  {code:'B',metric:'voltage',operator:'gt',threshold:250,unit:'V',severity:'critical'},
  {code:'A',metric:'temperature',operator:'gte',threshold:80,unit:'C',severity:'critical'},
 ]});
 const b=normalizeHuaweiAlarmSeed({provider:'huawei',provenance:{reference:'rev-1',source:'Huawei supplied sheet'},rules:[...a.rules].reverse()});
 assert.equal(a.contentHash,b.contentHash);assert.deepEqual(a.rules.map(rule=>rule.code),['A','B']);
 for(const seed of [{provider:'huawei',provenance:{source:'x'},rules:[{code:'A',metric:'voltage',operator:'gt',unit:'V',severity:'critical'}]},{provider:'huawei',rules:[]}])assert.throws(()=>normalizeHuaweiAlarmSeed(seed),/threshold|provenance/i);
});

test('late fee boundary is disabled and never infers a charge without approved conditions',()=>{
 const policy=validateLateFeePolicy({enabled:false,reason:'Awaiting product-owner approved rate and conditions'});
 assert.deepEqual(calculateLateFee('1000.00',policy),{status:'disabled',amount:'0.00',reason:'Awaiting product-owner approved rate and conditions'});
 assert.throws(()=>validateLateFeePolicy({enabled:true,ratePercent:'1'}),/approved calculation/i);
});

test('Huawei import stores one version for equivalent reordered seeds',async()=>{
 const versions:any[]=[],audits:any[]=[];
 const client={query:async(sql:string,args:any[]=[])=>{
  if(sql.includes('WHERE content_hash=$1'))return {rows:versions.filter(row=>row.contentHash===args[0])};
  if(sql.includes('coalesce(max(version)'))return {rows:[{version:versions.length+1}]};
  if(sql.startsWith('INSERT INTO critical_alarm_rule_versions')){const row={id:args[0],version:args[1],contentHash:args[4]};versions.push(row);return {rows:[row]};}
  if(sql.startsWith('INSERT INTO audit_events'))audits.push(args);
  return {rows:[]};
 }};
 const controller=new PolicyFoundationsController({transaction:async(run:any)=>run(client)} as any);
 const rules=[{code:'B',metric:'voltage',operator:'gt',threshold:250,unit:'V',severity:'critical'},{code:'A',metric:'temperature',operator:'gte',threshold:80,unit:'C',severity:'critical'}];
 const first=await controller.importAlarmRules({provider:'huawei',provenance:{source:'supplied file'},rules},{user:{id:'admin'}});
 const second=await controller.importAlarmRules({provider:'huawei',provenance:{source:'supplied file'},rules:[...rules].reverse()},{user:{id:'admin'}});
 assert.equal(first.version,1);assert.equal(second.unchanged,true);assert.equal(versions.length,1);assert.equal(audits.length,1);
});
