import assert from "node:assert/strict";
import test from "node:test";
import {billingProfilePending} from "./billing-source-model";
test("binding waits for local profile edits, preset switches and activation completion",()=>{
 const current={profileDirty:false,selectedRevisionId:"rev-1",persistedRevisionId:"rev-1",busy:false};
 assert.equal(billingProfilePending(current),false);
 assert.equal(billingProfilePending({...current,profileDirty:true}),true);
 assert.equal(billingProfilePending({...current,selectedRevisionId:"rev-2"}),true);
 assert.equal(billingProfilePending({...current,busy:true}),true);
 assert.equal(billingProfilePending({...current,activatedRevisionId:"rev-2"}),true);
 assert.equal(billingProfilePending({...current,persistedRevisionId:"rev-2",selectedRevisionId:"rev-2",activatedRevisionId:"rev-2"}),false);
});
