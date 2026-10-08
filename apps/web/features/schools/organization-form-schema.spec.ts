import test from 'node:test';
import assert from 'node:assert/strict';
import {organizationFormSchema} from './organization-form-schema';
test('organization form validates its name and region with localized errors',()=>{
 const en=organizationFormSchema('en').safeParse({name:'x',region:''});assert.equal(en.success,false);if(!en.success){assert.equal(en.error.issues[0]?.message,'Organization name must contain at least 2 characters.');assert.equal(en.error.issues[1]?.message,'Select a region.');}
 const th=organizationFormSchema('th').safeParse({name:'x',region:''});assert.equal(th.success,false);if(!th.success)assert.match(th.error.issues[0]?.message??'',/องค์กร/);
 assert.equal(organizationFormSchema('en').safeParse({name:'Example',region:'ภาคกลาง'}).success,true);
});
