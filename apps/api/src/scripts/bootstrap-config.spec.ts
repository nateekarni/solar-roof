import assert from 'node:assert/strict';
import test from 'node:test';
import {parseBootstrapConfig} from './bootstrap-config.js';

const valid = {DATABASE_URL:'postgresql://test:test@localhost:5432/solar_platform', BOOTSTRAP_ADMIN_EMAIL:' Admin@Example.test ', BOOTSTRAP_ADMIN_PASSWORD:'valid-bootstrap-password-123', STORAGE_ENDPOINT:'http://localhost:9000',STORAGE_REGION:'us-east-1',STORAGE_BUCKET:'solar-platform',STORAGE_ACCESS_KEY:'test-access',STORAGE_SECRET_KEY:'test-secret'};
test('normalizes bootstrap email and preserves the supplied password',()=>{
 const result=parseBootstrapConfig(valid);
 assert.equal(result.email,'admin@example.test'); assert.equal(result.password,valid.BOOTSTRAP_ADMIN_PASSWORD);
});
test('rejects absent or weak bootstrap credentials before connecting',()=>{
 for(const patch of [{BOOTSTRAP_ADMIN_PASSWORD:''},{BOOTSTRAP_ADMIN_PASSWORD:'too-short'},{BOOTSTRAP_ADMIN_EMAIL:'not-an-email'},{DATABASE_URL:''},{STORAGE_SECRET_KEY:''}]) assert.throws(()=>parseBootstrapConfig({...valid,...patch}));
});
test('validation errors do not echo secrets',()=>{
 const secret='short-secret';
 try {parseBootstrapConfig({...valid,BOOTSTRAP_ADMIN_PASSWORD:secret});assert.fail('expected invalid password');}catch(error){assert.equal(String(error).includes(secret),false);}
});
