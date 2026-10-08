import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { createContractIdentityAutofill, type ContractIdentityField, type ContractIdentityDefaults } from './contract-identity-autofill';

function deferred(){
 let resolve!:(value:ContractIdentityDefaults)=>void, reject!:(error:Error)=>void;
 const promise=new Promise<ContractIdentityDefaults>((done,fail)=>{resolve=done;reject=fail;});
 return {promise,resolve,reject};
}
function fixture(){
 const values={companyName:'',taxId:'',branch:'',taxAddress:'',billingEmail:'',billingPhone:''};
 let loading=false;
 const errors:string[]=[],stateWrites:string[]=[];
 const requests:Array<{siteId:string;request:ReturnType<typeof deferred>}>=[];
 const workflow=createContractIdentityAutofill({
  loadDefaults:siteId=>{const request=deferred();requests.push({siteId,request});return request.promise;},
  setField:(field,value)=>{values[field]=value;stateWrites.push(field+':'+value);},
  setLoading:value=>{loading=value;stateWrites.push('loading:'+value);},
  onError:error=>{errors.push(String(error));stateWrites.push('error:'+String(error));},
 });
 return {workflow,values,errors,stateWrites,requests,get loading(){return loading;},
  edit(field:ContractIdentityField,value:string){workflow.markEdited(field);values[field]=value;},
 };
}
const defaults={companyName:'Master legal',taxId:'1234567890123',branch:'00000',taxAddress:'Master address',billingEmail:'master@example.com',billingPhone:'02'};
test('delayed organization defaults fill untouched fields while preserving typed and deliberately cleared overrides',async()=>{
 const f=fixture();f.workflow.activate({open:true,siteId:'site-a'});
 f.edit('companyName','Contract legal');f.edit('taxAddress','Contract address');
 f.edit('billingEmail','draft@example.com');f.edit('billingEmail','');
 f.requests[0]!.request.resolve(defaults);await setImmediate();
 assert.deepEqual(f.values,{companyName:'Contract legal',taxId:'1234567890123',branch:'00000',taxAddress:'Contract address',billingEmail:'',billingPhone:'02'});
 assert.equal(f.loading,false);
});
test('a locale-only redraw with unchanged site context preserves overrides without resetting or loading again',async()=>{
 const f=fixture();const context={open:true,siteId:'site-a'};
 f.workflow.activate(context);f.requests[0]!.request.resolve(defaults);await setImmediate();
 f.edit('companyName','Contract legal');f.edit('branch','');
 const before={...f.values},writes=f.stateWrites.length;
 // Locale changes rerender the form, but do not change its site/open identity context.
 f.workflow.activate({...context});
 assert.deepEqual(f.values,before);assert.equal(f.loading,false);assert.equal(f.stateWrites.length,writes);
});
test('actual selected-site changes reset identity and touch ownership while a stale result cannot affect the new customer',async()=>{
 const f=fixture();const cancel=f.workflow.activate({open:true,siteId:'site-a'});
 f.edit('companyName','Customer A override');cancel();
 f.workflow.activate({open:true,siteId:'site-b'});
 assert.deepEqual(f.values,{companyName:'',taxId:'',branch:'',taxAddress:'',billingEmail:'',billingPhone:''});
 const writes=f.stateWrites.length;
 f.requests[0]!.request.resolve(defaults);await setImmediate();
 assert.equal(f.stateWrites.length,writes);assert.equal(f.loading,true);
 f.edit('billingPhone','Customer B phone');
 f.requests[1]!.request.resolve({...defaults,companyName:'Customer B legal',taxAddress:'Customer B address'});await setImmediate();
 assert.deepEqual(f.values,{companyName:'Customer B legal',taxId:'1234567890123',branch:'00000',taxAddress:'Customer B address',billingEmail:'master@example.com',billingPhone:'Customer B phone'});
});
for(const result of ['success','error'] as const)test('canceled defaults '+result+' performs no form, loading or error state writes',async()=>{
 const f=fixture();const cancel=f.workflow.activate({open:true,siteId:'site-a'});cancel();
 const writes=f.stateWrites.length;
 if(result==='success')f.requests[0]!.request.resolve(defaults);else f.requests[0]!.request.reject(new Error('Late error'));
 await setImmediate();assert.equal(f.stateWrites.length,writes);assert.deepEqual(f.errors,[]);
});
test('restarting a canceled same-site effect preserves edits and allows the active response to finish',async()=>{
 const f=fixture();const cancel=f.workflow.activate({open:true,siteId:'site-a'});cancel();
 f.edit('companyName','Contract override');f.workflow.activate({open:true,siteId:'site-a'});
 f.requests[1]!.request.resolve(defaults);await setImmediate();
 assert.equal(f.values.companyName,'Contract override');assert.equal(f.values.taxAddress,'Master address');assert.equal(f.loading,false);
});
