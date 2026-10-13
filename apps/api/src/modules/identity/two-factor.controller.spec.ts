import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import {TwoFactorController} from './two-factor.controller.js';
test('authenticator endpoints reject absent identity and unknown target fields before any service action',async()=>{
 const controller=new TwoFactorController({enroll(){throw Error('Unexpected enrollment');},status(){throw Error('Unexpected status');}} as never);
 await assert.rejects(()=>controller.status({} as never),/authenticated/);
 await assert.rejects(()=>controller.enroll({user:{id:'own'}} as never,{currentPassword:'password',userId:'other'}),/fields/);
 await assert.rejects(()=>controller.confirm({user:{id:'own'}} as never,{currentPassword:'password',code:123456},{} as never),/code/);
 await assert.rejects(()=>controller.disable({user:{id:'own'}} as never,{currentPassword:'password',code:'123456',recoveryCode:'12345678-12345678'},{} as never),/factor/);
});
