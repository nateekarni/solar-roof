import assert from 'node:assert/strict';
import test from 'node:test';
import {snapshotCompany} from './snapshot-company';
test('issued issuer details come from the saved snake-case snapshot',()=>{assert.deepEqual(snapshotCompany({company_name:'Saved issuer',tax_id:'123',branch:'Head office',address:'Saved address',phone:'456',email:'saved@example.com',logo_url:'/saved.png'}),{companyName:'Saved issuer',taxId:'123',branch:'Head office',address:'Saved address',phone:'456',email:'saved@example.com',logoUrl:'/saved.png'});});
test('missing historical issuer remains empty instead of acquiring current defaults',()=>{assert.equal(snapshotCompany(undefined).companyName,'');assert.equal(snapshotCompany({}).logoUrl,undefined);});
