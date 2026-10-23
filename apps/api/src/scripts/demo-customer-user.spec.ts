import assert from 'node:assert/strict';
import test from 'node:test';
import {parseDemoCustomerUser} from './demo-customer-user.js';

const input={DATABASE_URL:'postgresql://test:test@localhost/test',DEMO_CUSTOMER_PROVISION_ENABLED:'true',SITE_CODE:'SITE-001',USER_EMAIL:'customer@solar.fowir',USER_PASSWORD:'Fowir-cus-2026-001',USER_NAME:'SITE-001 Customer'};
test('demo customer provisioning is explicitly gated and accepts non-interactive environment credentials',()=>{
 const parsed=parseDemoCustomerUser(input);assert.equal(parsed.siteCode,'SITE-001');assert.equal(parsed.email,'customer@solar.fowir');
 for(const patch of [{DEMO_CUSTOMER_PROVISION_ENABLED:'false'},{USER_PASSWORD:''},{SITE_CODE:''}])assert.throws(()=>parseDemoCustomerUser({...input,...patch}),error=>!String(error).includes(input.USER_PASSWORD));
});
