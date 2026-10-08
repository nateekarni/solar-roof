import assert from 'node:assert/strict';
import test from 'node:test';
import { assertContinuousBillingSource } from './billing-source-readings.js';
const row={value:'100',mapping_version_id:null,payload_profile_revision_id:'r',billing_source_binding_id:'b',quality:'complete',unit:'kWh'};
test('payload segment rejects changed binding/profile and intermediate counter reset',()=>{
 assert.doesNotThrow(()=>assertContinuousBillingSource([row,{...row,value:'200'}]));
 for(const next of [{...row,value:'99'},{...row,value:'200',billing_source_binding_id:'other'},{...row,value:'200',payload_profile_revision_id:'other'},{...row,value:null},{...row,unit:'Wh'},{...row,value:'200',quality:'invalid'}])assert.throws(()=>assertContinuousBillingSource([row,next]));
});
test('legacy segments retain register provenance and cannot mix payload evidence',()=>{
 const legacy={...row,mapping_version_id:'m',payload_profile_revision_id:null,billing_source_binding_id:null};
 assert.doesNotThrow(()=>assertContinuousBillingSource([legacy,{...legacy,value:'101'}]));
 assert.throws(()=>assertContinuousBillingSource([legacy,row]));
 assert.throws(()=>assertContinuousBillingSource([{...legacy,mapping_version_id:null}]));
});


test('legacy incomplete and wrong-unit readings cannot be skipped as usable evidence',()=>{
 const legacy={...row,mapping_version_id:'m',payload_profile_revision_id:null,billing_source_binding_id:null};
 for(const patch of [{value:null},{quality:'invalid'},{unit:'Wh'}])assert.throws(()=>assertContinuousBillingSource([legacy,{...legacy,...patch}]));
});
