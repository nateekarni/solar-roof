import assert from 'node:assert/strict';
import test from 'node:test';
import {AuthService} from '../modules/identity/auth.service.js';
import {parseManualUser,createManualUser} from './manual-user.js';

const input={DATABASE_URL:'postgresql://test:test@localhost/test',USER_CREATE_ENABLED:'true',USER_EMAIL:' Admin@example.test ',USER_PASSWORD:'Manual-test-password-123!',USER_NAME:'Manual Admin',USER_ROLE:'admin'};
test('manual account creation needs explicit opt-in and exact role/school scope without revealing passwords',()=>{
 const config=parseManualUser(input);assert.equal(config.email,'admin@example.test');assert.equal(config.schoolId,null);
 for(const patch of [{USER_CREATE_ENABLED:'false'},{USER_ROLE:'superadmin'},{USER_ROLE:'school_user'},{USER_SCHOOL_ID:'a049f5de-54fb-48e8-a8f7-7bbfb4d4e608'},{USER_PASSWORD:'short-secret'}])assert.throws(()=>parseManualUser({...input,...patch}),error=>!String(error).includes('short-secret'));
 assert.equal(parseManualUser({...input,USER_ROLE:'owner'}).role,'owner');
 assert.equal(parseManualUser({...input,USER_ROLE:'school_user',USER_SCHOOL_ID:'a049f5de-54fb-48e8-a8f7-7bbfb4d4e608'}).role,'school_user');
});
test('manual Admin is created on an empty database without schools or storage and uses normal password hashing and audit',async()=>{
 const queries:Array<{sql:string;values?:unknown[]}>=[];
 const db={query:async(sql:string,values?:unknown[])=>{queries.push({sql,...(values?{values}:{})});return {rows:[]};}};
 const user=await createManualUser(db,parseManualUser(input));assert.equal(user.created,true);
 assert.equal(queries.some(q=>q.sql.includes('FROM schools')),false);
 const insert=queries.find(q=>q.sql.includes('INSERT INTO users'))!;
 assert.equal(new AuthService('','').verifyPassword(input.USER_PASSWORD,String(insert.values?.[5])),true);
 assert.equal(queries.filter(q=>q.sql.includes('INSERT INTO audit_events')).length,1);
});
test('manual seed preserves compatible account passwords and rejects changed role, inactive or missing school before writes',async()=>{
 let rows:Array<Record<string,unknown>>=[{id:'existing',role:'admin',status:'active',school_id:null,password_hash:'unchanged'}];
 const writes:string[]=[];
 const db={query:async(sql:string)=>{if(sql.startsWith('INSERT')||sql.startsWith('UPDATE'))writes.push(sql);return {rows:sql.includes('FROM users')?rows:[]};}};
 assert.equal((await createManualUser(db,parseManualUser(input))).created,false);assert.equal(writes.length,0);
 rows[0]!.role='owner';await assert.rejects(()=>createManualUser(db,parseManualUser(input)),/incompatible/);
 rows=[];await assert.rejects(()=>createManualUser(db,parseManualUser({...input,USER_ROLE:'school_user',USER_SCHOOL_ID:'a049f5de-54fb-48e8-a8f7-7bbfb4d4e608'})),/active school/);assert.equal(writes.length,0);
});
